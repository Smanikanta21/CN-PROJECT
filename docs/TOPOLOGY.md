# Network Topology

## Team – RouteX

| Mac | Person | Role(s) | IP Address |
|-----|--------|---------|------------|
| Mac 1 | **Manikanta** | DNS Server (dnsmasq) · Backend A · Client 1 | `10.7.17.157` |
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

---

## Required Requests Per Task (Evidence Checklist)

| Task | Min. Requests | Goal | Command |
|------|:---:|-------|---------|
| **Task B** – DNS works | 2 | One `dig` per client (Manikanta + Srikar) | `dig @10.7.17.157 app.routex.test` |
| **Task C** – Backends respond | 2 | Hit Backend A (`:3001`) and Backend B (`:3002`) directly | `curl http://10.7.17.157:3001/` |
| **Task D** – Load Balancer alternates | **6** | 3 rounds of Round Robin: A→B→A→B→A→B | `curl http://app.routex.test/` (×6) |
| **Task E** – TLS works | 2 | One HTTPS request each from Manikanta + Srikar | `curl -k https://app.routex.test/` |
| **Task F** – Cache-Control | 4 | Hit `/api/status` twice — 1st miss, 2nd should be cached | `curl -I http://app.routex.test/api/status` |
| **Task G** – Wireshark capture | 1+ | Capture during any of the above; export as `.pcapng` | Wireshark on `en0` |

> **Minimum total requests to send: ~17**
> Capture at least one Wireshark session per unique protocol (DNS/UDP, TCP, TLS/443).
