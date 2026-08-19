#!/usr/bin/env node
import 'dotenv/config';
import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createHttpApp, assertSafeHttpConfig } from './http.js';
import { createRpcClients } from './rpc-client.js';
import { buildMcpServer } from './server.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function selectedTransport(args, configured) {
  const http = args.includes('--http');
  const stdio = args.includes('--stdio');
  if (http && stdio) throw new Error('Choose only one of --http or --stdio');
  return http ? 'http' : stdio ? 'stdio' : configured;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const config = loadConfig(env);
  const transportKind = selectedTransport(args, config.transport);
  const clients = createRpcClients(config);
  if (config.legacyGethUrlUsed) console.error('[chainrpc-mcp] GETH_URL is deprecated; use EVM_RPC_URL.');

  if (transportKind === 'stdio') {
    const server = buildMcpServer({ clients, config, version: pkg.version });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const shutdown = async () => {
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return { server, transport };
  }

  assertSafeHttpConfig(config);
  const { app, closeSessions } = createHttpApp({ config, clients, version: pkg.version });
  const httpServer = app.listen(config.port, config.host, () => {
    console.error(`[chainrpc-mcp] Streamable HTTP listening on http://${config.host}:${config.port}${config.mcpPath}`);
  });
  const shutdown = async () => {
    httpServer.close();
    await closeSessions();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { httpServer, closeSessions };
}

export async function isInvokedDirectly(argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(await realpath(argv1)).href;
  } catch {
    return false;
  }
}

if (await isInvokedDirectly()) {
  main().catch(error => {
    console.error(`[chainrpc-mcp] Fatal: ${error.message}`);
    process.exitCode = 1;
  });
}
