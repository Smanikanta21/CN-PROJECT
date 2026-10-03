# Command Log — RouteX Phase 1

---

## Task A — Verify LAN Connectivity

```mermaid
sequenceDiagram
    participant M1 as Mac 1 (Abhinay · 10.7.17.157)
    participant M2 as Mac 2 (Junaid · 10.7.17.8)
    participant M3 as Mac 3 (Srikar · 10.7.17.37)

    M1->>M2: ping -c 4 10.7.17.8
    M2-->>M1: 4 packets received
    M1->>M3: ping -c 4 10.7.17.37
    M3-->>M1: 4 packets received
    M3->>M2: ping -c 4 10.7.17.8
    M2-->>M3: 4 packets received
```

```bash
# On each Mac — confirm assigned IP
ipconfig getifaddr en0

# Ping matrix — run from each Mac
ping -c 4 10.7.17.157   # Mac 1
ping -c 4 10.7.17.8     # Mac 2
ping -c 4 10.7.17.37    # Mac 3
```

---

## Task B — DNS Server

```mermaid
flowchart LR
    INSTALL["brew install dnsmasq\n(Mac 1)"]
    CONF["copy dns/dnsmasq.conf\nto /opt/homebrew/etc/"]
    START["sudo brew services restart dnsmasq"]
    SETDNS["Set resolver on Mac 1 + Mac 3\nnetworksetup -setdnsservers Wi-Fi 10.7.17.157"]
    DIG1["dig @10.7.17.157 app.routex.test\n→ expect 10.7.17.8 "]
    DIG2["dig @10.7.17.157 api.routex.test\n→ expect 10.7.17.8 "]

    INSTALL --> CONF --> START --> SETDNS --> DIG1 & DIG2
```

```bash
brew install dnsmasq
sudo cp dns/dnsmasq.conf /opt/homebrew/etc/dnsmasq.conf
sudo brew services restart dnsmasq

# Set resolver (Mac 1 AND Mac 3)
sudo networksetup -setdnsservers Wi-Fi 10.7.17.157

dig @10.7.17.157 app.routex.test   # → 10.7.17.8
dig @10.7.17.157 api.routex.test   # → 10.7.17.8
dig +short app.routex.test
```

---

## Task C — Backend Services

```mermaid
sequenceDiagram
    participant M2 as Mac 2 (curl test)
    participant BA as Backend A · Mac 1:3001
    participant BB as Backend B · Mac 3:3002

    Note over BA: npm start (Mac 1)
    Note over BB: npm start (Mac 3)

    M2->>BA: curl http://10.7.17.157:3001/
    BA-->>M2: 200 OK · {"backend":"A","status":"ok"}

    M2->>BB: curl http://10.7.17.37:3002/
    BB-->>M2: 200 OK · {"backend":"B","status":"ok"}

    M2->>BA: curl http://10.7.17.157:3001/api/status
    BA-->>M2: 200 OK · X-Backend: A · Cache-Control: max-age=60

    M2->>BB: curl http://10.7.17.37:3002/api/status
    BB-->>M2: 200 OK · X-Backend: B · Cache-Control: max-age=60
```

```bash
# Mac 1 — Backend A
cd backend-a && npm start

# Mac 3 — Backend B
cd backend-b && npm start

# Test from Mac 2
curl -s http://10.7.17.157:3001/
curl -s http://10.7.17.157:3001/api/status
curl -s http://10.7.17.37:3002/
curl -s http://10.7.17.37:3002/api/status
```

---

## Task D — Nginx Load Balancer

```mermaid
sequenceDiagram
    participant C  as Client
    participant E  as nginx · 10.7.17.8
    participant BA as Backend A · :3001
    participant BB as Backend B · :3002

    C->>E: GET http://app.routex.test/ #1
    E->>BA: upstream → :3001
    BA-->>E: X-Backend: A
    E-->>C: 200 OK

    C->>E: GET http://app.routex.test/ #2
    E->>BB: upstream → :3002
    BB-->>E: X-Backend: B
    E-->>C: 200 OK

    C->>E: GET http://app.routex.test/ #3
    E->>BA: upstream → :3001
    BA-->>E: X-Backend: A
    E-->>C: 200 OK

    Note over C,E: Pattern repeats: A B A B A B
```

```bash
brew install nginx
sudo cp nginx/nginx.conf /opt/homebrew/etc/nginx/nginx.conf

nginx -t                    # must say: syntax is ok
sudo nginx
# or reload:
sudo nginx -s reload

# Prove round robin (6 requests → A B A B A B)
for i in 1 2 3 4 5 6; do
  curl -s http://app.routex.test/ | grep -o '"backend":"."'
done
```

---

## Task E — TLS / HTTPS

```mermaid
sequenceDiagram
    participant C  as Client (Mac 1 or 3)
    participant E  as nginx · Mac 2 · :443
    participant BA as Backend A

    Note over E: openssl — generate SAN cert
    Note over C: Trust cert (security add-trusted-cert)

    C->>E: TCP SYN → :443
    E-->>C: SYN-ACK
    C->>E: ACK

    C->>E: ClientHello (SNI=app.routex.test)
    E-->>C: ServerHello + Certificate (CN=app.routex.test)
    C->>E: Finished — TLSv1.3

    C->>E: GET /api/status (encrypted)
    E->>BA: GET /api/status (plaintext upstream)
    BA-->>E: 200 OK  X-Backend: A
    E-->>C: 200 OK (encrypted)
```

```bash
# Mac 2 — generate SAN cert
openssl req -x509 -newkey rsa:2048 -days 365 -nodes \
  -keyout tls/app.routex.test.key \
  -out    tls/app.routex.test.crt \
  -subj   "/CN=app.routex.test" \
  -addext "subjectAltName=DNS:app.routex.test,DNS:api.routex.test"

# Mac 1 + Mac 3 — trust the cert
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain app.routex.test.crt

# Test (no -k needed after trusting)
curl -v https://app.routex.test/api/status

# Verify TLS details
openssl s_client -connect app.routex.test:443 -servername app.routex.test < /dev/null
```

---

## Task F — HTTP Caching

```mermaid
sequenceDiagram
    participant C  as Client (curl / browser)
    participant E  as nginx · Mac 2
    participant BE as Backend (A or B)

    Note over C,BE: First request — cache MISS
    C->>E: GET /api/status
    E->>BE: GET /api/status
    BE-->>E: 200 OK · Cache-Control: max-age=60 · ETag: W/"1d-..."
    E-->>C: 200 OK (client stores in cache)

    Note over C: Within 60 seconds — served from local cache, zero packets sent
    C->>C: (cache HIT — no network request)

    Note over C,BE: After 60 seconds — conditional revalidation
    C->>E: GET /api/status · If-None-Match: W/"1d-..."
    E->>BE: GET /api/status · If-None-Match forwarded
    BE-->>E: 304 Not Modified (no body)
    E-->>C: 304 Not Modified (bytes saved!)
```

```bash
# First request — see Cache-Control and ETag
curl -I https://app.routex.test/api/status

# Conditional GET — revalidation (304)
ETAG=$(curl -sI https://app.routex.test/api/status \
  | grep -i etag | awk '{print $2}' | tr -d '\r')
curl -I -H "If-None-Match: $ETAG" https://app.routex.test/api/status
# expect: HTTP/1.1 304 Not Modified
```

---

## Task G — Wireshark Captures

```mermaid
flowchart TD
    CAP(["Start Wireshark on Mac 3 · en0"])
    DNS["Filter: dns\nCaptures: G01-DNS.png"]
    TCP["Filter: tcp and ip.addr == 10.7.17.8\nCaptures: G02-TCP.png"]
    TLS["Filter: tls\nCaptures: G03-TLS.png"]
    HTTP["Filter: http and ip.addr == 10.7.17.8\nCaptures: G04-HTTP.png"]
    LBA["Filter: ip.addr == 10.7.17.157\nCaptures: G05-LB-BackendA.png"]
    LBB["Filter: ip.addr == 10.7.17.37\nCaptures: G05-LB-BackendB.png"]
    PORT["Filter: tcp.port == 53\nCaptures: G06-UDP-Port.png"]
    EXP["File → Export Specified Packets → .pcapng"]

    CAP --> DNS & TCP & TLS & HTTP & LBA & LBB & PORT --> EXP
```

---

## Failures — Required Demonstrations

```mermaid
flowchart TD
    F1[" Failure 1\nWrong DNS resolver\nnetworksetup → 10.7.123.12\ndig → timeout · curl (6) no host"]
    F2[" Failure 2\nWrong DNS A record\naddress=.../10.7.17.121\ndig returns bad IP · curl (7) refused"]
    F3[" Failure 3\nBackend A stopped\nnginx marks failed\nAll replies: X-Backend: B"]
    F4[" Failure 4\nBoth backends stopped\nTLS ok · HTTP layer gone\nnginx returns 502 Bad Gateway"]
    F5[" Failure 5\nWrong port 3999\nHost up · port closed\ncurl (7) Connection refused · RST"]

    F1 & F2 & F3 & F4 & F5 --> RES(["Restore & repeat demo"])
```

```bash
# Failure 1 — wrong resolver
sudo networksetup -setdnsservers Wi-Fi 10.7.123.12
dig app.routex.test           # timed out
curl -v https://app.routex.test/api/status  # curl (6)
sudo networksetup -setdnsservers Wi-Fi 10.7.17.157   # RESTORE

# Failure 2 — wrong A record (edit dnsmasq.conf → 10.7.17.121, restart)
dig +short app.routex.test    # 10.7.17.121 (wrong)
curl -v https://app.routex.test/api/status  # curl (7)
# RESTORE: fix dnsmasq.conf, brew services restart dnsmasq

# Failure 3 — stop Backend A (Ctrl+C on Mac 1)
curl https://app.routex.test/api/status  # X-Backend: B every time

# Failure 4 — stop both backends
curl -v https://app.routex.test/api/status  # 502 Bad Gateway

# Failure 5 — wrong port
curl -v http://10.7.17.37:3999/api/status  # curl (7) Connection refused
```
