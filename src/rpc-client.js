import { setTimeout as delay } from 'node:timers/promises';

export class RpcError extends Error {
  constructor(message, { code, data, method, retryable = false } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
    this.method = method;
    this.retryable = retryable;
  }
}

class Semaphore {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.active += 1;
  }
  release() {
    this.active -= 1;
    this.queue.shift()?.();
  }
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RpcError(`RPC response exceeds the ${maxBytes} byte limit`);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new RpcError(`RPC response exceeds the ${maxBytes} byte limit`);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new RpcError(`RPC response exceeds the ${maxBytes} byte limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export class JsonRpcClient {
  constructor({ url, auth = null, timeoutMs = 12_000, retries = 1, maxResponseBytes = 10_000_000, maxConcurrency = 20, name }) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.maxResponseBytes = maxResponseBytes;
    this.name = name;
    this.semaphore = new Semaphore(maxConcurrency);
    this.nextId = 1;
    this.headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (auth) this.headers.authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }

  async request(method, params = [], { retry = true } = {}) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(method)) throw new RpcError('Invalid RPC method name', { method });
    if (!Array.isArray(params)) throw new RpcError('RPC params must be an array', { method });
    await this.semaphore.acquire();
    try {
      const attempts = retry ? this.retries + 1 : 1;
      let lastError;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await this.#requestOnce(method, params);
        } catch (error) {
          lastError = error;
          if (attempt + 1 >= attempts || !error.retryable) throw error;
          await delay(100 * (2 ** attempt) + Math.floor(Math.random() * 50));
        }
      }
      throw lastError;
    } finally {
      this.semaphore.release();
    }
  }

  async #requestOnce(method, params) {
    const id = this.nextId++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal
      });
      const text = await readLimitedBody(response, this.maxResponseBytes);
      if (!response.ok) {
        throw new RpcError(`${this.name} RPC returned HTTP ${response.status}`, {
          method,
          retryable: response.status === 429 || response.status >= 500
        });
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new RpcError(`${this.name} RPC returned invalid JSON`, { method });
      }
      if (!payload || typeof payload !== 'object' || payload.id !== id) throw new RpcError(`${this.name} RPC returned an invalid response`, { method });
      if (payload.error) {
        const upstreamMessage = typeof payload.error.message === 'string' ? payload.error.message : 'Unknown upstream error';
        throw new RpcError(`${this.name} RPC error: ${upstreamMessage}`, { code: payload.error.code, data: payload.error.data, method });
      }
      if (!Object.hasOwn(payload, 'result')) throw new RpcError(`${this.name} RPC response has no result`, { method });
      return payload.result;
    } catch (error) {
      if (error.name === 'AbortError') throw new RpcError(`${this.name} RPC timed out after ${this.timeoutMs}ms`, { method, retryable: true });
      if (error instanceof RpcError) throw error;
      throw new RpcError(`${this.name} RPC is unavailable`, { method, retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createRpcClients(config) {
  const shared = {
    timeoutMs: config.rpcTimeoutMs,
    retries: config.rpcRetries,
    maxResponseBytes: config.rpcMaxResponseBytes,
    maxConcurrency: config.rpcMaxConcurrency
  };
  return {
    evm: new JsonRpcClient({ ...shared, name: 'EVM', url: config.evmRpcUrl, auth: config.evmRpcAuth }),
    bitcoin: new JsonRpcClient({ ...shared, name: 'Bitcoin', url: config.bitcoinRpcUrl, auth: config.bitcoinRpcAuth })
  };
}
