# IP Inventory

| Machine Role | Hostname / IP Address | Port(s) | OS / Environment | Notes |
|---|---|---|---|---|
| Mac 1 (DNS, Backend A, Client) | 10.7.17.157 | 53 (DNS), 3001 (HTTP) | macOS | Primary DNS (dnsmasq) & Backend A |
| Mac 2 (Nginx Edge) | 10.7.17.8 | 80, 443 | macOS | Nginx Reverse Proxy / Load Balancer |
| Mac 3 (Backend B, Client) | 10.7.17.37 | 3002 (HTTP) | macOS | Backend B |
