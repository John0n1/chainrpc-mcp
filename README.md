# ChainRPC MCP

<!-- mcp-name: io.github.John0n1/chainrpc-mcp -->

[![npm](https://img.shields.io/npm/v/chainrpc-mcp?logo=npm)](https://www.npmjs.com/package/chainrpc-mcp)
[![CI](https://github.com/John0n1/chainrpc-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/John0n1/chainrpc-mcp/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/chainrpc-mcp)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A safety-first [Model Context Protocol](https://modelcontextprotocol.io/) server for EVM chains and Bitcoin.

ChainRPC MCP gives agents a focused set of tools for balances, blocks, transactions, logs, smart-contract reads, gas and fee estimation, and transaction decoding. It can submit **already-signed** transactions, but only behind explicit, disabled-by-default safety gates. It never accepts private keys, manages wallets, or signs transactions.

- **Two ecosystems, one server:** EVM JSON-RPC and Bitcoin Core-compatible RPC.
- **Useful without an account:** defaults to public Ethereum and Bitcoin endpoints from [PublicNode](https://publicnode.com/).
- **Bring your own infrastructure:** replace either endpoint and optionally use HTTP Basic authentication.
- **Official transports:** local stdio and stateful Streamable HTTP through the official MCP SDK.
- **Constrained by design:** no arbitrary RPC passthrough and no wallet, admin, debug, miner, or node-management methods.

## Choose how to connect

### Hosted, read-only service

The public endpoint is available now:

```text
https://chainrpc-mcp.mitander.io/mcp
```

For clients that accept a remote Streamable HTTP server:

```json
{
  "mcpServers": {
    "chainrpc-mcp": {
      "url": "https://chainrpc-mcp.mitander.io/mcp"
    }
  }
}
```

Health and upstream status:

```sh
curl 'https://chainrpc-mcp.mitander.io/health?upstream=1'
```

The hosted service is shared, rate-limited, and intentionally has both broadcast features disabled. It is suitable for evaluation and public-chain reads, but has no availability SLA. Requests are visible to the service operator and upstream RPC providers; use your own deployment for sensitive queries or production workloads.

### Local stdio server

Requirements: Node.js 20 or newer.

```sh
npx -y chainrpc-mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "chainrpc-mcp": {
      "command": "npx",
      "args": ["-y", "chainrpc-mcp"],
      "env": {
        "EVM_RPC_URL": "https://ethereum-rpc.publicnode.com",
        "BITCOIN_RPC_URL": "https://bitcoin-rpc.publicnode.com"
      }
    }
  }
}
```

The RPC variables are optional; they are shown to make the defaults explicit.

## Available tools

### EVM

| Tool | Purpose | State-changing |
|---|---|---:|
| `evm_getBlockNumber` | Return the latest block number | No |
| `evm_getChainInfo` | Return chain ID and client version | No |
| `evm_getNativeBalance` | Read a native-token balance at a block | No |
| `evm_getBlock` | Read a block by number, tag, or hash | No |
| `evm_getTransaction` | Read a transaction and receipt | No |
| `evm_call` | Execute an `eth_call` with encoded calldata | No |
| `evm_readContract` | Encode, call, and decode a function from its ABI | No |
| `evm_estimateTransaction` | Estimate gas for an unsigned transaction | No |
| `evm_getLogs` | Query event logs with address and topic filters | No |
| `evm_broadcastTransaction` | Preflight and submit signed transaction bytes | **Yes** |

Any HTTP(S) EVM JSON-RPC endpoint can be used, so the same tools work with Ethereum mainnet, testnets, and compatible chains. Results always come from the configured endpoint; callers should inspect `evm_getChainInfo` before making chain-specific assumptions.

### Bitcoin

| Tool | Purpose | State-changing |
|---|---|---:|
| `btc_getBlockchainInfo` | Return network, height, sync, and pruning information | No |
| `btc_getAddressBalance` | Scan confirmed UTXOs for an address | No |
| `btc_getBlock` | Read a block by height or hash | No |
| `btc_getTransaction` | Read raw transaction details | No |
| `btc_getTxOut` | Look up an unspent transaction output | No |
| `btc_estimateFee` | Estimate a fee rate for a confirmation target | No |
| `btc_decodeRawTransaction` | Decode serialized transaction bytes | No |
| `btc_broadcastTransaction` | Validate and submit signed transaction bytes | **Yes** |

Bitcoin Core is not an address indexer. `btc_getAddressBalance` uses `scantxoutset`, which reports currently unspent, confirmed outputs—not history or unconfirmed balance. Only one scan can run on a node at a time, so a shared endpoint may return `scan already in progress`. Use a dedicated node for frequent address scans.

## Safety model

ChainRPC MCP treats transaction submission as an exceptional operation:

- Broadcasting is off unless `ALLOW_EVM_BROADCAST` or `ALLOW_BITCOIN_BROADCAST` is explicitly enabled.
- The server accepts only serialized, already-signed transaction bytes.
- Every broadcast call requires the literal confirmation `I understand this broadcasts a real transaction`.
- EVM submission checks the endpoint and transaction chain IDs, rejects unprotected legacy transactions, recovers the signer, and runs `eth_estimateGas` first.
- Bitcoin submission checks the endpoint network and requires `testmempoolaccept` to approve the transaction.
- Submission requests are never automatically retried. A timeout can leave broadcast status ambiguous.
- Read inputs use strict schemas; upstream concurrency, timeout, retry, and response sizes are bounded.
- HTTP mode validates hosts and browser origins, supports bearer authentication, caps request bodies, and binds to loopback by default.

RPC responses are untrusted external data. A compromised endpoint can lie about chain state, censor requests, or observe queries. Independently verify high-value decisions, ideally against infrastructure you control.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and the complete trust boundary.

## Configuration

Copy [`example.env`](example.env) to `.env` when running from a checkout.

| Variable | Default | Description |
|---|---|---|
| `EVM_RPC_URL` | `https://ethereum-rpc.publicnode.com` | Any HTTP(S) EVM JSON-RPC endpoint |
| `BITCOIN_RPC_URL` | `https://bitcoin-rpc.publicnode.com` | Any HTTP(S) Bitcoin Core-compatible endpoint |
| `EVM_RPC_USERNAME` / `EVM_RPC_PASSWORD` | unset | Optional EVM HTTP Basic authentication pair |
| `BITCOIN_RPC_USERNAME` / `BITCOIN_RPC_PASSWORD` | unset | Optional Bitcoin HTTP Basic authentication pair |
| `RPC_TIMEOUT_MS` | `12000` | Per-attempt upstream timeout |
| `RPC_RETRIES` | `1` | Retry count for retryable reads only |
| `RPC_MAX_RESPONSE_BYTES` | `10000000` | Maximum upstream response body |
| `RPC_MAX_CONCURRENCY` | `20` | Maximum concurrent requests per chain client |
| `ALLOW_EVM_BROADCAST` | `false` | Enable signed EVM transaction submission |
| `ALLOW_BITCOIN_BROADCAST` | `false` | Enable signed Bitcoin transaction submission |
| `TRANSPORT` | `stdio` | Default transport: `stdio` or `http` |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | HTTP bind address and port |
| `MCP_PATH` | `/mcp` | Streamable HTTP MCP path |
| `MCP_AUTH_TOKEN` | unset | Optional bearer token for `/mcp` |
| `ALLOWED_HOSTS` | unset | Required allowlist when binding HTTP to a non-loopback address |
| `CORS_ORIGINS` | unset | Comma-separated browser-origin allowlist |
| `MAX_MCP_SESSIONS` | `1000` | Maximum concurrent HTTP MCP sessions |
| `HTTP_BODY_LIMIT` | `1mb` | Express request-body limit |

`GETH_URL` remains a deprecated compatibility alias for `EVM_RPC_URL`. Credentials embedded in RPC URLs are rejected; use the matching username and password variables.

## Self-host with Streamable HTTP

Start a loopback-only HTTP server:

```sh
npm start
curl 'http://127.0.0.1:3000/health?upstream=1'
```

To bind beyond loopback, explicitly set the host allowlist and authentication:

```sh
HOST=0.0.0.0 \
ALLOWED_HOSTS=mcp.example.com \
MCP_AUTH_TOKEN='replace-with-a-long-random-secret' \
npm start
```

Terminate TLS at a trusted reverse proxy, preserve the original `Host` header, and keep the origin private. A bearer token is useful for a single trusted client; use an OAuth-capable gateway and network access policy for multi-user deployments.

Docker defaults to stdio. Override the command for HTTP:

```sh
docker build -t chainrpc-mcp .
docker run --rm -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 \
  -e ALLOWED_HOSTS=localhost,127.0.0.1 \
  -e MCP_AUTH_TOKEN='replace-with-a-long-random-secret' \
  chainrpc-mcp --http
```

Production service topology:

```text
MCP client
    |
    v
Cloudflare edge -> outbound-only Cloudflare Tunnel -> nginx on loopback
                                                     |
                                                     v
                                              ChainRPC MCP
                                                /       \
                                               v         v
                                          EVM RPC    Bitcoin RPC
```

Deployment units, nginx configuration, hardening details, and operating commands are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Development

```sh
git clone https://github.com/John0n1/chainrpc-mcp.git
cd chainrpc-mcp
npm ci
npm run check
npm run test:coverage
```

Useful commands:

| Command | Purpose |
|---|---|
| `npm run start:stdio` | Start the stdio transport |
| `npm start` | Start Streamable HTTP |
| `npm run dev` | Start HTTP with Node watch mode |
| `npm test` | Run the test suite |
| `npm run check` | Syntax-check the entry point and run all tests |
| `npm pack --dry-run` | Inspect the npm package contents |

The detailed design and remediation record is in [docs/AUDIT.md](docs/AUDIT.md). Contributions are welcome through issues and pull requests. Please use a private GitHub security advisory—not a public issue—for suspected vulnerabilities.

## License

[MIT](LICENSE)
