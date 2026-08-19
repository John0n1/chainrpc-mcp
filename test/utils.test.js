import assert from 'node:assert/strict';
import test from 'node:test';
import { blockTag, hexQuantity, jsonStringify } from '../src/utils.js';
import { btcToSats } from '../src/tools/bitcoin.js';

test('normalizes JSON-RPC quantities without precision loss', () => {
  assert.equal(hexQuantity('18446744073709551615', 'value'), '0xffffffffffffffff');
  assert.equal(hexQuantity('0x000f', 'value'), '0xf');
  assert.equal(blockTag(42), '0x2a');
  assert.equal(blockTag('finalized'), 'finalized');
  assert.throws(() => hexQuantity(-1, 'value'), /non-negative/);
  assert.equal(blockTag('0x00'), '0x0');
});

test('serializes bigint tool results and converts BTC to satoshis', () => {
  assert.equal(jsonStringify({ value: 2n }), '{"value":"2"}');
  assert.equal(btcToSats(1.23456789), '123456789');
});
