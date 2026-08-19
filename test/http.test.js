import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../src/config.js';
import { assertSafeHttpConfig, createHttpApp } from '../src/http.js';

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return server;
}

test('rejects public HTTP binding without an explicit Host allowlist', () => {
  assert.throws(() => assertSafeHttpConfig(loadConfig({ HOST: '0.0.0.0' })), /ALLOWED_HOSTS/);
  assert.doesNotThrow(() => assertSafeHttpConfig(loadConfig({ HOST: '0.0.0.0', ALLOWED_HOSTS: 'mcp.example.com' })));
});

test('serves a complete MCP session over Streamable HTTP', async () => {
  const rpc = {
    request: async method => {
      if (method === 'eth_blockNumber') return '0x2a';
      throw new Error(`Unexpected RPC ${method}`);
    }
  };
  const config = loadConfig({});
  const instance = createHttpApp({ config, clients: { evm: rpc, bitcoin: rpc }, version: '2.0.0' });
  const httpServer = await listen(instance.app);
  const address = httpServer.address();
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
    const result = await client.callTool({ name: 'evm_getBlockNumber', arguments: {} });
    assert.deepEqual(JSON.parse(result.content[0].text), { blockNumber: '42', blockNumberHex: '0x2a' });
  } finally {
    await client.close();
    await instance.closeSessions();
    await new Promise(resolve => httpServer.close(resolve));
  }
});

test('requires the configured bearer token on the MCP endpoint', async () => {
  const config = loadConfig({ MCP_AUTH_TOKEN: 'test-secret' });
  const rpc = { request: async () => null };
  const instance = createHttpApp({ config, clients: { evm: rpc, bitcoin: rpc }, version: '2.0.0' });
  const httpServer = await listen(instance.app);
  const address = httpServer.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  } finally {
    await instance.closeSessions();
    await new Promise(resolve => httpServer.close(resolve));
  }
});
