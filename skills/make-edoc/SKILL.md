---
name: make-edoc
description: >
  Session memorialization and closeout procedure for Nexus Enterprise.
  Triggers on: "Make eDoc", "session export", "close out session", "memorialize session",
  "end session docs", or any request to document what was accomplished in a dev session.
  Creates session export documents in docs/sops-staging/, evaluates features for CAM
  (Competitive Advantage Module) scoring, creates CAM drafts if threshold is met,
  and optionally syncs all documents to Nexus Documents via npm run docs:sync.
---

# Make eDoc — Session Memorialization

## Procedure

Execute these steps in order:

### Step 1: Create Session Export

Create `docs/sops-staging/session-YYYY-MM-DD-[topic-slug].md` with this frontmatter and structure:

```yaml
---
title: "Session Export — [Topic]"
module: session-export
revision: "1.0"
tags: [session-export, relevant-tags]
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---
```

Sections to include:
- **Summary** — 1–3 sentence overview
- **Problems Solved** — Root cause and fix for each issue
- **Decisions Made** — Decision and rationale
- **Code Changes** — File paths with what changed and why
- **Lessons Learned** — Key takeaways

Populate from conversation history. Include file paths, root causes, and rationale — not just "what" but "why".
Topic slug = lowercase-kebab-case derived from session's primary focus.
If the session touched multiple unrelated topics, create one export covering all of them.
Skip for trivial sessions (single quick question, no code changes).

### Step 2: Evaluate for CAMs

For each significant feature or fix, score against four criteria (1–10 each):

- **Uniqueness** — Do competitors have this? (1=common, 10=unique)
- **Value** — How much does this help users? (1=minor, 10=critical)
- **Demonstrable** — Can we show this in a demo? (1=hard, 10=easy)
- **Defensible** — Is this hard to copy? (1=easy, 10=hard)

Present scores to the user. **Threshold: combined ≥ 24/40 → create CAM draft.**

### Step 3: Create CAM Drafts (if threshold met)

Place in `docs/cams/` with ID format `{MODE}-{CATEGORY}-{NNNN}`.
Read `references/cam-template.md` for the full CAM document structure, modes, and categories.

### Step 4: Offer to Sync

Prompt: "Session complete. Created [N] doc(s) and [M] CAM(s). Ready to sync to production?"

If confirmed, run `npm run docs:sync`. If `NEXUS_API_TOKEN` is not in `.env`, inform the user and skip.
