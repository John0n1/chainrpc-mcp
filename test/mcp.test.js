import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { privateKeyToAccount } from 'viem/accounts';
import { buildMcpServer } from '../src/server.js';

async function withMcp(rpcHandler, run, config = {}) {
  const rpc = { request: rpcHandler };
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer({
    clients: { evm: rpc, bitcoin: rpc },
    config: { allowEvmBroadcast: false, allowBitcoinBroadcast: false, ...config },
    version: '2.0.0'
  });
  const client = new Client({ name: 'chainrpc-mcp-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('exposes distinct EVM and Bitcoin tools with annotations', async () => {
  await withMcp(async () => null, async client => {
    const result = await client.listTools();
    const names = result.tools.map(tool => tool.name);
    assert.ok(names.includes('evm_readContract'));
    assert.ok(names.includes('btc_getAddressBalance'));
    assert.ok(names.includes('evm_broadcastTransaction'));
    assert.equal(result.tools.find(tool => tool.name === 'evm_getNativeBalance').annotations.readOnlyHint, true);
    assert.equal(result.tools.find(tool => tool.name === 'btc_broadcastTransaction').annotations.destructiveHint, true);
  });
});

test('returns exact EVM balances in wei', async () => {
  await withMcp(async (method, params) => {
    assert.equal(method, 'eth_getBalance');
    assert.equal(params[1], 'latest');
    return '0xde0b6b3a7640000';
  }, async client => {
    const result = await client.callTool({
      name: 'evm_getNativeBalance',
      arguments: { address: '0x0000000000000000000000000000000000000000' }
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(JSON.parse(result.content[0].text), {
      address: '0x0000000000000000000000000000000000000000',
      block: 'latest',
      balanceWei: '1000000000000000000',
      balanceNative: '1'
    });
  });
});

test('keeps broadcasting disabled by default', async () => {
  await withMcp(async () => { throw new Error('RPC must not be called'); }, async client => {
    const result = await client.callTool({
      name: 'btc_broadcastTransaction',
      arguments: {
        rawTransaction: '00',
        expectedNetwork: 'main',
        confirmation: 'I understand this broadcasts a real transaction'
      }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /disabled/);
  });
});

test('rejects invalid tool input before reaching RPC', async () => {
  await withMcp(async () => { throw new Error('RPC must not be called'); }, async client => {
    const result = await client.callTool({ name: 'evm_getNativeBalance', arguments: { address: 'not-an-address' } });
    assert.equal(result.isError, true);
  });
});

test('Bitcoin broadcast checks network and mempool policy before the non-retried submit', async () => {
  const calls = [];
  await withMcp(async (method, params, options) => {
    calls.push({ method, params, options });
    if (method === 'getblockchaininfo') return { chain: 'main' };
    if (method === 'testmempoolaccept') return [{ allowed: true, txid: 'a'.repeat(64) }];
    if (method === 'sendrawtransaction') return 'a'.repeat(64);
    throw new Error(`Unexpected method ${method}`);
  }, async client => {
    const result = await client.callTool({
      name: 'btc_broadcastTransaction',
      arguments: {
        rawTransaction: '00',
        expectedNetwork: 'main',
        confirmation: 'I understand this broadcasts a real transaction'
      }
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(calls.map(call => call.method), ['getblockchaininfo', 'testmempoolaccept', 'sendrawtransaction']);
    assert.equal(calls[1].options.retry, false);
    assert.equal(calls[2].options.retry, false);
  }, { allowBitcoinBroadcast: true });
});

test('EVM broadcast validates, recovers, preflights, and submits signed bytes', async () => {
  const account = privateKeyToAccount('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const signed = await account.signTransaction({
    chainId: 1,
    gas: 21_000n,
    gasPrice: 1n,
    nonce: 0,
    to: '0x0000000000000000000000000000000000000001',
    value: 0n
  });
  const calls = [];
  await withMcp(async (method, params, options) => {
    calls.push({ method, params, options });
    if (method === 'eth_chainId') return '0x1';
    if (method === 'eth_estimateGas') {
      assert.equal(params[0].from.toLowerCase(), account.address.toLowerCase());
      return '0x5208';
    }
    if (method === 'eth_sendRawTransaction') return '0x' + 'b'.repeat(64);
    throw new Error(`Unexpected method ${method}`);
  }, async client => {
    const result = await client.callTool({
      name: 'evm_broadcastTransaction',
      arguments: {
        rawTransaction: signed,
        expectedChainId: 1,
        confirmation: 'I understand this broadcasts a real transaction'
      }
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(calls.map(call => call.method), ['eth_chainId', 'eth_estimateGas', 'eth_sendRawTransaction']);
    assert.equal(calls[2].options.retry, false);
  }, { allowEvmBroadcast: true });
});
