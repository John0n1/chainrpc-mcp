import { z } from 'zod';
import { toolError, toolResult } from '../utils.js';

const txid = z.string().regex(/^[0-9a-fA-F]{64}$/, 'Expected a 32-byte transaction ID');
const blockHash = z.string().regex(/^[0-9a-fA-F]{64}$/, 'Expected a 32-byte block hash');
const rawTransaction = z.string().regex(/^(?:[0-9a-fA-F]{2})+$/, 'Expected even-length transaction hex');
const bitcoinAddress = z.string().min(14).max(90).regex(/^[a-zA-Z0-9]+$/, 'Invalid Bitcoin address characters');
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

function btcToSats(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Upstream returned an invalid BTC amount');
  return Math.round(value * 100_000_000).toString();
}

export function registerBitcoinTools(server, client, config) {
  register(server, 'btc_getBlockchainInfo', {
    description: 'Return Bitcoin network, chain height, sync, and pruning information.',
    inputSchema: z.object({}),
    annotations: readAnnotations
  }, async () => toolResult(await client.request('getblockchaininfo')));

  register(server, 'btc_getAddressBalance', {
    description: 'Scan the Bitcoin UTXO set for an address and return its confirmed spendable outputs. This is not address history and shared RPC nodes may reject concurrent scans.',
    inputSchema: z.object({ address: bitcoinAddress }),
    annotations: readAnnotations
  }, async args => {
    const result = await client.request('scantxoutset', ['start', [`addr(${args.address})`]], { retry: false });
    return toolResult({
      address: args.address,
      success: result.success,
      height: result.height,
      bestBlock: result.bestblock,
      balanceBtc: result.total_amount,
      balanceSats: btcToSats(result.total_amount),
      unspents: result.unspents
    });
  });

  register(server, 'btc_getBlock', {
    description: 'Read a Bitcoin block by height or hash with selectable verbosity.',
    inputSchema: z.object({
      block: z.union([z.number().int().nonnegative(), blockHash]),
      verbosity: z.number().int().min(0).max(3).default(1)
    }),
    annotations: readAnnotations
  }, async args => {
    const hash = typeof args.block === 'number' ? await client.request('getblockhash', [args.block]) : args.block;
    return toolResult(await client.request('getblock', [hash, args.verbosity]));
  });

  register(server, 'btc_getTransaction', {
    description: 'Read a raw Bitcoin transaction by txid. A block hash can make confirmed transaction lookup more reliable.',
    inputSchema: z.object({ txid, blockHash: blockHash.optional() }),
    annotations: readAnnotations
  }, async args => {
    const params = [args.txid, true];
    if (args.blockHash) params.push(args.blockHash);
    return toolResult(await client.request('getrawtransaction', params));
  });

  register(server, 'btc_getTxOut', {
    description: 'Read an unspent Bitcoin transaction output. Returns null when the output is spent or unknown.',
    inputSchema: z.object({
      txid,
      vout: z.number().int().nonnegative(),
      includeMempool: z.boolean().default(true)
    }),
    annotations: readAnnotations
  }, async args => toolResult(await client.request('gettxout', [args.txid, args.vout, args.includeMempool])));

  register(server, 'btc_estimateFee', {
    description: 'Estimate a Bitcoin fee rate for confirmation within a target number of blocks.',
    inputSchema: z.object({
      confirmationTarget: z.number().int().min(1).max(1008),
      mode: z.enum(['economical', 'conservative']).default('conservative')
    }),
    annotations: readAnnotations
  }, async args => toolResult(await client.request('estimatesmartfee', [args.confirmationTarget, args.mode.toUpperCase()])));

  register(server, 'btc_decodeRawTransaction', {
    description: 'Decode a serialized Bitcoin transaction without broadcasting it.',
    inputSchema: z.object({ rawTransaction }),
    annotations: readAnnotations
  }, async args => toolResult(await client.request('decoderawtransaction', [args.rawTransaction])));

  register(server, 'btc_broadcastTransaction', {
    description: 'Validate and broadcast an already-signed Bitcoin transaction. Disabled unless ALLOW_BITCOIN_BROADCAST=true; never signs or stores keys.',
    inputSchema: z.object({
      rawTransaction,
      expectedNetwork: z.enum(['main', 'test', 'signet', 'regtest']),
      maxFeeRateBtcPerKvB: z.number().nonnegative().optional(),
      confirmation: z.literal('I understand this broadcasts a real transaction')
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }, async args => {
    if (!config.allowBitcoinBroadcast) throw new Error('Bitcoin broadcasting is disabled. Set ALLOW_BITCOIN_BROADCAST=true to enable it.');
    const chain = await client.request('getblockchaininfo');
    if (chain.chain !== args.expectedNetwork) {
      throw new Error(`Network safety check failed: endpoint is ${chain.chain}, expected ${args.expectedNetwork}`);
    }
    const [preflight] = await client.request('testmempoolaccept', [[args.rawTransaction]], { retry: false });
    if (!preflight?.allowed) {
      const reason = preflight?.['reject-reason'] || preflight?.['reject-details'] || 'rejected by node policy';
      throw new Error(`Transaction preflight failed: ${reason}`);
    }
    const params = [args.rawTransaction];
    if (args.maxFeeRateBtcPerKvB !== undefined) params.push(args.maxFeeRateBtcPerKvB);
    const broadcastTxid = await client.request('sendrawtransaction', params, { retry: false });
    return toolResult({ txid: broadcastTxid, network: chain.chain, preflight });
  });
}

export { btcToSats };
