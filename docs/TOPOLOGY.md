# Network Topology

## Team – RouteX

| Mac | Person | Role(s) | IP Address |
|-----|--------|---------|------------|
| Mac 1 | **Abhinay** | DNS Server (dnsmasq) · Backend A · Client 1 | `10.7.17.157` |
| Mac 2 | **Junaid** | Nginx Edge · Reverse Proxy · Load Balancer | `10.7.17.8` |
| Mac 3 | **Srikar** | Backend B · Client 2 | `10.7.17.37` |

---

## Architecture Diagram

```
  Client 1 (Abhinay)                       Client 2 (Srikar)
  Mac 1 – 10.7.17.157                      Mac 3 – 10.7.17.37
         │                                        │
         │   DNS Query: app.routex.test?          │
         ├──────────────────────────────┐         │
         │                             ▼         │
         │                   DNS Server (dnsmasq) │
         │                   Mac 1 – 10.7.17.157  │
         │                   → returns 10.7.17.8  │
         │◄──────────────────────────────┘         │
         │                                         │
         │        HTTP: app.routex.test             │
         ├─────────────────────────────────────────┤
         │                                         │
         ▼                                         ▼
    ┌──────────────────────────────────────────────────┐
    │       Nginx Edge + Load Balancer (Round Robin)    │
    │             Junaid – Mac 2 – 10.7.17.8           │
    └──────────────┬────────────────────┬──────────────┘
                   │                    │
        ┌──────────▼──────┐   ┌─────────▼──────────┐
        │  Backend A       │   │  Backend B           │
        │  Abhinay (Mac 1) │   │  Srikar (Mac 3)      │
        │  10.7.17.157:3001│   │  10.7.17.37:3002     │
        │  Node.js/Express │   │  Node.js/Express     │
        └─────────────────┘   └──────────────────────┘
```

---

## DNS Records (dnsmasq.conf on Mac 1)

```
address=/app.routex.test/10.7.17.8
address=/api.routex.test/10.7.17.8
```
