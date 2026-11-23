# IP Inventory — RouteX (Phase 1 + Phase 2)

> Jump to [Phase 2](#phase-2--4-macs) for the current 4-Mac addresses.

## Network Map

```mermaid
graph LR
    GW[" Gateway\n10.7.0.1\nDHCP / LAN Router"]

    subgraph Mac1["Mac 1 — Abhinay (Manikanta)"]
        direction TB
        M1IP[" 10.7.17.157"]
        M1DNS[" dnsmasq · :53 UDP+TCP"]
        M1BE[" Backend A · :3001 TCP"]
        M1C[" Client 1"]
    end

    subgraph Mac2["Mac 2 — Junaid"]
        direction TB
        M2IP[" 10.7.17.8"]
        M2EDGE[" nginx Edge\n:80 HTTP · :443 HTTPS\nTLSv1.3 · Round Robin LB"]
    end

    subgraph Mac3["Mac 3 — Srikar"]
        direction TB
        M3IP[" 10.7.17.37"]
        M3BE[" Backend B · :3002 TCP"]
        M3C[" Client 2 · Wireshark"]
    end

    GW --- Mac1
    GW --- Mac2
    GW --- Mac3

    Mac1 -- "DNS queries" --> M1DNS
    Mac3 -- "DNS queries" --> M1DNS
    M1DNS -- "A = 10.7.17.8" --> Mac1
    M1DNS -- "A = 10.7.17.8" --> Mac3

    Mac1 -- "HTTPS :443" --> M2EDGE
    Mac3 -- "HTTPS :443" --> M2EDGE

    M2EDGE -- "HTTP upstream" --> M1BE
    M2EDGE -- "HTTP upstream" --> M3BE
```

---

## Port Table

```mermaid
block-beta
  columns 4

  block:mac1:1
    columns 1
    h1["Mac 1 · 10.7.17.157"]:1
    p53["Port 53 · dnsmasq"]:1
    p3001["Port 3001 · Backend A"]:1
  end

  block:mac2:1
    columns 1
    h2["Mac 2 · 10.7.17.8"]:1
    p80["Port 80 · nginx HTTP"]:1
    p443["Port 443 · nginx HTTPS"]:1
  end

  block:mac3:1
    columns 1
    h3["Mac 3 · 10.7.17.37"]:1
    p3002["Port 3002 · Backend B"]:1
  end

  block:gw:1
    columns 1
    hgw["Gateway · 10.7.0.1"]:1
    pgw["DHCP (not ours)"]:1
  end
```

---

## DNS Records

```mermaid
graph LR
    A["app.routex.test"] -->|"A record"| IP["10.7.17.8\n(Mac 2 · Junaid)"]
    B["api.routex.test"] -->|"A record"| IP
```

---

## IP Change Protocol

```mermaid
flowchart TD
    START([" IP Changed!"])
    F1["Edit dns/dnsmasq.conf\nlisten-address + address= records"]
    F2["Edit nginx/nginx.conf\nupstream block IPs"]
    F3["Edit visualizer/script.js\nNET constant at top"]
    R1["sudo brew services restart dnsmasq\n(Mac 1)"]
    R2["nginx -t && sudo nginx -s reload\n(Mac 2)"]
    R3["Flush DNS caches on clients\ndscacheutil -flushcache"]
    TEST["dig app.routex.test\ncurl -I https://app.routex.test/"]
    DONE([" System restored"])

    START --> F1 & F2 & F3
    F1 --> R1
    F2 --> R2
    F1 --> R3
    R1 & R2 & R3 --> TEST
    TEST --> DONE
```

---

# Phase 2 — 4 Macs

> Phase 1 (above) ran on 3 Macs because Mac 4 was damaged. In Phase 2 Mac 4 rejoined and Backend A moved from Mac 1 to Mac 4. DHCP also gave every Mac a new address.

Subnet `10.7.0.0/19` (mask `255.255.224.0`) · Gateway `10.7.0.1` · Interface `en0` (Wi-Fi)

| Mac | Person | Phase 1 IP | Phase 2 IP | Listening ports (Phase 2) |
|-----|--------|-----------|-----------|---------------------------|
| Mac 1 | Abhinay | `10.7.17.157` | `10.7.28.37` | 53 UDP/TCP (primary dnsmasq) |
| Mac 2 | Junaid | `10.7.17.8` | `10.7.27.140` | 80, 443 (nginx primary edge) |
| Mac 3 | Srikar | `10.7.17.37` | `10.7.28.31` | 53 UDP/TCP (backup dnsmasq), 3002 (Backend B) |
| Mac 4 | Nachiket | not used (damaged) | `10.7.19.89` | 3001 (Backend A), 80/443 (standby nginx) |

## Who can reach which port (with pf loaded)

| From ↓ / To → | Mac 1 :53 | Mac 2 :443 | Mac 3 :53 | Mac 3 :3002 | Mac 4 :3001 | Mac 4 :443 |
|---------------|:---------:|:----------:|:---------:|:-----------:|:-----------:|:----------:|
| Any client (Mac 1 / Mac 3) | ✅ | ✅ | ✅ | ❌ timeout | ❌ timeout | ✅ |
| Mac 2 (edge) | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| Mac 4 (standby edge) | ✅ | ✅ | ✅ | ✅ | n/a | n/a |

pf table on both backends: `table <edges> { 10.7.27.140, 10.7.19.89 }`. Everything else to 3001/3002 is dropped silently, so clients see a timeout, not "refused".

## Phase 2 Network Map

```mermaid
graph LR
    GW[" Gateway\n10.7.0.1"]
    M1[" Mac 1 · Abhinay\n10.7.28.37\nPrimary DNS :53"]
    M2[" Mac 2 · Junaid\n10.7.27.140\nnginx edge :443"]
    M3[" Mac 3 · Srikar\n10.7.28.31\nBackup DNS :53 · Backend B :3002"]
    M4[" Mac 4 · Nachiket\n10.7.19.89\nBackend A :3001 · Standby edge :443"]

    GW --- M1 & M2 & M3 & M4
    M2 -->|"upstream :3001"| M4
    M2 -->|"upstream :3002"| M3
```

## Phase 2 IP Change Protocol

An IP appears in four places. Update them together:

1. `address=` / `listen-address` in dnsmasq on **Mac 1 and Mac 3** → `sudo brew services restart dnsmasq`
2. `upstream` block in nginx on **Mac 2 and Mac 4** → `sudo nginx -t && sudo nginx -s reload`
3. `<edges>` table in `/etc/pf.routex.conf` on **Mac 3 and Mac 4** → `sudo pfctl -f /etc/pf.routex.conf`
4. Resolver list on every Mac → `sudo networksetup -setdnsservers Wi-Fi 10.7.28.37 10.7.28.31`

Then flush (`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`) and re-test: `dig` → `nc -vz … 443` → `curl`.
