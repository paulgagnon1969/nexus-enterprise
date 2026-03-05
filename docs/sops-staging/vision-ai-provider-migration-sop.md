---
title: "Vision AI Provider Migration"
module: vision-ai
revision: "1.0"
tags: [sop, vision-ai, xai, grok, openai, gemini, video-assessment, migration]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Vision AI Provider Migration

## Purpose
Documents the migration of NEXUS video assessment and OCR vision capabilities from Google Vertex AI (Gemini) to a configurable multi-provider architecture. Production currently runs on xAI Grok (`grok-4-1-fast-non-reasoning`), but any OpenAI-compatible vision API can be used without code changes.

## Who Uses This
- Developers working on video assessment or OCR features
- System administrators configuring vision AI providers
- DevOps managing API keys and environment variables

## Architecture

### Before (Vertex AI)
- Direct REST calls to `us-central1-aiplatform.googleapis.com`
- Required GCP service account credentials
- Hardcoded to Gemini model family
- Google Search grounding for material identification

### After (Multi-Provider)
- OpenAI SDK (`openai` npm package) pointed at any compatible endpoint
- Provider configured entirely via environment variables
- No GCP credentials needed
- Teaching examples replace Google Search grounding

```mermaid
flowchart LR
    subgraph NexBridge / Web
        V[Video Upload]
    end

    subgraph API — gemini.service.ts
        C[getClient] --> SDK[OpenAI SDK]
        SDK --> |VISION_API_BASE_URL| P{Provider}
    end

    P -->|xAI| XAI[api.x.ai/v1]
    P -->|OpenAI| OAI[api.openai.com/v1]
    P -->|Other| ANY[Any OpenAI-compatible API]

    V --> C
```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VISION_MODEL` | Model identifier | `grok-4-1-fast-non-reasoning` |
| `VISION_API_BASE_URL` | Provider API endpoint | `https://api.x.ai/v1` |
| `VISION_API_KEY` or `XAI_API_KEY` | API key for the provider | (stored in `.env.shadow`) |

### File Locations
- **Production config**: `.env.shadow` (git-ignored, loaded by Docker compose)
- **Dev config**: `apps/api/.env` (git-ignored)
- **Service code**: `apps/api/src/modules/video-assessment/gemini.service.ts`

### Current Production Config
```
VISION_MODEL=grok-4-1-fast-non-reasoning
VISION_API_BASE_URL=https://api.x.ai/v1
XAI_API_KEY=<stored in .env.shadow>
```

## Switching Providers

To switch to a different vision AI provider (e.g., GPT-4o, Claude, or a new xAI model):

1. Update the three env vars in `.env.shadow`:
   ```
   VISION_MODEL=gpt-4o
   VISION_API_BASE_URL=https://api.openai.com/v1
   VISION_API_KEY=sk-...
   ```
2. Redeploy: `npm run deploy:shadow`
3. Verify: run a video assessment and check findings

**No code changes required.** The `getClient()` method in `gemini.service.ts` reads these env vars at startup.

## A/B Evaluation Harness

A standalone evaluation script exists for comparing vision models head-to-head:

```bash
# Run from repo root
npm run eval:vision
```

- **Script**: `scripts/eval-vision-models.ts`
- **Input**: Any MP4/MOV video file
- Extracts frames via FFmpeg, sends to each configured model
- Generates a markdown comparison report with timing, findings count, token usage, and cost estimates
- Reports saved to `/Volumes/4T Data/WARP TMP/reports/`

### Adding a Model to the Eval Harness
Edit the `MODELS` array in `scripts/eval-vision-models.ts`:
```typescript
{
  id: "model-name",
  label: "Display Name",
  baseUrl: "https://api.provider.com/v1",
  model: "model-identifier",
  apiKeyEnv: "PROVIDER_API_KEY",
}
```

## Key Technical Details

### Class Name Preserved
The service class is still named `GeminiService` and the result interface is still `GeminiAssessmentResult` for backwards compatibility. These names are historical — the service is provider-agnostic.

### Image URL Resolution
`resolveImageUrl()` in `gemini.service.ts` handles three input formats:
- `gs://` URIs → converted to presigned MinIO read URLs
- `s3://` URIs → converted to presigned MinIO read URLs
- `base64` strings → converted to data URIs
- `http(s)://` URLs → passed through as-is

### Google Search Grounding Removed
The `teachAnalysis()` method previously used Google Search grounding to help identify materials. This has been replaced by the **Zoom & Teach** system where human corrections are stored as `AssessmentTeachingExample` records and injected as few-shot context into future assessments. The `webSources` field always returns an empty array for API compatibility.

## Cost Comparison

| Provider | Model | Input $/M tokens | Output $/M tokens | Speed |
|----------|-------|------------------|-------------------|-------|
| xAI | grok-4-1-fast-non-reasoning | $0.20 | $0.50 | ~10s |
| OpenAI | gpt-4o | $2.50 | $10.00 | ~16s |
| xAI | grok-4-0709 | $3.00 | $15.00 | ~25s |

Production uses Grok 4.1 Fast — approximately **10x cheaper** than GPT-4o with comparable accuracy for construction damage assessment.

## Related Modules
- [GCP Full Isolation SOP](gcp-full-isolation-sop.md)
- [NexEXTRACT Adaptive Frame Extraction SOP](nexextract-adaptive-frame-extraction-sop.md)
- CAM: [TECH-INTL-0001 — NexEXTRACT](../../cams/TECH-INTL-0001-nexextract-adaptive-intelligence.md)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release — Vertex AI → multi-provider migration, xAI Grok production config |
