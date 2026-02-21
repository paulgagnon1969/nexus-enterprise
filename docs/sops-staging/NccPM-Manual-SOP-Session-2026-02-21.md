---
title: "NccPM Manual SOP"
module: nccpm-manual
revision: "1.0"
tags: [sop, nccpm-manual, operations, admin]
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
---

# NccPM Manual

## Purpose
Define the end‑to‑end process for exporting NccPM manuals/booklets to PDF and the operational safeguards that ensure consistent output (correct chapter/appendix order, no blank pages, no content truncation, and rendered Mermaid diagrams).

## Who Uses This
- SUPER_ADMIN
- NCC_SYSTEM_DEVELOPER
- Operations staff responsible for publishing manuals

## Workflow

### Step-by-Step Process
1. Prepare the manual in NCC
   - Create or edit chapters and attach documents.
   - Use the “Include in Print” toggle to control which documents are exported.
   - Mermaid diagrams are supported by placing content inside `<div class="mermaid"> ... </div>` blocks.
2. Preview the manual
   - Navigate to the manual’s Preview page to validate layout, TOC order (chapters first, appendices last), and diagram rendering.
3. Generate the PDF
   - Click “Download PDF”. The API service renders HTML, waits for Mermaid to finish, loads all images, and produces a PDF via Puppeteer.
4. Output formatting
   - Page size: Letter; printBackground: true.
   - Margins: top/right/left 0.6in, bottom 1.0in (reserved for footer).
   - Footer includes confidentiality note and page X / Y numbering.
5. Post‑generation checks
   - Verify no excessive blank pages, no truncated bullets/paragraphs at page bottoms, and diagrams appear as SVGs.
6. Publishing
   - Distribute the PDF through the appropriate channels (e.g., attach to project docs, share via Public Docs if applicable).

### Flowchart
<div class="mermaid">
flowchart TD
  U[User clicks Download PDF] --> W[Web App requests /system/manuals/:id/pdf]
  W --> A[API render HTML]
  A --> M[Wait Mermaid render + images]
  M --> P[Puppeteer (Chromium) generate PDF]
  P --> R[Return PDF to client]
  P -.-> E{Error?}
  E -->|Yes| L[Check Cloud Run logs]
  E -->|No| R
</div>

## Key Features
- Correct TOC ordering: chapters first, then appendices.
- Removal of unnecessary blank pages by refining print CSS (avoid blanket page-break rules).
- Protection against page‑bottom truncation via larger bottom margin and printed footer (HTML headers/footers hidden in print mode).
- Mermaid diagrams rendered to SVG before PDF generation.
- Docker/Cloud Run compatible Chromium install used by Puppeteer.

## Troubleshooting
- 500 error on PDF download with ENOENT for Chrome/Chromium
  - Ensure container has system Chromium and fonts installed.
  - Confirm env var `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` is present.
- Blank pages persist
  - Recheck CSS for unintended `page-break-after`/`page-break-inside` on section wrappers.
- Content cut off at page bottom
  - Confirm bottom margin is at least 1.0in and HTML footers/headers are hidden for print.
- Mermaid not rendering
  - Ensure diagrams are inside `<div class="mermaid">` blocks and script initialization runs prior to PDF.

## Related Modules
- Document Import Service (HTML → manual content)
- Public Docs and Share Links

## Session Summary (2026-02-21)
- Root cause of production failure: Puppeteer could not find Chromium in Cloud Run container (ENOENT).
- Fixes implemented:
  - Install `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-freefont`, and `font-noto-emoji` in the Docker image.
  - Set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.
  - Updated PDF service to respect `executablePath` when provided and retained Docker‑safe flags (`--no-sandbox`, `--disable-dev-shm-usage`).
- Notable commits: `0be609fc` (API Docker + PDF service), `0e032c73` (root Dockerfile + Puppeteer env)
- Production deployment: completed successfully via GitHub Actions “Prod API deploy (Cloud Run)”.

## Revision History
| Rev | Date       | Changes                                      |
|-----|------------|----------------------------------------------|
| 1.0 | 2026-02-21 | Initial release (session export + SOP notes) |

## Notes
Session exported from Warp on 2026-02-21. (sync trigger)
