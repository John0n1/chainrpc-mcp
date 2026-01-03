# Geth MCP Proxy

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)](https://nodejs.org/) [![Express.js](https://img.shields.io/badge/Express.js-v4-blue)](https://expressjs.com/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Introduction

This project is a Node.js proxy that exposes an Ethereum JSON-RPC endpoint (Geth) as MCP tools. It focuses on a beginner-friendly MCP surface with schema validation, readable responses, and a passthrough tool (`eth_callRaw`) for any method that is not explicitly registered.

<img width="569" height="981" alt="screenshot_vscode_3" src="https://github.com/user-attachments/assets/57a6f36e-7b15-4c2c-aa32-d064e45600fc" />

## Features

- MCP tool registration with Zod validation and friendly aliases.
- Common Ethereum RPC methods plus a small set of admin/debug/txpool helpers.
- Hex to decimal formatting for block numbers, balances, and gas prices.
- Safe-by-default transaction broadcasting (`ALLOW_SEND_RAW_TX=1` to enable).
- Health and discovery endpoints (`/`, `/health`, `/mcp`).
- Passthrough JSON-RPC via `eth_callRaw` (respects send-raw-tx safety).

## Quickstart

1. Clone and install:
   ```sh
   git clone https://github.com/John0n1/Geth-MCP-Proxy.git
   cd Geth-MCP-Proxy
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
GETH_URL=http://localhost:8545  # URL to your Geth node's JSON-RPC endpoint
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
  "geth-mcp-proxy": {
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
