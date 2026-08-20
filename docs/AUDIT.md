# Architecture and security audit

Date: 2026-08-19
Scope: the complete pre-2.0 repository and the resulting `chainrpc-mcp` implementation

## Verification performed

- Nineteen unit and integration tests cover configuration, HTTP protections, schemas, exact integer handling, RPC errors/limits/timeouts, discovery annotations, and both transaction safety flows.
- Official SDK clients successfully connected over stdio and Streamable HTTP.
- Live PublicNode checks succeeded for Ethereum chain data, an ABI-decoded USDC call, Bitcoin chain data, and the Bitcoin genesis block.
- `npm audit --omit=dev --audit-level=high` reported no vulnerabilities at audit time.
- `npm pack --dry-run` included only the intended runtime and metadata files.
- Official `mcp-publisher` v1.8.1 reported `server.json` as valid.
