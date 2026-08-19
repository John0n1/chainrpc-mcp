export function jsonStringify(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

export function toolResult(value) {
  return { content: [{ type: 'text', text: jsonStringify(value) }] };
}

export function toolError(error) {
  const details = { error: error?.message || 'Tool execution failed' };
  if (error?.code !== undefined) details.code = error.code;
  return { isError: true, content: [{ type: 'text', text: jsonStringify(details) }] };
}

export function hexQuantity(value, name) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
    return `0x${value.toString(16)}`;
  }
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a decimal or 0x-prefixed quantity`);
  const input = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(input)) return `0x${BigInt(input).toString(16)}`;
  if (/^(0|[1-9][0-9]*)$/.test(input)) return `0x${BigInt(input).toString(16)}`;
  throw new Error(`${name} must be a non-negative decimal or canonical hex quantity`);
}

export function blockTag(value = 'latest') {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) return hexQuantity(value, 'block');
  if (typeof value === 'string' && /^(latest|earliest|pending|safe|finalized)$/.test(value)) return value;
  if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return hexQuantity(value, 'block');
  throw new Error('block must be a number, canonical hex quantity, or a standard block tag');
}

export function hexToDecimal(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error('Upstream returned an invalid hex quantity');
  return BigInt(value).toString();
}

export function withoutUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
