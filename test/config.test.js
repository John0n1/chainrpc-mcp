import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, loadConfig } from '../src/config.js';

test('uses PublicNode defaults with safe transaction settings', () => {
  const config = loadConfig({});
  assert.equal(config.evmRpcUrl, `${defaults.evmRpcUrl}/`);
  assert.equal(config.bitcoinRpcUrl, `${defaults.bitcoinRpcUrl}/`);
  assert.equal(config.allowEvmBroadcast, false);
  assert.equal(config.allowBitcoinBroadcast, false);
  assert.equal(config.transport, 'stdio');
});

test('accepts custom endpoints and credentials', () => {
  const config = loadConfig({
    EVM_RPC_URL: 'http://127.0.0.1:8545',
    BITCOIN_RPC_URL: 'http://127.0.0.1:8332',
    BITCOIN_RPC_USERNAME: 'rpcuser',
    BITCOIN_RPC_PASSWORD: 'rpcpassword',
    ALLOW_EVM_BROADCAST: 'yes'
  });
  assert.equal(config.evmRpcUrl, 'http://127.0.0.1:8545/');
  assert.deepEqual(config.bitcoinRpcAuth, { username: 'rpcuser', password: 'rpcpassword' });
  assert.equal(config.allowEvmBroadcast, true);
});

test('supports GETH_URL as a deprecated compatibility setting', () => {
  const config = loadConfig({ GETH_URL: 'http://localhost:8545' });
  assert.equal(config.evmRpcUrl, 'http://localhost:8545/');
  assert.equal(config.legacyGethUrlUsed, true);
});

test('rejects unsafe or ambiguous configuration', () => {
  assert.throws(() => loadConfig({ EVM_RPC_URL: 'file:///tmp/socket' }), /http or https/);
  assert.throws(() => loadConfig({ EVM_RPC_URL: 'https://user:secret@example.com' }), /must not contain credentials/);
  assert.throws(() => loadConfig({ EVM_RPC_USERNAME: 'user' }), /must be set together/);
  assert.throws(() => loadConfig({ RPC_RETRIES: '10' }), /must be an integer/);
  assert.throws(() => loadConfig({ ALLOW_BITCOIN_BROADCAST: 'sometimes' }), /must be true or false/);
  assert.throws(() => loadConfig({ MCP_PATH: 'relative' }), /absolute URL path/);
});
