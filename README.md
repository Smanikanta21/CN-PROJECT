# Private Network Service Platform — CN Course Project

**Review 1 (Phase 1: Build & Observe). 3-Mac topology.**

Single source of truth: `CN_Project_Doc.pdf`. Everything here maps to a task in it.

## Topology (3 Macs, roles combined — allowed by [PDF 3])

Network: **hostel Wi-Fi `10.7.0.0/19`**, mask `255.255.224.0`, gateway `10.7.0.1`.

| Machine | Role | IP | Services / ports | Cloud equivalent |
|---|---|---|---|---|
| **Mac 1** | Private DNS + Backend A + client | `10.7.17.157` | dnsmasq 53 UDP+TCP, Backend A 3001/TCP | Route 53 + app instance |
| **Mac 2** | Edge: reverse proxy + load balancer + TLS | `10.7.17.140` | nginx 80/TCP, 443/TCP | AWS ALB / CDN edge |
| **Mac 3** | Backend B + client + capture point | `10.7.17.152` | Backend B 3002/TCP | App instance B |
| Gateway | LAN router (not ours) | `10.7.0.1` | DHCP | VPC router |

DNS records: `app.team1.test → 10.7.17.140`, `api.team1.test → 10.7.17.140`.
**Both names point at the edge, never at a backend.**

Request path: `client → DNS (Mac 1) → edge (Mac 2) → Backend A (Mac 1) or B (Mac 3)`

## How to use this repo

**→ [`RUNBOOK.md`](RUNBOOK.md) is the command sheet.** Every command, grouped by
Mac and by task. Work through Tasks A → G in order; each one depends on the last.

**Before anything else:** run the client-isolation ping test in RUNBOOK §0. On an
institutional network it is the one thing that can sink the whole build, and it takes
ten seconds to check.

## Task progress

- [ ] **A** — Private LAN: IPs pinned, ping matrix, topology diagram
- [ ] **B** — Private DNS (dnsmasq on Mac 1), clients pointed at it
- [ ] **C** — Two backend services (A on Mac 1:3001, B on Mac 3:3002)
- [ ] **D** — nginx reverse proxy + round-robin load balancer (Mac 2, HTTP only)
- [ ] **E** — HTTPS/TLS at the edge: own CA, SAN cert, trusted on all clients
- [ ] **F** — HTTP caching: `Cache-Control`, `ETag`, 304
- [ ] **G** — Wireshark capture of the full protocol flow
- [ ] **Failures 1–5** — the five required failure demonstrations [PDF 6.3]
- [ ] Demo dry-run, every member can explain a component they did not build

## Folder structure [PDF 8]

```
01-architecture/   topology.png  ip-table.md  request-flow.png
02-config/         dnsmasq.conf  nginx.stage1-http.conf  nginx.conf
                   san.ext  cert-setup-notes.md  backend-launch.md
03-backend/        server.js  package.json  README.md
04-evidence/
  A-lan/  B-dns/  D-loadbalancer/  E-tls/  F-caching/
  G-wireshark/     01-dns-tcp-tls12.pcapng  02-tls13.pcapng  03-edge-backend.pcap
  failures/        1-wrong-dns.txt … 5-wrong-port.txt
```

## If an IP changes

We do not control this network's DHCP server, so addresses can drift. If any Mac gets a
new IP, **three files must change together** or the system breaks in a confusing way:

1. `02-config/dnsmasq.conf` — `listen-address` and/or the two `address=` records
2. `02-config/nginx.conf` + `nginx.stage1-http.conf` — the `upstream` block
3. `01-architecture/ip-table.md` — the inventory table

Then `sudo brew services restart dnsmasq` (Mac 1), `nginx -t && sudo nginx -s reload`
(Mac 2), and flush the client DNS caches.

## Marks [PDF 10]

| Area | Marks | Tasks |
|---|---|---|
| LAN + private DNS | 10 | A + B |
| Backends + reverse proxy + load balancing | 10 | C + D |
| HTTPS / TLS | 8 | E |
| Packet analysis | 7 | G |
| HTTP caching + transport | 5 | F |
| Individual viva | 10 | — |
| **Total** | **50** | |

The viva is individual. Rotate the keyboard — every member runs at least one task end to end.

## Secrets

`*.key` is gitignored. **The CA private key never leaves Mac 2.** Only `teamCA.crt`
(the public certificate) is copied to the other Macs.
