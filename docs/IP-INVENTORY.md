# IP Inventory

| Machine Role | Hostname / IP Address | Port(s) | OS / Environment | Notes |
|---|---|---|---|---|
| DNS Server (Mac 1) | | 53 | | Primary DNS (dnsmasq) |
| Reverse Proxy (Mac 2) | | 80, 443 | | Nginx |
| Backend A (Mac 3) | | 3001 | | Node.js Express |
| Backend B (Mac 4) | | 3002 | | Node.js Express |
