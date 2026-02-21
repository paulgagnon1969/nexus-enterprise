---
title: "Competitive Advantage Module (CAM) System"
module: cam-system
revision: "1.0"
tags: [sop, cam, competitive-advantage, strategy, admin-only]
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
---

# Competitive Advantage Module (CAM) System

## Purpose

Capture and codify competitive advantages discovered during development sessions. CAMs represent features, workflows, or capabilities that differentiate NCC from competitors and provide measurable business value.

## What is a CAM?

A **Competitive Advantage Module** is a documented capability that:
1. Solves a real business problem
2. Is not commonly available in competing products
3. Provides measurable value (time saved, errors prevented, revenue enabled)
4. Can be articulated as a selling point

## CAM Taxonomy

CAMs are organized by **Mode** (functional area) and **Category** (type of advantage):

### Modes (Functional Areas)

| Mode | Code | Description |
|------|------|-------------|
| **Financial** | `FIN` | Invoicing, billing, cost tracking, profitability |
| **Operations** | `OPS` | Project management, scheduling, daily logs |
| **Estimating** | `EST` | PETL, pricing, cost books, Xactimate integration |
| **HR/Workforce** | `HR` | Timecards, payroll, crew management |
| **Client Relations** | `CLT` | Client portal, collaborator access, approvals |
| **Compliance** | `CMP` | Documentation, auditing, regulatory |
| **Technology** | `TECH` | Infrastructure, performance, integrations |

### Categories (Advantage Types)

| Category | Code | Description |
|----------|------|-------------|
| **Automation** | `AUTO` | Eliminates manual work |
| **Intelligence** | `INTL` | AI/ML-powered insights |
| **Integration** | `INTG` | Connects disparate systems |
| **Visibility** | `VIS` | Provides transparency others lack |
| **Speed** | `SPD` | Faster than alternatives |
| **Accuracy** | `ACC` | Reduces errors |
| **Compliance** | `CMP` | Meets regulatory requirements |
| **Collaboration** | `COLLAB` | Enables multi-party workflows |

## CAM Document Structure

Each CAM document follows this format:

```markdown
---
title: "[Mode] - [Brief Title]"
cam_id: "[MODE]-[CATEGORY]-[NNNN]"
mode: [financial|operations|estimating|hr|client|compliance|technology]
category: [automation|intelligence|integration|visibility|speed|accuracy|compliance|collaboration]
status: draft|validated|published|archived
competitive_score: [1-10]  # How unique is this?
value_score: [1-10]        # How much value does it provide?
created: YYYY-MM-DD
session_ref: "[session-file.md]"
tags: [cam, mode, category, ...]

# Visibility Control
visibility:
  public: false              # Show on public website?
  internal: true             # Show in internal NCC docs?
  roles: [admin, pm, exec]   # Which roles can see this?
---

# [CAM Title]

## The Problem
What pain point does this solve? What do competitors do (or not do)?

## The NCC Advantage
How does NCC solve this differently/better?

## Business Value
- Time saved: X hours/week
- Errors prevented: Y%
- Revenue enabled: $Z

## Competitive Landscape
| Competitor | Has This? | Notes |
|------------|-----------|-------|
| Buildertrend | No/Partial/Yes | ... |
| CoConstruct | No/Partial/Yes | ... |
| Procore | No/Partial/Yes | ... |
| Xactimate | No/Partial/Yes | ... |

## Use Cases
1. Scenario A...
2. Scenario B...

## Related Features
- [Link to related docs]

## Session Origin
Discovered in: [session-file.md]
```

## CAM ID Convention

Format: `{MODE}-{CATEGORY}-{NNNN}`

Examples:
- `FIN-AUTO-0001` - Financial automation CAM #1
- `EST-INTG-0003` - Estimating integration CAM #3
- `OPS-VIS-0012` - Operations visibility CAM #12

## Workflow

### 1. Session Closeout (Automatic)

At the end of each development session, Warp evaluates:
- What was built or fixed?
- Does this provide competitive advantage?
- If yes → Generate CAM draft

### 2. CAM Evaluation Criteria

Score each potential CAM:

| Criterion | Question | Score 1-10 |
|-----------|----------|------------|
| **Uniqueness** | Do competitors have this? | 1=common, 10=unique |
| **Value** | How much does this help users? | 1=minor, 10=critical |
| **Demonstrable** | Can we show this in a demo? | 1=hard, 10=easy |
| **Defensible** | Is this hard to copy? | 1=easy, 10=hard |

**CAM Threshold**: Combined score ≥ 24 (out of 40) → Create CAM

### 3. CAM Storage

| Location | Purpose |
|----------|---------|
| `docs/cams/` | Source markdown files |
| Nexus Documents → CAM Library | Production display |
| Website → Features | Marketing content source |

### 4. Self-Assembly for Website

CAMs with `visibility.public: true` auto-populate website sections:

```yaml
# CAM frontmatter for website integration
visibility:
  public: true               # Required for website
  internal: true
  roles: [all]
website:
  section: features|case-studies|why-ncc
  priority: 1-100
  headline: "Short marketing headline"
  summary: "2-3 sentence marketing copy"
```

## Example CAMs from This Session

### CAM: Redis Caching for Instant Price List Access

```
cam_id: EST-SPD-0001
mode: estimating
category: speed
competitive_score: 7
value_score: 8

Problem: Loading 54K price list items from DB takes 800ms+
NCC Advantage: Redis caching reduces to 50ms (16x faster)
Competitors: Most don't cache at this scale
Business Value: Faster estimating = more estimates/day
```

### CAM: Synchronous Fallback for Import Reliability

```
cam_id: TECH-ACC-0001
mode: technology
category: accuracy
competitive_score: 6
value_score: 9

Problem: Background job systems fail silently
NCC Advantage: Graceful sync fallback ensures imports complete
Competitors: Most require Redis/queue to be 100% available
Business Value: Zero lost imports, even during infrastructure issues
```

## Integration with Session Memorialization

Every session closeout should include:

```markdown
## Competitive Advantage Evaluation

### Potential CAMs Identified
- [ ] CAM 1: [Description] - Score: XX/40
- [ ] CAM 2: [Description] - Score: XX/40

### CAMs Created This Session
- [CAM-ID]: [Title] → `docs/cams/[filename].md`
```

## Visibility & Role-Based Access

### Visibility Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `public: true` | Visible on public website | Marketing-ready features |
| `public: false, internal: true` | Internal NCC docs only | Competitive intel, roadmap items |
| `public: false, internal: false` | Archived/hidden | Deprecated or sensitive CAMs |

### Role Definitions

| Role | Description | Typical Access |
|------|-------------|----------------|
| `all` | All authenticated users | General features, SOPs |
| `admin` | System administrators | All documents |
| `exec` | Executive team | Strategy, financials, competitive intel |
| `pm` | Project managers | Operations, scheduling, workflows |
| `estimator` | Estimating team | Pricing, PETL, cost books |
| `accounting` | Accounting/finance | Invoicing, payroll, reporting |
| `field` | Field crews | Daily logs, timecards, safety |
| `client` | External clients (Collaborator) | Scoped project docs only |

### Visibility Examples

```yaml
# Public marketing feature
visibility:
  public: true
  internal: true
  roles: [all]

# Internal competitive intel (execs + admins only)
visibility:
  public: false
  internal: true
  roles: [admin, exec]

# PM-specific workflow doc
visibility:
  public: false
  internal: true
  roles: [admin, pm]

# Archived/deprecated
visibility:
  public: false
  internal: false
  roles: []
```

### Filtering Logic

When rendering documents:

```typescript
function canViewDocument(doc: Document, user: User): boolean {
  const vis = doc.visibility;
  
  // Public docs: anyone (even unauthenticated for website)
  if (vis.public && context === 'website') return true;
  
  // Internal docs: must be authenticated + have matching role
  if (!vis.internal) return false;
  if (vis.roles.includes('all')) return true;
  
  return user.roles.some(role => vis.roles.includes(role));
}
```

## CAM Review Process

1. **Draft** → Created by Warp during session closeout (visibility: internal, roles: [admin])
2. **Review** → PM/Admin evaluates accuracy and scores
3. **Validated** → Confirmed as real competitive advantage (expand roles as appropriate)
4. **Published** → Added to CAM Library, optionally set `public: true` for website

## Metrics & Reporting

Track CAM accumulation over time:
- Total CAMs by mode
- Total CAMs by category
- CAM creation rate (per sprint/month)
- Website-published CAMs
- CAM influence on sales (feedback loop)

## Related Documents

- [Session Memorialization Contract](#session-memorialization)
- [NCC Website Framework](../architecture/website-framework.md)
- [Marketing Content Pipeline](../marketing/content-pipeline.md)

---

## Appendix: Session Memorialization Contract

Add to `WARP.md`:

```markdown
## Session Memorialization Contract

At the end of significant development sessions, Warp MUST:

1. **Create Session Export**
   - Location: `docs/sops-staging/session-[date]-[topic].md`
   - Include: Problems solved, decisions made, code changes, lessons learned

2. **Evaluate for CAMs**
   - Score each significant feature/fix against CAM criteria
   - If score ≥ 24/40, create CAM draft in `docs/cams/`

3. **Tag for Sync**
   - Session exports and CAMs sync to Nexus Documents on push
   - CAMs with `website: true` feed into website content pipeline

4. **Prompt User**
   - "Session complete. Created [N] session doc(s) and [M] CAM(s). Push to sync?"
```
