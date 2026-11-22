# RouteX — Phase 2 Report (Harden, Recover & Troubleshoot)

**Team:** Abhinay (Mac 1) · Junaid (Mac 2) · Srikar (Mac 3) · Nachiket (Mac 4)
**Network:** hostel Wi-Fi `10.7.0.0/19`, gateway `10.7.0.1` · **Zone:** `routex.test`
**Test date:** 22 Nov 2026

| Mac | Person | Phase 2 role | IP on test day |
|-----|--------|--------------|----------------|
| Mac 1 | Abhinay | Primary DNS (dnsmasq) · Client 1 | `10.7.28.37` |
| Mac 2 | Junaid | Primary edge: nginx · TLS · load balancer | `10.7.27.140` |
| Mac 3 | Srikar | Backend B `:3002` · backup DNS · pf firewall · Client 2 · Wireshark | `10.7.28.31` |
| Mac 4 | Nachiket | Backend A `:3001` · standby edge · pf firewall | `10.7.19.89` |

---

## 1. What changed from Phase 1

**Why the layout changed.** Mac 4 was damaged during Phase 1, so Phase 1 ran on 3 Macs and Mac 1 carried both the DNS server and Backend A. In Phase 2 Mac 4 came back. We moved Backend A from Mac 1 to Mac 4, which matches the PDF's 4-machine layout and puts DNS and the backends on different machines. Stopping DNS no longer takes a backend down with it, so a DNS failure and an application failure can be shown separately. Clients needed no change, because they only know the name `app.routex.test`.

| Area | Phase 1 | Phase 2 |
|------|---------|---------|
| Topology | 3 Macs; Backend A on Mac 1 | 4 Macs; Backend A on Mac 4 |
| DNS | One dnsmasq on Mac 1, TTL 0 (dnsmasq default) | Primary on Mac 1 and backup on Mac 3 with identical records; `local-ttl=30`; `log-queries`; clients list both servers |
| Edge (nginx) | Port 80 block only in the repo | 443 TLS + HTTP/2, passive health checks `max_fails=1 fail_timeout=10s`, `proxy_connect_timeout 2s`, `proxy_next_upstream` retries, `X-Edge` and `X-Upstream` headers |
| Certificate | SAN: `app.routex.test` only | Re-issued with `app` and `api` in the SAN plus `extendedKeyUsage=serverAuth` |
| Isolation | Anyone on the Wi-Fi could reach `:3001` and `:3002` | pf on Mac 3 and Mac 4 allows the backend ports only from the edges (`10.7.27.140`, `10.7.19.89`) |
| Standby edge | None | nginx on Mac 4 with the same config and cert, plus `X-Edge: standby` |
| Backends | `/`, `/api/status` | Added `/api/info` (same body on A and B, so the same ETag and 304 works under round-robin), `/health`, and per-request source-IP logging |
| IPs | Mac 1 `10.7.17.157`, Mac 2 `10.7.17.8`, Mac 3 `10.7.17.37` | DHCP reassigned all of them (table above) |

---

## 2. Resilience tests and results

### Ext A — Backup DNS resolver
- **Setup:** a second dnsmasq on Mac 3 (`10.7.28.31`) with the same `address=` records. Clients use `networksetup -setdnsservers Wi-Fi 10.7.28.37 10.7.28.31`.
- **Test:** we stopped dnsmasq on Mac 1. `dig app.routex.test` on Mac 1 still returned `10.7.27.140` with TTL 30, and the `SERVER` line showed `10.7.28.31#53`, so the backup answered. Query time was 13 ms, at 15:43:13.
- **Wireshark on Mac 3** (`dns || icmp`): queries from Mac 4 (`10.7.19.89`) and Mac 2 (`10.7.27.140`) reached the backup. Mac 1 (`10.7.28.37`) answered with ICMP *Destination unreachable (Port unreachable)* because nothing was listening on 53 any more.
- **Finding:** in the same capture, the backup forwarded internet names (apple.com, github.com) to Mac 1, which was down. Mac 3's resolver list puts Mac 1 first, and dnsmasq uses it as its upstream. Project names kept working because the backup answers `routex.test` itself, but internet lookups through the backup failed while Mac 1 was down. Fix: add `no-resolv` plus `server=<gateway or public resolver>` to the backup config.
- **DNS failure vs app failure:** with DNS down, `curl` exits with code 6 ("could not resolve host") and never connects. With the backends down, `dig` works but the edge returns 502. *The 502 contrast screenshot (A03) is still to be captured.*
- **Evidence:** `A01-Mac3-backup-dig`, `A02-Mac4-dig-via-backup`.

### Ext B — DNS TTL and controlled record change
- **TTL:** `dig +noall +answer api.routex.test` → `api.routex.test. 30 IN A 10.7.27.140` (B01).
- **Change:** on both DNS Macs, `address=/api.routex.test/` was pointed at Mac 4 (`10.7.19.89`) and dnsmasq was restarted.
- **Observation (B02, ping loop every 5 s on Mac 1):** the cached answer `10.7.27.140` was used through 15:52:07. The first lookup of `10.7.19.89` was at 15:52:13. The client kept using the old address until its cached copy expired, then picked up the new record without any action on the client.
- **Flush:** the record was restored to `10.7.27.140` on both servers (B03). Running `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` makes the next lookup query the server straight away. *B03 shows the restore commands; the screenshot of the loop switching immediately after the flush is still to be captured.*
- **Production link:** operators lower the TTL days before a migration, change the record, keep the old target running for at least one TTL, then raise the TTL again.

### Ext C — Service isolation with pf
- **Rules** (per backend Mac, port 3001 on Mac 4 and 3002 on Mac 3):
  ```
  set skip on lo0
  table <edges> { 10.7.27.140, 10.7.19.89 }
  pass  in quick proto tcp from <edges> to any port 3002
  block in quick proto tcp from any     to any port 3002
  ```
  Before loading them we saved a rollback copy with `cp /etc/pf.conf ~/pf.conf.rollback` and recorded the original `pfctl -s info` status.
- **From a client (Mac 1, C02):** `nc -vz -G 3 10.7.28.31 3002` → *Operation timed out*. pf silently drops the SYN, so the client sees a timeout, not "refused". Ping still worked and `curl https://app.routex.test/api/status` returned `{"backend":"A","status":"ok"}` through the edge.
- **From the edge (Mac 2, C03):** `nc -vz` to `10.7.19.89:3001` and `10.7.28.31:3002` both *succeeded*.
- **Rollback (C04):** `sudo pfctl -f /etc/pf.conf` and `sudo pfctl -d` → `Status: Disabled` (the original state), and direct `nc` to `:3001` succeeded again.
- **Honest result:** isolation is proven for **Mac 3 (`:3002`)**. In C02, Mac 1 could still reach Mac 4's `:3001` directly, and C01's `pfctl -sr` shows only Apple's default anchors. That means the RouteX rules were not active on Mac 4 when those screenshots were taken. *To do: load `pf.routex.conf` on Mac 4, then re-capture C01 and C02 with both ports timing out.*

### Ext D — High-availability failover
- **Config:** `server … max_fails=1 fail_timeout=10s`, `proxy_connect_timeout 2s`, `proxy_next_upstream error timeout http_502 http_503 http_504`, `proxy_next_upstream_tries 2`.
- **Backend A stopped (D02):** all 8 requests were served by **B**. Three showed `X-Upstream: 10.7.19.89:3001, 10.7.28.31:3002`: nginx tried A, got connection refused, and retried the same request on B. The user still received a response.
- **Backend B stopped (D01):** all 9 requests were served by **A**. Three showed `X-Upstream: 10.7.28.31:3002, 10.7.19.89:3001`.
- **Why retries keep appearing:** after `fail_timeout` (10 s) nginx sends one real request to the failed server to see whether it has come back. With a 1 s loop that probe lands every few requests, and `proxy_next_upstream` hides it from the user.
- **Remaining single point of failure:** the edge on Mac 2, and the Wi-Fi router. Removing it needs two edges sharing a floating IP (VRRP/keepalived), health-checked DNS, or a managed multi-zone load balancer. Ext E shows a manual DNS version.
- **Evidence:** `D01-Mac4-backendA-stopped` (shows B down), `D02-Mac1-all-via-B`. *`D03-Mac1-balanced-after` is currently a duplicate of D02. Re-capture A/B alternating after the restart, plus the nginx error log ("connection refused" / "temporarily disabled").*

### Ext E — Controlled edge migration (DNS cutover)
- **Standby:** nginx on Mac 4 with the same config and certificate, except for `add_header X-Edge standby always;`.
- **Pre-cutover test (E01):** `curl -sI --resolve app.routex.test:443:10.7.19.89 https://app.routex.test/api/status` → `HTTP/2 200`, `x-backend: A`, `x-edge: standby`. The certificate validated on Mac 4 because it is bound to the name, not to an IP. Without `--resolve` the same client still got `x-edge: primary`, which confirms DNS had not changed yet.
- **Cutover (E02, loop every 3 s on Mac 1):** after `app.routex.test` was pointed at `10.7.19.89` on both DNS servers, the cached client stayed on `x-edge: primary` through 16:45:45 and switched to `x-edge: standby` at 16:45:48. Every line before and after the switch returned a response, so no request failed during the overlap.
- **Rollback:** the same `sed` back to `10.7.27.140` on both DNS Macs.
- *To do: E03, a flushed client moving to the standby immediately.*

---

## 3. Troubleshooting findings (Ext F)

**Method:** check layers bottom-up and prove each one before moving up: Link/IP → DNS → TCP → TLS → HTTP/app.

| Step | Command | What it proves |
|------|---------|----------------|
| 1 Link/IP | `ipconfig getifaddr en0; ping -c2 10.7.27.140` | We have an address and the edge is reachable |
| 2 DNS | `scutil --dns`, `dig app.routex.test`, `dig @10.7.28.37 …`, `dig @10.7.28.31 …`, `grep routex.test /etc/hosts` | Which server answered and whether the answer is the edge |
| 3 TCP | `nc -vz -G 3 app.routex.test 443`, `lsof -iTCP -sTCP:LISTEN` | Port 443 is open (refused = not listening; timeout = filtered) |
| 4 TLS | `openssl s_client … -servername app.routex.test`, `curl -v` | Handshake completes and the cert is trusted for this name |
| 5 App | `curl -si …; echo $?`, nginx `error.log`, `curl :3001/health`, `curl :3002/health` | Status code and which backend failed |

**Rehearsed fault: DNS record points to the wrong IP (F01, Mac 3, 16:52:10)**
- *Symptom:* the site would not load by name.
- *Layer 1:* the edge `10.7.27.140` answered ping, so the network was fine.
- *Layer 2:* `dig app.routex.test` → `30 IN A 10.7.27.147`, answered by `10.7.28.37#53`. DNS itself was working, but the record data was wrong: `.147` instead of the edge's `.140`.
- *Root cause:* a wrong `address=/app.routex.test/` line on the DNS server.
- *Fix:* correct the line on **both** DNS Macs (otherwise the backup gives a different answer), restart dnsmasq, and flush the client cache.
- *To do:* `F02-Mac3-DNS-WrongIP-fixed.png`.

**Other faults we prepared for with the same ladder** (wrong resolver and backends down were also shown in Phase 1, `evidence/08-failures/`): wrong resolver on a client (curl exit 6), nginx stopped (443 refused), certificate untrusted (curl exit 60), wrong upstream port (502 plus "connection refused" in the error log), pf blocking the edge (504, `nc` from Mac 2 times out).

**Real issue found while setting up the edge (Mac 2):** the first Phase 2 `nginx.conf` failed `nginx -t` three times:
1. `host not found in upstream "MAC4_IP:3001"`: a placeholder had been left in place of Mac 4's IP.
2. `invalid number of arguments in "proxy_pass"`: zsh's paste handling had turned `project_backends;` into `project_backends\;`, so the directive never ended.
3. relative `tls/…` certificate paths, which nginx resolves to `/opt/homebrew/etc/nginx/tls/`, a folder that did not exist.

Because every reload failed, nginx kept running the old config, which still pointed Backend B at the stale IP `10.7.17.37`. The curl loop gave this away: it kept showing `X-Upstream: 10.7.17.37:3002, 10.7.19.89:3001`. Lesson: always run `nginx -t` and check `X-Upstream` after a change, because a failed reload is easy to miss.

---

## 4. Learning summary

**A — Backup DNS.** One DNS server is a single point of failure: if it stops, the edge and backends are healthy but nobody can find them by name. A second server with identical records removes that. The client tries the first server, gets an ICMP port-unreachable (or a timeout), and asks the next. Check the name first: if `dig` fails it is a DNS failure (curl exit 6); if `dig` works but the request fails, the problem is further along (exit 7, 502, 504). We also learned that a backup needs its own upstream resolver, or it depends on the server it is meant to back up.

**B — TTL.** The TTL is how long any cache may reuse an answer. `dig` queries the server directly, so it saw the new record at once. `ping` and `curl` go through macOS's mDNSResponder cache, which kept the old IP until the TTL ran out. A short TTL makes changes spread quickly but adds query load. That is why production teams lower the TTL before a migration and raise it afterwards.

**C — Isolation.** Least privilege: the backends only need to hear from the edge, so everything else is denied. pf normally uses the last matching rule, but `quick` makes the first match final, so `pass quick from <edges>` must come before `block quick`. Plain `block` drops packets, so clients time out and an attacker cannot tell a filtered port from a dead host. `block return` would send an RST. A rollback copy and a known undo command are part of making any firewall change.

**D — Failover.** Open-source nginx uses passive health checks: it learns that a backend is down from a failed real request, removes it for `fail_timeout`, and `proxy_next_upstream` retries that request on the healthy backend, so the user never sees the error. Active probing needs nginx Plus, HAProxy, or a cloud load balancer. The edge itself is still a single point of failure.

**E — Cutover.** Changing a DNS record moves traffic gradually: each client switches only when its cached answer expires, so both edges must serve traffic during the overlap. `curl --resolve` lets us test the new edge end to end before any user is sent there. The same certificate works on Mac 4 because it certifies the name, not the machine. That is also why the private key must never be committed.

**F — Troubleshooting.** Working bottom-up is faster because each layer depends on the one below. The signals point straight at a layer: curl exit 6 is DNS, 7 is TCP refused, 28 is a timeout, 35 or 60 is TLS, and a 502 or 504 is behind the edge. The nginx error log, the dnsmasq query log and the backend's source-IP log confirm which one.

---

## 5. Evidence index (`evidence/09-phase2/`)

| Ext | Files | Status |
|-----|-------|--------|
| Rebuild | R01 ping matrix, R02 cert SAN, R03 4-Mac load balance | To capture |
| A | A01 backup dig, A02 Wireshark failover | Done · A03 (DNS ok, app 502) to capture |
| B | B01 TTL 30, B02 cached loop, B03 restore | Done · flushed-loop screenshot to capture |
| C | C01 pf rules, C02 client blocked, C03 edge allowed, C04 rollback | Mac 4 rules to re-capture (C01/C02) |
| D | D01 B down → all A, D02 A down → all B | D03 is a duplicate; error-log screenshot to capture |
| E | E01 `--resolve` standby, E02 cached client switch | E03 flushed client to capture |
| F | F01 wrong A record symptom | F02 fixed to capture |
