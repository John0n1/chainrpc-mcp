# Architecture and security audit

Date: 2026-08-19
Scope: the complete pre-2.0 repository and the resulting `chainrpc-mcp` implementation

## Executive result

The original project demonstrated the core MCP-to-Ethereum idea, but it was not safe to expose as a production MCP service. The 2.0 rewrite replaces the custom protocol implementation, removes unrestricted and node-administration access, adds Bitcoin, separates configuration/RPC/tool concerns, and establishes testing and release controls.

No audit can prove the absence of vulnerabilities. This review covers the repository's code and documented deployment path; it does not audit PublicNode, custom RPC providers, reverse proxies, MCP clients, or transitive dependency source code.

## Findings resolved

| Severity | Original finding | Resolution |
|---|---|---|
| Critical | `eth_callRaw` could invoke arbitrary RPC methods, including dangerous namespaces; only one exact send method was gated. | Removed arbitrary passthrough and all admin/debug/txpool tools. Every reachable RPC method now has a dedicated validated tool. |
| High | The HTTP endpoint hand-implemented only part of MCP while the official SDK server was never connected to a transport. | Replaced it with official stdio and Streamable HTTP transports, including initialization, sessions, GET/POST/DELETE, and protocol negotiation. |
| High | Remote callers could submit signed Ethereum transactions after one process-wide flag, without chain binding or preflight. | Split chain flags; require exact call confirmation and expected chain ID; reject unprotected transactions; recover sender; estimate gas; never retry submission. |
| High | No request-body, response-body, or concurrency bounds existed. | Added HTTP body limits, upstream response streaming limits, per-chain concurrency bounds, timeouts covering headers and body, and an HTTP session cap. |
| High | Inputs accepted arbitrary address, hash, calldata, block, and quantity strings. | Added strict Zod schemas, EVM address validation, fixed-length hashes, even-length hex, canonical quantity conversion, log-topic limits, and incompatible-filter rejection. |
| Medium | A shared MCP server/transport design risked cross-client state and did not implement MCP sessions. | Each HTTP session now owns a distinct MCP server and transport; stdio owns one isolated pair. |
| Medium | Notifications received responses, capability data had the wrong shape, and JSON-RPC errors/statuses were inconsistent. | Delegated protocol behavior to the official SDK. |
| Medium | RPC timeouts stopped after response headers and responses were parsed without a size limit. | The abort timer now covers the full streamed body, which is cancelled when its byte limit is exceeded. |
| Medium | Transaction errors were returned as ordinary success text. | Tool failures use MCP `isError: true`; schema errors are handled by the SDK. |
| Medium | HTTP was susceptible to unsafe host/origin use and exposed implementation headers. | Added Host allowlisting, deny-by-default browser Origin handling, optional bearer auth, loopback binding, and disabled `X-Powered-By`. |
| Medium | Dependencies and releases were not reproducible; there were no tests or CI. | Committed the lockfile, added Node-version CI, dependency audit, Dependabot, 16 automated tests, pack checks, and Registry validation. |
| Low | Project/package/server names and documentation disagreed. | Unified runtime/package/config/Registry identity around `chainrpc-mcp`; retained only a documented `GETH_URL` migration alias. |

## Intentional design boundaries

- The server does not construct, sign, replace, or cancel transactions and never accepts private keys.
- One process targets one EVM endpoint and one Bitcoin endpoint. Run multiple instances for independently isolated networks.
- Bitcoin Core has no general address-index balance RPC. `btc_getAddressBalance` scans the current UTXO set and cannot report history or unconfirmed balance. Shared nodes permit only one scan at a time.
- The RPC endpoint is a trust boundary. Response correctness and privacy are properties of the selected provider, not guarantees this server can add.
- Streamable HTTP sessions are process-local. A multi-replica deployment needs load-balancer affinity, or a later move to an SDK-supported stateless architecture.
- Static bearer authentication is suitable for a private deployment but is not a complete public multi-tenant OAuth design. Put an authorization gateway in front of the remote server before public listing.

## Verification performed

- Nineteen unit and integration tests cover configuration, HTTP protections, schemas, exact integer handling, RPC errors/limits/timeouts, discovery annotations, and both transaction safety flows.
- Official SDK clients successfully connected over stdio and Streamable HTTP.
- Live PublicNode checks succeeded for Ethereum chain data, an ABI-decoded USDC call, Bitcoin chain data, and the Bitcoin genesis block.
- `npm audit --omit=dev --audit-level=high` reported no vulnerabilities at audit time.
- `npm pack --dry-run` included only the intended runtime and metadata files.
- Official `mcp-publisher` v1.8.1 reported `server.json` as valid.

## Work remaining before a public remote launch

1. Rename the GitHub repository and publish the scoped npm package.
2. Choose the production domain and authentication architecture.
3. Add reverse-proxy request/rate limits, TLS, observability, alerting, and secret rotation.
4. Run load/soak tests against the chosen infrastructure and define an uptime/error budget.
5. Add a remote entry to `server.json` only when its stable HTTPS MCP URL is operational.
