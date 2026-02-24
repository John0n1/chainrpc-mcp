# Ethereum JSON-RPC MCP

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)](https://nodejs.org/) [![Express.js](https://img.shields.io/badge/Express.js-v4-blue)](https://expressjs.com/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Introduction

This project provides a Node.js-based proxy server designed to expose an Ethereum JSON-RPC endpoint as a suite of MCP tools. The primary objective is to offer an accessible MCP interface, featuring robust schema validation, clear and concise responses, and a passthrough utility (`eth_callRaw`) for methods not explicitly defined.

<img width="569" height="981" alt="screenshot_vscode_3" src="https://github.com/user-attachments/assets/57a6f36e-7b15-4c2c-aa32-d064e45600fc" />

## Features

- MCP tool registration, incorporating Zod validation and user-friendly aliases.
- Support for prevalent Ethereum RPC methods, augmented by a selection of administrative, debugging, and transaction pool utilities.
- Automatic conversion of hexadecimal values to decimal for block numbers, balances, and gas prices.
- Secure-by-default transaction broadcasting, with an option to enable raw transaction submission via `ALLOW_SEND_RAW_TX=1`.
- Dedicated endpoints for health monitoring and service discovery (`/`, `/health`, `/mcp`).
- JSON-RPC passthrough functionality through `eth_callRaw`, adhering to established raw transaction submission safety protocols..

## Quickstart

1. Clone and install:
   ```sh
   git clone https://github.com/John0n1/ethereum-mcp.git
   cd ethereum-mcp
   npm install
   ```

2. Copy the env template and edit `GETH_URL`:
   ```sh
   # PowerShell
   Copy-Item example.env .env

   # macOS/Linux
   cp example.env .env
   ```

3. Start the server:
   ```sh
   npm start
   ```

4. Verify connectivity:
   ```sh
   curl http://localhost:3000/health?upstream=1
   ```

5. List tools:
   ```sh
   curl -s http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

6. Call a tool:
   ```sh
   curl -s http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"getBlockNumber","arguments":{}}}'
   ```

<img width="571" height="1287" alt="screenshot_vscode_4" src="https://github.com/user-attachments/assets/0ba7b12b-df3a-421a-b8f9-269491c1427a" />

## Configuration

Create a `.env` file in the root directory:

```sh
GETH_URL=http://localhost:8545  # URL to your Geth/Nethermind node's JSON-RPC endpoint
PORT=3000                       # Optional: Server port (default: 3000)
ALLOW_SEND_RAW_TX=0             # Optional: Set to 1/true to enable transaction broadcasting
```

- **GETH_URL** is required.
- Some admin/debug methods may require Geth flags such as `--http.api` or `--ws.api`.

## Usage

- **Root**: `GET /` returns basic metadata and endpoints.
- **Health**: `GET /health` (add `?upstream=1` to verify Geth).
- **MCP**: `POST /mcp` supports `initialize`, `tools/list`, and `tools/call`.
- **Simple REST**: `GET /blockNumber` returns the current block number in hex and decimal.

## MCP Client Config

If your MCP client uses a config file, point it to the server:

```json
{
  "ethereum-mcp": {
    "url": "http://localhost:3000/mcp/",
    "type": "http",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

## Available Tools

Call `tools/list` for the live list. Highlights include:

### Core Ethereum Tools
- `eth_blockNumber` (aliases: `getBlockNumber`, `eth_getBlockNumber`)
- `eth_getBalance` (alias: `getBalance`)
- `eth_chainId` (alias: `getChainId`)
- `eth_gasPrice` (alias: `getGasPrice`)
- `eth_syncing` (aliases: `isSyncing`, `eth_isSyncing`)
- `eth_getBlockByNumber` (alias: `getBlock`)
- `eth_getTransactionByHash`
- `eth_call` (alias: `call`)
- `eth_estimateGas` (alias: `estimateGas`)
- `eth_getTransactionReceipt` (alias: `getTransactionReceipt`)
- `eth_getLogs` (alias: `getLogs`)
- `eth_getProof` (alias: `getProof`)
- `eth_sendRawTransaction` (alias: `sendRawTransaction`, gated by `ALLOW_SEND_RAW_TX`)
- `eth_callRaw` (alias: `ethCallRaw`)

Block parameters accept tags like `latest`/`pending` or decimal/hex block numbers.

### Admin Tools
- `admin_peers` (alias: `getPeers`)
- `admin_nodeInfo`

### Debug Tools
- `debug_metrics`
- `debug_traceTransaction` (alias: `traceTransaction`)
- `debug_blockProfile` (alias: `blockProfile`)
- `debug_getBlockRlp` (alias: `getBlockRlp`)

### Txpool Tools
- `txpool_status`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for bug fixes, new tools, or improvements.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
