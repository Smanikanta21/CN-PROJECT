# Network Topology — RouteX Phase 1

## Team

| Mac | Person | Role(s) | IP Address |
|-----|--------|---------|------------|
| Mac 1 | **Abhinay (Manikanta)** | DNS Server (dnsmasq) · Backend A · Client 1 | `10.7.17.157` |
| Mac 2 | **Junaid** | Nginx Edge · Reverse Proxy · Load Balancer · TLS | `10.7.17.8` |
| Mac 3 | **Srikar** | Backend B · Client 2 · Wireshark capture | `10.7.17.37` |

Network: `10.7.0.0/19` · Gateway: `10.7.0.1`

---

## Architecture Diagram

```mermaid
graph TD
    subgraph Mac1["Mac 1 — Abhinay · 10.7.17.157"]
        DNS[" dnsmasq\n:53 UDP+TCP"]
        BA[" Backend A\n:3001 HTTP\nX-Backend: A"]
        C1[" Client 1"]
    end

    subgraph Mac2["Mac 2 — Junaid · 10.7.17.8"]
        EDGE[" nginx 1.31.6\n:80 HTTP · :443 HTTPS (TLS 1.3)\nRound-Robin Load Balancer"]
    end

    subgraph Mac3["Mac 3 — Srikar · 10.7.17.37"]
        BB[" Backend B\n:3002 HTTP\nX-Backend: B"]
        C2[" Client 2"]
    end

    C1 -->|"① DNS query\nA? app.routex.test"| DNS
    C2 -->|"① DNS query\nA? app.routex.test"| DNS
    DNS -->|"② Answer: 10.7.17.8"| C1
    DNS -->|"② Answer: 10.7.17.8"| C2
    C1 -->|"③ HTTPS request\nSNI: app.routex.test"| EDGE
    C2 -->|"③ HTTPS request\nSNI: app.routex.test"| EDGE
    EDGE -->|"④ HTTP upstream\n(plaintext)"| BA
    EDGE -->|"④ HTTP upstream\n(plaintext)"| BB
```

---

## Request Flow (Step by Step)

```mermaid
sequenceDiagram
    participant C  as Client (Mac 1 or 3)
    participant D  as DNS · Mac 1:53
    participant E  as Edge nginx · Mac 2
    participant BA as Backend A · Mac 1:3001
    participant BB as Backend B · Mac 3:3002

    C->>D: UDP 53 — A? app.routex.test
    D-->>C: A = 10.7.17.8

    C->>E: TCP SYN → :443
    E-->>C: SYN-ACK
    C->>E: ACK (connected)

    C->>E: TLS ClientHello
    E-->>C: ServerHello + Certificate
    C->>E: Finished (TLSv1.3)

    C->>E: GET /api/status (encrypted)
    alt Round robin — request N is odd
        E->>BA: GET /api/status (plaintext)
        BA-->>E: 200 OK  X-Backend: A
    else Round robin — request N is even
        E->>BB: GET /api/status (plaintext)
        BB-->>E: 200 OK  X-Backend: B
    end
    E-->>C: 200 OK (encrypted)
```

---

## DNS Records (`dns/dnsmasq.conf` on Mac 1)

```
address=/app.routex.test/10.7.17.8
address=/api.routex.test/10.7.17.8
```

Both names point at the **edge** (Mac 2). Clients never use a backend IP.

---

## Required Requests Per Task (Evidence Checklist)

| Task | Min. Requests | Goal | Command |
|------|:---:|-------|---------|
| **Task B** – DNS works | 2 | One `dig` per client (Manikanta + Srikar) | `dig @10.7.17.157 app.routex.test` |
| **Task C** – Backends respond | 2 | Hit Backend A (`:3001`) and Backend B (`:3002`) directly | `curl http://10.7.17.157:3001/` |
| **Task D** – Load Balancer alternates | **6** | 3 rounds of Round Robin: A→B→A→B→A→B | `curl http://app.routex.test/` (×6) |
| **Task E** – TLS works | 2 | One HTTPS request each from Manikanta + Srikar | `curl https://app.routex.test/` |
| **Task F** – Cache-Control | 4 | Hit `/api/status` twice — 1st miss (200), 2nd revalidation (304) | `curl -I https://app.routex.test/api/status` |
| **Task G** – Wireshark capture | 1+ | Capture during any of the above; export as `.pcapng` | Wireshark on `en0` |

> **Minimum total requests to send: ~17**
> Capture at least one session per protocol: DNS/UDP, TCP handshake, TLS, HTTP.
