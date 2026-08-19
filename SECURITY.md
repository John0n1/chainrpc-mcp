# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Send a private security advisory through the repository's **Security → Advisories → Report a vulnerability** page. Include the affected version, reproduction steps, impact, and any suggested mitigation.

## Security model

`chainrpc-mcp` never accepts private keys, creates signatures, or manages wallets. Broadcast tools accept only already-signed transactions and are disabled by default. Enabling a broadcast tool grants callers access to submit transactions through its configured endpoint; protect remote MCP deployments with authentication and a network access policy.

RPC endpoints are trusted infrastructure. A malicious or compromised endpoint can return false chain data, censor requests, or observe queries. Use a node you trust for high-value decisions.
