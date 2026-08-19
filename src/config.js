const DEFAULT_EVM_RPC_URL = 'https://ethereum-rpc.publicnode.com';
const DEFAULT_BITCOIN_RPC_URL = 'https://bitcoin-rpc.publicnode.com';

function integer(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function boolean(env, name, fallback = false) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

function csv(raw) {
  return String(raw || '').split(',').map(value => value.trim()).filter(Boolean);
}

function endpoint(env, name, fallback) {
  const value = env[name] || fallback;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use http or https`);
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials; use the matching RPC_USERNAME/RPC_PASSWORD variables`);
  }
  return url.toString();
}

function rpcAuth(env, prefix) {
  const username = env[`${prefix}_RPC_USERNAME`];
  const password = env[`${prefix}_RPC_PASSWORD`];
  if ((username && !password) || (!username && password)) {
    throw new Error(`${prefix}_RPC_USERNAME and ${prefix}_RPC_PASSWORD must be set together`);
  }
  return username ? { username, password } : null;
}

export function loadConfig(env = process.env) {
  const legacyEvmUrl = env.GETH_URL;
  const evmRpcUrl = endpoint(env, 'EVM_RPC_URL', legacyEvmUrl || DEFAULT_EVM_RPC_URL);
  const bitcoinRpcUrl = endpoint(env, 'BITCOIN_RPC_URL', DEFAULT_BITCOIN_RPC_URL);
  const transport = env.TRANSPORT || 'stdio';
  if (!['stdio', 'http'].includes(transport)) throw new Error('TRANSPORT must be stdio or http');
  const mcpPath = env.MCP_PATH || '/mcp';
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(mcpPath)) throw new Error('MCP_PATH must be an absolute URL path');

  return Object.freeze({
    transport,
    host: env.HOST || '127.0.0.1',
    port: integer(env, 'PORT', 3000, { max: 65535 }),
    mcpPath,
    evmRpcUrl,
    bitcoinRpcUrl,
    evmRpcAuth: rpcAuth(env, 'EVM'),
    bitcoinRpcAuth: rpcAuth(env, 'BITCOIN'),
    rpcTimeoutMs: integer(env, 'RPC_TIMEOUT_MS', 12_000, { min: 500, max: 120_000 }),
    rpcRetries: integer(env, 'RPC_RETRIES', 1, { min: 0, max: 4 }),
    rpcMaxResponseBytes: integer(env, 'RPC_MAX_RESPONSE_BYTES', 10_000_000, { min: 1_024, max: 100_000_000 }),
    rpcMaxConcurrency: integer(env, 'RPC_MAX_CONCURRENCY', 20, { min: 1, max: 1_000 }),
    maxMcpSessions: integer(env, 'MAX_MCP_SESSIONS', 1_000, { min: 1, max: 100_000 }),
    httpBodyLimit: env.HTTP_BODY_LIMIT || '1mb',
    allowedHosts: csv(env.ALLOWED_HOSTS).map(value => value.toLowerCase()),
    corsOrigins: csv(env.CORS_ORIGINS),
    authToken: env.MCP_AUTH_TOKEN || null,
    allowEvmBroadcast: boolean(env, 'ALLOW_EVM_BROADCAST', false),
    allowBitcoinBroadcast: boolean(env, 'ALLOW_BITCOIN_BROADCAST', false),
    legacyGethUrlUsed: Boolean(!env.EVM_RPC_URL && legacyEvmUrl)
  });
}

export const defaults = Object.freeze({ evmRpcUrl: DEFAULT_EVM_RPC_URL, bitcoinRpcUrl: DEFAULT_BITCOIN_RPC_URL });
