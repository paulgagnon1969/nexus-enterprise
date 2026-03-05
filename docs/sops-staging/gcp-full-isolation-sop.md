---
title: "GCP Full Isolation — Self-Hosted Migration"
module: infrastructure-migration
revision: "1.0"
tags: [sop, infrastructure, gcp, minio, migration, storage, self-hosted]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# GCP Full Isolation — Self-Hosted Migration

## Purpose
Documents the complete removal of all Google Cloud Platform compute and storage dependencies from the Nexus Enterprise stack. All services now run on the self-hosted Mac Studio shadow stack behind Cloudflare Tunnel. The only remaining Google service is the Places API (retained intentionally for address autocomplete).

## Who Uses This
- System administrators managing the production environment
- Developers adding new storage or AI capabilities
- DevOps reviewing infrastructure dependencies

## Migration Summary

### What Was Removed

**Phase 1 — Hardcoded GCS URL Fixes**
- Removed `gs://` URIs from `daily-log.service.ts` and `openai-ocr.provider.ts`
- Converted 3 frontend `gs://` URL references to use the `/uploads/signed` endpoint
- Created `/uploads/signed` API endpoint for presigned MinIO read URLs

**Phase 2 — Vision AI Migration (Vertex AI → xAI Grok)**
- Rewrote `gemini.service.ts` from Vertex AI REST API to OpenAI-compatible SDK
- Configurable provider via `VISION_MODEL`, `VISION_API_BASE_URL`, `VISION_API_KEY` env vars
- Production now uses xAI Grok (`grok-4-1-fast-non-reasoning`) — 10x cheaper than GPT-4o
- Google Search grounding removed; `webSources` returns empty array for API compat

**Phase 3 — Google Places API**
- Retained intentionally — no migration needed
- Used for address autocomplete in project creation

**Phase 4 — GCS Storage Removal & Legacy Cleanup**
- Removed `@google-cloud/storage` from `apps/api/package.json` (38 packages pruned)
- Deleted `gcs-storage.service.ts`
- Simplified `storage.module.ts`, `common.module.ts`, `ocr.module.ts`, `receipt-email-poller.ts` — all now use `MinioStorageService` directly (no conditional branching)
- Deleted 7 legacy GCP files:
  - `.github/workflows/prod-worker-deploy.yml`
  - `.github/workflows/deploy-production.yml`
  - `.github/workflows/prod-api-deploy.yml`
  - `.github/workflows/dev-api-dev-db.yml`
  - `deploy-api-prod.sh`
  - `infra/cloud-run-api.yaml`
  - `cloudbuild.yaml`

### Current Architecture

```mermaid
flowchart TD
    subgraph Internet
        CF[Cloudflare Tunnel]
    end

    subgraph Mac Studio — Shadow Stack
        API[nexus-shadow-api :8000]
        WEB[nexus-shadow-web :3001]
        WKR[nexus-shadow-worker]
        PG[nexus-shadow-postgres :5435]
        RD[nexus-shadow-redis :6381]
        MIO[nexus-shadow-minio :9000]
        TUN[nexus-shadow-tunnel]
    end

    subgraph External APIs — Retained
        XAI[xAI Grok Vision API]
        GP[Google Places API]
        STR[Stripe]
        PLD[Plaid]
    end

    CF --> TUN
    TUN --> API
    TUN --> WEB
    API --> PG
    API --> RD
    API --> MIO
    API --> XAI
    API --> GP
    API --> STR
    API --> PLD
    WKR --> PG
    WKR --> RD
    WKR --> MIO
```

## Post-Migration Rules

### Storage
- All object storage goes through `MinioStorageService` — there is no GCS fallback
- `STORAGE_PROVIDER` env var is no longer checked; MinIO is hardcoded
- New storage URIs use `gs://` format for backwards compatibility with existing DB records (MinIO resolves these the same way)

### Vision AI
- Provider is configurable via env vars — no code changes needed to switch models
- See **Vision AI Provider Migration SOP** for details

### Legacy Scripts — DO NOT USE
These scripts are deleted and must never be recreated:
- `deploy-prod.sh`, `deploy-worker.sh`, `prod-db-run-with-proxy.sh`
- Any `gcloud run deploy` commands
- GitHub Actions workflows for GCP Cloud Run

### Remaining Google Dependencies
- `@googlemaps/google-maps-services-js` — Places API for address autocomplete (intentionally retained)
- No other Google Cloud SDK packages should be in `package.json`

## Verification Checklist

After any infrastructure change, verify:
1. `grep -r "@google-cloud" apps/api/package.json` — should return nothing
2. `grep -r "GcsStorageService" apps/api/src/` — should return nothing
3. `npm run check-types` — no new GCS-related errors
4. `docker ps --filter name=nexus-shadow` — all 8 containers running
5. `curl https://staging-api.nfsgrp.com/health` — API healthy
6. Upload a file via the web app — confirm it goes to MinIO, not GCS

## Related Modules
- [Local Production Deployment SOP](local-prod-deployment-sop.md)
- [Vision AI Provider Migration SOP](vision-ai-provider-migration-sop.md)
- [Dev Environment Startup SOP](dev-environment-startup-sop.md)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release — complete GCP isolation across all 4 phases |
