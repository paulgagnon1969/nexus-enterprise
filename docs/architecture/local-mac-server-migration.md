# Infrastructure Migration: Local Mac Home Server + Cloudflare

## Status
**In Progress** — March 2, 2026

## Overview
Migrating the Nexus stack off cloud hosting (Vercel for web, GCP Cloud Run for API) to a self-hosted Mac home server. Cloudflare handles DNS, SSL, CDN, and tunneling.

## Motivation
- Tight budget — eliminate monthly cloud hosting costs
- Full control over the stack
- Acceptable for current user count

## Target Architecture

```
Internet → Cloudflare (DNS + CDN + Tunnel) → Mac Home Server
                                                ├── Next.js (apps/web) on :3000
                                                ├── NestJS API (apps/api) on :8001
                                                ├── Postgres (Docker) on :5432
                                                └── Redis (Docker) on :6380
```

## Domain Strategy

| Domain | Registrar | Status | Action |
|--------|-----------|--------|--------|
| `nfsgrp.com` | Google Domains | Primary domain, currently redirected via Vercel | Move DNS nameservers to Cloudflare |
| `nexusconnect.com` | Vercel (third-party) | Optional | Transfer out or let expire |
| `ncc-nexus-contractor-connect.com` | Vercel (auto-renews Dec 26, 2026) | Optional | Transfer out or cancel auto-renew |

**Primary domain:** `nfsgrp.com` — once nameservers point to Cloudflare, Vercel is fully removed from the stack.

## Deployment Stack (No Vercel, No GCP)

- **Reverse proxy + SSL + CDN:** Cloudflare Tunnel (free, no open ports on router)
- **Process manager:** PM2 (keeps Next.js + NestJS alive, auto-restart on crash)
- **Web app:** `next build` with `output: 'standalone'` → `node .next/standalone/server.js`
- **API:** `npm run build` → `npm start` (NestJS/Fastify, standalone Node.js server)
- **Database:** Postgres 16 via Docker (persistent volume)
- **Cache/Queue:** Redis 7 via Docker (persistent volume, BullMQ for import worker)
- **Worker:** Same image as API, runs as separate PM2 process

## What Changes

| Component | Before | After |
|-----------|--------|-------|
| Web hosting | Vercel | Local Mac + Cloudflare Tunnel |
| API hosting | GCP Cloud Run | Local Mac + PM2 |
| Worker hosting | GCP Cloud Run | Local Mac + PM2 |
| Database | Cloud SQL (GCP) | Local Postgres (Docker) |
| Redis | GCP Memorystore / Cloud Redis | Local Redis (Docker) |
| SSL | Vercel / GCP managed | Cloudflare (automatic) |
| CDN | Vercel Edge | Cloudflare |
| DNS | Google Domains → Vercel | Google Domains → Cloudflare |
| CI/CD | GitHub Actions → GCP | TBD (local script or GitHub Actions → SSH) |

## What We Lose (Acceptable Trade-offs)

- Vercel preview deployments per PR
- Auto-scaling (not needed at current scale)
- Managed database backups (need to set up local pg_dump cron)
- Geographic redundancy (single machine)

## TODO

- [ ] Set up Cloudflare Tunnel on Mac
- [ ] Add `output: 'standalone'` to `next.config.js`
- [ ] Configure PM2 ecosystem file for all services
- [ ] Migrate Postgres data from Cloud SQL to local Docker
- [ ] Point `nfsgrp.com` nameservers to Cloudflare
- [ ] Set up automated local database backups (pg_dump cron)
- [ ] Decide on `nexusconnect.com` and `ncc-nexus-contractor-connect.com` (transfer or drop)
- [ ] Update deploy scripts for local deployment
- [ ] Remove Vercel project after cutover
