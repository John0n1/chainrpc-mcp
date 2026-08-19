import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { JsonRpcClient, RpcError } from '../src/rpc-client.js';

async function withRpcServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('sends valid JSON-RPC and returns the result', async () => {
  await withRpcServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const request = JSON.parse(body);
      assert.equal(request.method, 'eth_chainId');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: '0x1' }));
    });
  }, async url => {
    const client = new JsonRpcClient({ url, name: 'test', retries: 0 });
    assert.equal(await client.request('eth_chainId'), '0x1');
  });
});

test('preserves safe upstream RPC error details', async () => {
  await withRpcServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const request = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: request.id, error: { code: -8, message: 'invalid parameter' } }));
    });
  }, async url => {
    const client = new JsonRpcClient({ url, name: 'test', retries: 0 });
    await assert.rejects(client.request('getblock'), error => error instanceof RpcError && error.code === -8);
  });
});

test('enforces response size limits', async () => {
  await withRpcServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const request = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: request.id, result: 'x'.repeat(2000) }));
    });
  }, async url => {
    const client = new JsonRpcClient({ url, name: 'test', retries: 0, maxResponseBytes: 1000 });
    await assert.rejects(client.request('method'), /exceeds/);
  });
});

test('keeps the timeout active while reading the response body', async () => {
  await withRpcServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const request = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.write(`{"id":${request.id},"result":"`);
      res.flushHeaders();
      setTimeout(() => res.end('late"}'), 100);
    });
  }, async url => {
    const client = new JsonRpcClient({ url, name: 'test', retries: 0, timeoutMs: 30 });
    await assert.rejects(client.request('slowmethod'), /timed out/);
  });
});
