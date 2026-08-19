import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBitcoinTools } from './tools/bitcoin.js';
import { registerEvmTools } from './tools/evm.js';

export const SERVER_NAME = 'chainrpc-mcp';

export function buildMcpServer({ clients, config, version }) {
  const server = new McpServer({
    name: SERVER_NAME,
    version,
    description: 'Safety-first EVM and Bitcoin tools backed by configurable JSON-RPC endpoints'
  });
  registerEvmTools(server, clients.evm, config);
  registerBitcoinTools(server, clients.bitcoin, config);
  return server;
}
