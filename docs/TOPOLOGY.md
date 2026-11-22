# Network Topology — RouteX (Phase 1 + Phase 2)

> Phase 1 (below) ran on 3 Macs because Mac 4 was damaged. Jump to [Phase 2](#phase-2--4-mac-topology) for the current layout.

## Phase 1 Team (3 Macs)

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

---

## Phase 2 — 4-Mac Topology

Mac 4 is back, so Phase 2 follows the PDF's 4-machine layout. **Backend A is the only role that moved: from Mac 1 to Mac 4.** That separates the DNS server from the backends, so a DNS failure and an application failure can be tested on their own.

| Mac | Person | Role(s) | IP Address |
|-----|--------|---------|------------|
| Mac 1 | **Abhinay (Manikanta)** | Primary DNS (dnsmasq) · Client 1 | `10.7.28.37` |
| Mac 2 | **Junaid** | Primary edge: nginx · TLS · load balancer | `10.7.27.140` |
| Mac 3 | **Srikar** | Backend B `:3002` · Backup DNS · pf · Client 2 · Wireshark | `10.7.28.31` |
| Mac 4 | **Nachiket** | Backend A `:3001` · Standby edge · pf | `10.7.19.89` |

Network: `10.7.0.0/19` · Gateway: `10.7.0.1`

| Role | Cloud equivalent |
|------|------------------|
| dnsmasq primary + backup | Route 53 (multiple name servers) |
| nginx edge (Mac 2) | AWS Application Load Balancer |
| Standby edge (Mac 4) | Blue-green target for a DNS cutover |
| Backend A / B | Two EC2 app instances in a target group |
| pf `<edges>` allow-list | Security group: allow inbound only from the LB |

```mermaid
graph TD
    subgraph Mac1["Mac 1 · Abhinay · 10.7.28.37"]
        DNS1[" Primary DNS\ndnsmasq :53 · TTL 30"]
        C1[" Client 1"]
    end

    subgraph Mac2["Mac 2 · Junaid · 10.7.27.140"]
        EDGE[" nginx edge :443\nTLS 1.3 · HTTP/2\nmax_fails=1 fail_timeout=10s\nX-Edge: primary"]
    end

    subgraph Mac3["Mac 3 · Srikar · 10.7.28.31"]
        DNS2[" Backup DNS\ndnsmasq :53 · TTL 30"]
        BB[" Backend B :3002"]
        PF3[" pf: 3002 from edges only"]
        C2[" Client 2 · Wireshark"]
    end

    subgraph Mac4["Mac 4 · Nachiket · 10.7.19.89"]
        BA[" Backend A :3001"]
        STBY[" Standby edge :443\nX-Edge: standby"]
        PF4[" pf: 3001 from edges only"]
    end

    C1 & C2 -->|"① DNS, 1st server"| DNS1
    C1 & C2 -.->|"① DNS, if Mac 1 is down"| DNS2
    C1 & C2 -->|"② HTTPS · SNI app.routex.test"| EDGE
    C1 & C2 -.->|"② after cutover (Ext E)"| STBY
    EDGE -->|"③ HTTP"| BA
    EDGE -->|"③ HTTP"| BB
    STBY -.-> BA
    STBY -.-> BB
```

### Failover request flow (Ext D)

```mermaid
sequenceDiagram
    participant C  as Client
    participant E  as nginx · Mac 2
    participant BA as Backend A · Mac 4:3001
    participant BB as Backend B · Mac 3:3002

    Note over BA: Backend A stopped (Ctrl+C)
    C->>E: GET /api/status
    E->>BA: TCP SYN
    BA-->>E: RST (connection refused)
    Note over E: max_fails=1 → A marked down for 10 s
    E->>BB: same request (proxy_next_upstream)
    BB-->>E: 200 · X-Backend: B
    E-->>C: 200 · X-Upstream: 10.7.19.89:3001, 10.7.28.31:3002
```

### Single points of failure

| Component | Redundant? | How it fails over |
|-----------|------------|-------------------|
| Backends | Yes (A + B) | Automatic: nginx passive health checks + retry (Ext D) |
| DNS | Yes (Mac 1 + Mac 3) | Client tries the next resolver (Ext A) |
| Edge | Standby only | Manual DNS cutover, delayed by the TTL (Ext E) |
| Wi-Fi router | **No** | Still a single point of failure |

Full edge HA would need a floating virtual IP (VRRP/keepalived), health-checked DNS, or a managed multi-zone load balancer.

### DNS records (Phase 2, both DNS servers)

```
address=/app.routex.test/10.7.27.140
address=/api.routex.test/10.7.27.140
local-ttl=30
```
