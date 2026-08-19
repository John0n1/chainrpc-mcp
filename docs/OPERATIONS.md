# ChainRPC MCP operations

## Production topology

```text
MCP client -> Cloudflare edge -> Cloudflare Tunnel -> nginx 127.0.0.1:3080
           -> chainrpc-mcp 127.0.0.1:3100 -> PublicNode/custom RPC
```

No inbound router port or public origin port is required. nginx and the application bind only to loopback.

## Service commands

```sh
sudo systemctl status chainrpc-mcp nginx cloudflared-chainrpc-mcp
sudo journalctl -u chainrpc-mcp -u nginx -u cloudflared-chainrpc-mcp -f
sudo systemctl restart chainrpc-mcp nginx cloudflared-chainrpc-mcp
```

Local checks:

```sh
curl http://127.0.0.1:3100/health?upstream=1
curl -H 'Host: chainrpc-mcp.mitander.io' http://127.0.0.1:3080/health?upstream=1
curl http://127.0.0.1:20241/ready
```

Public checks:

```sh
curl https://chainrpc-mcp.mitander.io/health?upstream=1
```

The public MCP endpoint is `https://chainrpc-mcp.mitander.io/mcp`.
Plain HTTP is redirected at the Cloudflare edge by a hostname-scoped Single
Redirect rule, with nginx retaining a `CF-Visitor` fallback. HSTS is scoped to
this hostname and deliberately does not include sibling subdomains.

## Updating the deployed application

Run the test suite first, stage production dependencies, atomically replace `/opt/chainrpc-mcp`, and restart `chainrpc-mcp`. Keep `/etc/chainrpc-mcp/environment` and the Cloudflare tunnel token outside the repository.

## Network dependency

Cloudflare Tunnel is outbound-only and reconnects automatically. It requires stable access to Cloudflare on port 7844 over UDP (QUIC) or TCP (HTTP/2), plus HTTPS for control-plane operations. Intermittent loss between the local DHCP/mesh node and the default gateway will make the public service unavailable even when all three local services remain healthy.

On this host, `ethtool` reports a gigabit-capable Intel `igb` interface that is
currently negotiating only 100 Mb/s. Repeated kernel `NIC Link is Down/Up`
events are physical-link events and should be investigated by replacing the
Ethernet cable and trying another router/mesh port before escalating to the
ISP. Use `ethtool enp4s0`, `ethtool -S enp4s0`, and `journalctl -k` to confirm.
