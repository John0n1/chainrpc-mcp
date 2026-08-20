# ChainRPC MCP operations

## Production topology

```text
MCP client -> Cloudflare edge -> Cloudflare Tunnel -> nginx 127.0.0.1:3080
           -> chainrpc-mcp 127.0.0.1:3100 -> PublicNode/custom RPC
```

## Service commands

Public checks:

```sh
curl https://chainrpc-mcp.mitander.io/health?upstream=1
```

The public MCP endpoint is `https://chainrpc-mcp.mitander.io/mcp`.
Plain HTTP is redirected at the Cloudflare edge by a hostname-scoped Single
Redirect rule, with nginx retaining a `CF-Visitor` fallback. HSTS is scoped to
this hostname and deliberately does not include sibling subdomains.