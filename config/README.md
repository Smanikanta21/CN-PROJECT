# Configuration Bundle — RouteX

Everything needed to rebuild RouteX, as required by the PDF's *Configuration Bundle* deliverable.

## Index

| Item | Phase 1 | Phase 2 | Runs on |
|------|---------|---------|---------|
| dnsmasq (primary DNS) | [`phase1/dnsmasq.conf`](../phase1/dnsmasq.conf) | `dns/dnsmasq.conf` *(to copy from Mac 1)* | Mac 1 |
| dnsmasq (backup DNS) | none | `dns/dnsmasq-backup.conf` *(to copy from Mac 3)* | Mac 3 |
| nginx (primary edge) | [`phase1/nginx.conf`](../phase1/nginx.conf) | [`nginx/nginx.conf`](../nginx/nginx.conf) | Mac 2 |
| nginx (standby edge) | none | `nginx/nginx-standby.conf` *(to copy from Mac 4)* | Mac 4 |
| pf firewall | none | `firewall/pf-mac3.conf`, `firewall/pf-mac4.conf` *(to copy)* | Mac 3, Mac 4 |
| TLS certificate | Cert for `app` only | [`tls/app.routex.test.crt`](../tls/app.routex.test.crt) (`app` + `api`) | Mac 2, Mac 4 |
| Backend A | [`backend-a/serverA.js`](../backend-a/serverA.js) | same file + `/api/info`, `/health`, request log | Mac 1 → Mac 4 |
| Backend B | [`backend-b/serverB.js`](../backend-b/serverB.js) | same file + `/api/info`, `/health`, request log | Mac 3 |

Installed locations on macOS (Homebrew): `$(brew --prefix)/etc/dnsmasq.conf`, `$(brew --prefix)/etc/nginx/nginx.conf`, `/etc/pf.routex.conf`.

---

## TLS certificate setup notes

**1. Create the certificate (Mac 2, repo root).** Self-signed, valid for both names, marked for server use:
```bash
openssl req -x509 -newkey rsa:2048 -days 365 -nodes -sha256 \
  -keyout tls/app.routex.test.key \
  -out    tls/app.routex.test.crt \
  -subj   "/CN=app.routex.test" \
  -addext "subjectAltName=DNS:app.routex.test,DNS:api.routex.test" \
  -addext "extendedKeyUsage=serverAuth"
openssl x509 -in tls/app.routex.test.crt -noout -subject -ext subjectAltName -dates
```

**2. Install it on the edge.** nginx resolves relative paths against its config folder, so either copy the files there or use absolute paths:
```bash
sudo mkdir -p "$(brew --prefix)/etc/nginx/tls"
sudo cp tls/app.routex.test.crt tls/app.routex.test.key "$(brew --prefix)/etc/nginx/tls/"
sudo nginx -t && sudo nginx -s reload
```
The standby edge (Mac 4) uses the **same** cert and key, copied by AirDrop.

**3. Trust it on every client** (Mac 1, Mac 3, Mac 4). Copy only the `.crt`, never the `.key`:
```bash
sudo security delete-certificate -c app.routex.test /Library/Keychains/System.keychain   # remove the old one
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain app.routex.test.crt
```

**4. Verify without `-k`:**
```bash
curl -v https://app.routex.test/api/status 2>&1 | grep -E "subjectAltName|SSL certificate verify"
curl -v https://api.routex.test/api/status 2>&1 | grep -E "subjectAltName|SSL certificate verify"
```

**Rules:** `*.key` is in `.gitignore` and is never committed. A cert is bound to a **name** (its SAN), not an IP, so it still validates after an IP change or on the standby edge.

---

## Backend launch instructions

Requires Node.js (`brew install node`).

```bash
# Backend A (Mac 4 in Phase 2)
cd backend-a && npm install && npm start      # listens on 0.0.0.0:3001

# Backend B (Mac 3)
cd backend-b && npm install && npm start      # listens on 0.0.0.0:3002
```

- Bind to `0.0.0.0`, not `127.0.0.1`, or the edge cannot reach them. Click **Allow** when macOS asks about incoming connections.
- Endpoints: `GET /` · `GET /api/status` (`Cache-Control: max-age=60`) · `GET /api/info` (identical on A and B, so the ETag and 304 work under round-robin) · `GET /health`.
- Every response carries `X-Backend: A` or `B`. Each request is logged with its source IP, so with pf on you should only ever see the edge's IP.

Check from the edge (Mac 2):
```bash
curl -si http://10.7.19.89:3001/api/status | grep -iE "HTTP|x-backend"
curl -si http://10.7.28.31:3002/api/status | grep -iE "HTTP|x-backend"
```

---

## Client setup

```bash
sudo networksetup -setdnsservers "Wi-Fi" 10.7.28.37 10.7.28.31   # primary, then backup
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
dig app.routex.test                                              # → 10.7.27.140, TTL 30
```
Turn off VPN and iCloud Private Relay first. Both can bypass the team DNS.
