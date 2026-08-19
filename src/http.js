import { timingSafeEqual, randomUUID } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpServer, SERVER_NAME } from './server.js';

function secureEqual(actual, expected) {
  const left = Buffer.from(actual || '');
  const right = Buffer.from(expected || '');
  return left.length === right.length && timingSafeEqual(left, right);
}

function hostnameFromHeader(value) {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function requestGuard(config) {
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
  return (req, res, next) => {
    const rawHost = String(req.headers.host || '').toLowerCase();
    const hostname = hostnameFromHeader(rawHost);
    const allowed = config.allowedHosts.length > 0
      ? config.allowedHosts.some(value => value === rawHost || value === hostname)
      : loopbackHosts.has(hostname);
    if (!allowed) return res.status(403).json({ error: 'Host header is not allowed' });

    const origin = req.headers.origin;
    if (origin) {
      if (!config.corsOrigins.includes(origin)) return res.status(403).json({ error: 'Origin is not allowed' });
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type, authorization, mcp-session-id, mcp-protocol-version');
      return res.status(204).end();
    }
    if (config.authToken) {
      const authorization = req.headers.authorization || '';
      if (!authorization.startsWith('Bearer ') || !secureEqual(authorization.slice(7), config.authToken)) {
        res.setHeader('www-authenticate', 'Bearer');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    return next();
  };
}

function jsonRpcError(res, status, code, message) {
  return res.status(status).json({ jsonrpc: '2.0', id: null, error: { code, message } });
}

export function createHttpApp({ config, clients, version, logger = console }) {
  const app = express();
  const sessions = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: config.httpBodyLimit, type: ['application/json', 'application/*+json'] }));

  app.get('/', (_req, res) => res.json({
    name: SERVER_NAME,
    version,
    status: 'ok',
    transports: { streamableHttp: config.mcpPath },
    chains: ['evm', 'bitcoin']
  }));

  app.get('/health', async (req, res) => {
    const base = {
      status: 'ok',
      name: SERVER_NAME,
      version,
      broadcast: { evm: config.allowEvmBroadcast, bitcoin: config.allowBitcoinBroadcast }
    };
    if (!['1', 'true'].includes(String(req.query.upstream).toLowerCase())) return res.json(base);
    const checks = await Promise.allSettled([
      clients.evm.request('eth_chainId'),
      clients.bitcoin.request('getblockchaininfo')
    ]);
    const upstream = {
      evm: checks[0].status === 'fulfilled' ? { ok: true, chainIdHex: checks[0].value } : { ok: false, error: checks[0].reason.message },
      bitcoin: checks[1].status === 'fulfilled' ? { ok: true, chain: checks[1].value.chain, blocks: checks[1].value.blocks } : { ok: false, error: checks[1].reason.message }
    };
    const ok = upstream.evm.ok && upstream.bitcoin.ok;
    return res.status(ok ? 200 : 503).json({ ...base, status: ok ? 'ok' : 'degraded', upstream });
  });

  app.use(config.mcpPath, requestGuard(config));
  app.all(config.mcpPath, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let record = sessionId ? sessions.get(sessionId) : undefined;

    if (!record && req.method === 'POST' && !sessionId && isInitializeRequest(req.body)) {
      if (sessions.size >= config.maxMcpSessions) {
        return jsonRpcError(res, 503, -32000, 'MCP session capacity reached');
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => sessions.set(id, { transport, server })
      });
      const server = buildMcpServer({ clients, config, version });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      transport.onerror = error => logger.error('[chainrpc-mcp] MCP transport error:', error.message);
      record = { transport, server };
      await server.connect(transport);
    }

    if (!record) {
      return jsonRpcError(res, sessionId ? 404 : 400, -32000, sessionId ? 'Unknown MCP session' : 'Initialize the MCP session first');
    }
    try {
      await record.transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('[chainrpc-mcp] Request failed:', error.message);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request body' });
    logger.error('[chainrpc-mcp] HTTP error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return {
    app,
    async closeSessions() {
      await Promise.allSettled([...sessions.values()].map(async ({ transport, server }) => {
        await transport.close();
        await server.close();
      }));
      sessions.clear();
    }
  };
}

export function assertSafeHttpConfig(config) {
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(config.host);
  if (!loopback && config.allowedHosts.length === 0) {
    throw new Error('ALLOWED_HOSTS is required when HOST is not a loopback address');
  }
}
