# Computer Networks Course Project - Private Network Service Platform

## Overview
This repository contains the deliverables for the Computer Networks Course Project. The project involves designing and building a small private service environment from scratch using laptops connected on a local network.

## Phase 1: Build & Observe
The goal of Phase 1 is to build the core network infrastructure and prove it works using tools like Wireshark, curl, and dig. 

### Core Architecture
- **Mac 1**: Private DNS Server (dnsmasq) + Test Client
- **Mac 2**: Edge / Reverse Proxy + Load Balancer (nginx)
- **Mac 3**: Backend Server A (Simple HTTP/REST API on port 3001)
- **Mac 4**: Backend Server B (Simple HTTP/REST API on port 3002)

### Tasks Completed
- [ ] **Task A:** Establish the Private LAN
- [ ] **Task B:** Configure a Private DNS Server
- [ ] **Task C:** Build Two Simple Backend Services
- [ ] **Task D:** Configure the Edge Reverse Proxy and Load Balancer
- [ ] **Task E:** Add HTTPS / TLS
- [ ] **Task F:** Demonstrate HTTP Caching Behavior
- [ ] **Task G:** Capture the Complete Protocol Flow

### Deliverables Folder Structure
- `architecture/`: Network topology diagrams, machine roles, IP/service tables, and request-flow diagrams.
- `config/`: Configuration files (dnsmasq, nginx, TLS setup notes).
- `src/`: Source code for backend applications and helper scripts.
- `evidence/`: Screenshots, exports, and Wireshark captures (DNS, TCP, TLS, HTTP).

---
*Note: This repository is a work in progress for Phase 1 of the project.*

