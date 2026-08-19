import {
  decodeFunctionResult,
  encodeFunctionData,
  formatEther,
  isAddress,
  parseTransaction,
  recoverTransactionAddress
} from 'viem';
import { z } from 'zod';
import { blockTag, hexQuantity, hexToDecimal, toolError, toolResult, withoutUndefined } from '../utils.js';

const address = z.string().refine(isAddress, 'Invalid EVM address');
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 32-byte 0x-prefixed hash');
const hexData = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, 'Expected even-length 0x-prefixed hex data');
const quantity = z.union([z.string(), z.number()]);
const block = z.union([z.string(), z.number()]);
const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function register(server, name, config, handler) {
  server.registerTool(name, config, async args => {
    try {
      return await handler(args);
    } catch (error) {
      return toolError(error);
    }
  });
}

function transactionRequest(args) {
  return withoutUndefined({
    from: args.from,
    to: args.to,
    data: args.data,
    value: args.valueWei === undefined ? undefined : hexQuantity(args.valueWei, 'valueWei'),
    gas: args.gas === undefined ? undefined : hexQuantity(args.gas, 'gas'),
    gasPrice: args.gasPriceWei === undefined ? undefined : hexQuantity(args.gasPriceWei, 'gasPriceWei'),
    maxFeePerGas: args.maxFeePerGasWei === undefined ? undefined : hexQuantity(args.maxFeePerGasWei, 'maxFeePerGasWei'),
    maxPriorityFeePerGas: args.maxPriorityFeePerGasWei === undefined ? undefined : hexQuantity(args.maxPriorityFeePerGasWei, 'maxPriorityFeePerGasWei')
  });
}

function parsedTransactionRequest(tx, from) {
  return withoutUndefined({
    from,
    to: tx.to || undefined,
    data: tx.data,
    value: tx.value === undefined ? undefined : hexQuantity(tx.value.toString(), 'value'),
    gas: tx.gas === undefined ? undefined : hexQuantity(tx.gas.toString(), 'gas'),
    gasPrice: tx.gasPrice === undefined ? undefined : hexQuantity(tx.gasPrice.toString(), 'gasPrice'),
    maxFeePerGas: tx.maxFeePerGas === undefined ? undefined : hexQuantity(tx.maxFeePerGas.toString(), 'maxFeePerGas'),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas === undefined ? undefined : hexQuantity(tx.maxPriorityFeePerGas.toString(), 'maxPriorityFeePerGas')
  });
}

export function registerEvmTools(server, client, config) {
  register(server, 'evm_getBlockNumber', {
    description: 'Return the latest EVM block number from the configured endpoint.',
    inputSchema: z.object({}),
    annotations: readAnnotations
  }, async () => {
    const value = await client.request('eth_blockNumber');
    return toolResult({ blockNumber: hexToDecimal(value), blockNumberHex: value });
  });

  register(server, 'evm_getChainInfo', {
    description: 'Return the EVM chain ID and upstream client version.',
    inputSchema: z.object({}),
    annotations: readAnnotations
  }, async () => {
    const [chainId, clientVersion] = await Promise.all([
      client.request('eth_chainId'),
      client.request('web3_clientVersion')
    ]);
    return toolResult({ chainId: hexToDecimal(chainId), chainIdHex: chainId, clientVersion });
  });

  register(server, 'evm_getNativeBalance', {
    description: 'Read an address native-token balance at an EVM block without requiring a wallet.',
    inputSchema: z.object({
      address,
      block: block.optional().describe('Block number or latest, earliest, pending, safe, or finalized')
    }),
    annotations: readAnnotations
  }, async args => {
    const balanceHex = await client.request('eth_getBalance', [args.address, blockTag(args.block)]);
    const balanceWei = hexToDecimal(balanceHex);
    return toolResult({ address: args.address, block: blockTag(args.block), balanceWei, balanceNative: formatEther(BigInt(balanceWei)) });
  });

  register(server, 'evm_getBlock', {
    description: 'Read an EVM block by number, tag, or block hash.',
    inputSchema: z.object({
      block: z.union([block, hash32]),
      includeTransactions: z.boolean().default(false)
    }),
    annotations: readAnnotations
  }, async args => {
    const isHash = typeof args.block === 'string' && /^0x[0-9a-fA-F]{64}$/.test(args.block);
    const result = isHash
      ? await client.request('eth_getBlockByHash', [args.block, args.includeTransactions])
      : await client.request('eth_getBlockByNumber', [blockTag(args.block), args.includeTransactions]);
    return toolResult(result);
  });

  register(server, 'evm_getTransaction', {
    description: 'Read an EVM transaction and its receipt by transaction hash.',
    inputSchema: z.object({ hash: hash32 }),
    annotations: readAnnotations
  }, async args => {
    const [transaction, receipt] = await Promise.all([
      client.request('eth_getTransactionByHash', [args.hash]),
      client.request('eth_getTransactionReceipt', [args.hash])
    ]);
    return toolResult({ transaction, receipt });
  });

  register(server, 'evm_call', {
    description: 'Run a read-only eth_call with pre-encoded calldata. This never submits a transaction.',
    inputSchema: z.object({
      to: address,
      data: hexData.default('0x'),
      from: address.optional(),
      valueWei: quantity.optional(),
      block: block.optional()
    }),
    annotations: readAnnotations
  }, async args => {
    const request = transactionRequest(args);
    const result = await client.request('eth_call', [request, blockTag(args.block)]);
    return toolResult({ result });
  });

  register(server, 'evm_readContract', {
    description: 'Encode, execute, and decode a read-only smart-contract function using a supplied JSON ABI.',
    inputSchema: z.object({
      address,
      abi: z.array(z.record(z.any())).min(1).describe('JSON ABI entries needed for this function'),
      functionName: z.string().min(1),
      args: z.array(z.any()).default([]),
      block: block.optional()
    }),
    annotations: readAnnotations
  }, async args => {
    const data = encodeFunctionData({ abi: args.abi, functionName: args.functionName, args: args.args });
    const rawResult = await client.request('eth_call', [{ to: args.address, data }, blockTag(args.block)]);
    const decoded = decodeFunctionResult({ abi: args.abi, functionName: args.functionName, data: rawResult });
    return toolResult({ address: args.address, functionName: args.functionName, result: decoded, rawResult });
  });

  register(server, 'evm_estimateTransaction', {
    description: 'Estimate gas for an unsigned EVM transaction. Values are accepted as decimal or hex quantities.',
    inputSchema: z.object({
      from: address.optional(),
      to: address.optional(),
      data: hexData.optional(),
      valueWei: quantity.optional(),
      gas: quantity.optional(),
      gasPriceWei: quantity.optional(),
      maxFeePerGasWei: quantity.optional(),
      maxPriorityFeePerGasWei: quantity.optional()
    }).refine(value => value.to || value.data, 'At least one of to or data is required'),
    annotations: readAnnotations
  }, async args => {
    const gasHex = await client.request('eth_estimateGas', [transactionRequest(args)]);
    return toolResult({ gas: hexToDecimal(gasHex), gasHex });
  });

  const topic = z.union([hash32, z.null(), z.array(hash32)]);
  register(server, 'evm_getLogs', {
    description: 'Read EVM event logs using an address/topics filter and bounded block range.',
    inputSchema: z.object({
      address: z.union([address, z.array(address).min(1)]).optional(),
      topics: z.array(topic).max(4).optional(),
      fromBlock: block.optional(),
      toBlock: block.optional(),
      blockHash: hash32.optional()
    }).refine(value => !(value.blockHash && (value.fromBlock !== undefined || value.toBlock !== undefined)), 'blockHash cannot be combined with fromBlock or toBlock'),
    annotations: readAnnotations
  }, async args => {
    const filter = withoutUndefined({
      address: args.address,
      topics: args.topics,
      blockHash: args.blockHash,
      fromBlock: args.blockHash ? undefined : blockTag(args.fromBlock ?? 'latest'),
      toBlock: args.blockHash ? undefined : blockTag(args.toBlock ?? 'latest')
    });
    return toolResult(await client.request('eth_getLogs', [filter]));
  });

  register(server, 'evm_broadcastTransaction', {
    description: 'Preflight and broadcast an already-signed EVM transaction. Disabled unless ALLOW_EVM_BROADCAST=true; never signs or stores keys.',
    inputSchema: z.object({
      rawTransaction: hexData,
      expectedChainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      confirmation: z.literal('I understand this broadcasts a real transaction')
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }, async args => {
    if (!config.allowEvmBroadcast) throw new Error('EVM broadcasting is disabled. Set ALLOW_EVM_BROADCAST=true to enable it.');
    const endpointChainHex = await client.request('eth_chainId');
    const endpointChainBigInt = BigInt(endpointChainHex);
    if (endpointChainBigInt > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Endpoint chain ID exceeds the supported safe integer range');
    const endpointChainId = Number(endpointChainBigInt);
    if (endpointChainId !== args.expectedChainId) {
      throw new Error(`Chain safety check failed: endpoint is chain ${endpointChainId}, expected ${args.expectedChainId}`);
    }
    const transaction = parseTransaction(args.rawTransaction);
    if (!transaction.r || !transaction.s) throw new Error('The raw transaction is not signed');
    if (transaction.chainId === undefined) throw new Error('Unprotected legacy transactions without a chain ID are rejected');
    if (transaction.chainId !== args.expectedChainId) {
      throw new Error(`Transaction chain ID ${transaction.chainId} does not match expected chain ${args.expectedChainId}`);
    }
    const from = await recoverTransactionAddress({ serializedTransaction: args.rawTransaction });
    const gasEstimate = await client.request('eth_estimateGas', [parsedTransactionRequest(transaction, from)]);
    const txHash = await client.request('eth_sendRawTransaction', [args.rawTransaction], { retry: false });
    return toolResult({ txHash, chainId: endpointChainId, from, preflightGasEstimate: hexToDecimal(gasEstimate) });
  });
}
