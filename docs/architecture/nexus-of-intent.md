---
title: "The Nexus of Intent — System Definition & Executive Summary"
module: nexus-of-intent
revision: "1.0"
tags: [architecture, philosophy, nexus-of-intent, marketplace, recruitment, collaboration, executive-summary, sovereignty, identity]
status: draft
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# The Nexus of Intent

> *Every action on NCC is simultaneously work AND a marketplace signal. This is the only construction platform where the act of working IS the act of building your marketplace presence.*

> *Profiles curate intent. The marketplace matches it. Collaboration executes it. Transparency settles it.*

---

## The Core Principle

Other platforms are **tools** — they do work but generate no marketplace value. Or they are **marketplaces** — they generate discovery but do no work. NCC is the only system where these two functions are architecturally inseparable.

When a PM captures a receipt, that's **work** — an expense tracked, a bill created, a project's financials updated. But it is simultaneously a **signal** — this company tracks every dollar, this supplier is verified, this PM is thorough. The receipt does its job AND it builds the company's reputation, enriches the supplier map (NexFIND), and feeds regional pricing intelligence (NexPRICE).

This is not a design pattern bolted on after the fact. It is the foundational architecture of the platform. Every one of the 45 Competitive Advantage Modules documented in the [CAM Library](../cams/CAM-LIBRARY.md) has a **Work ↔ Signal** duality — the operational task it performs AND the marketplace intelligence it produces. If a feature cannot articulate both sides, it is not yet part of the Nexus of Intent.

This principle — **"the work IS the signal"** — is what makes NCC structurally impossible to replicate by combining a PM tool with a marketplace. The data that powers the marketplace can only exist because the operational tools generated it. And the operational tools are more valuable because the marketplace rewards using them well.

---

## I. Definition

**Nexus** — Latin: *a connection or series of connections linking two or more things; a connected group; the central and most important point.*

In construction technology, every participant carries an intention:

- A tradesperson intends to work, to be recognized, to build a career
- A contractor intends to deliver projects profitably, to find the right people, to build reputation
- A client intends to get quality work, on time, at a fair price, with transparency
- A supplier intends to sell materials to the people who need them, when they need them

These intentions exist today — scattered across resumes nobody reads, directories nobody trusts, spreadsheets nobody shares, and invoices nobody understands. The intentions are real. The infrastructure to connect them is not.

**NCC is the Nexus of Intent** — the convergence layer where every participant's intention is:

1. **Expressed** through structured, self-governed identity (not forms and profiles — sovereign entities with capability portfolios, asset registries, and availability surfaces)
2. **Verified** through execution data (not star ratings and self-reported claims — computed reputation from actual project delivery)
3. **Matched** through marketplace intelligence (not keyword search and purchased rank — structured query across four dimensions of a sovereign identity)
4. **Executed** through integrated collaboration (not email chains and disconnected portals — cross-company project access with role-based visibility)
5. **Settled** through radical financial transparency (not black-box invoices — every dollar traceable from estimate to receipt to payment)

The word "intent" is deliberate. It is not "connection" (that's a phonebook). It is not "data" (that's a database). It is not "workflow" (that's a PM tool). **Intent** captures the fact that every action on the platform — registering a skill, estimating a project, logging a daily, capturing a receipt, invoicing a client — is simultaneously an operational act AND a signal of what that participant wants, can do, and has proven they deliver.

The Nexus reads these signals. The marketplace acts on them.

---

## II. The Four Pillars

The first three pillars are established in the Sovereign Marketplace CAM ([CLT-INTG-0001](../cams/CLT-INTG-0001-ncc-sovereign-marketplace.md)). The fourth — Intent Signaling — is the mechanism that makes "Nexus of Intent" more than a name.

### Pillar 1: Sovereignty

Every entity on NCC — from a sole proprietor with a truck to a 500-person GC — owns a **sovereign identity**. Not an account. Not a profile. A self-governed digital entity with four dimensions:

- **Capability Portfolio**: verified skills, certifications, trade licenses, insurance, bonding
- **Asset Registry**: crews, equipment, vehicles, facilities, material inventories
- **Availability Surface**: real-time capacity, geographic range, scheduling windows
- **Reputation Ledger**: computed from project execution data — budget accuracy, timeline reliability, documentation quality, compliance record

Sovereignty means the entity controls their identity. They choose what to surface. They choose which projects to pursue. They run their business ON the platform, but the platform works FOR them.

**Implementation grounding:**
- Individual sovereignty: `User` (APPLICANT/INTERNAL) + `OnboardingProfile` + `UserSkillRating` + `UserPortfolio` + `CandidateMarketProfile`
- Company sovereignty: `Company` (tier: CONTRACTOR, kind: ORGANIZATION) + `CompanyMembership` + crew/equipment/asset models
- Client sovereignty: `User` (CLIENT) + `TenantClient` or `Company` (tier: CLIENT) + `ProjectCollaboration`

### Pillar 2: Reputation by Execution

On every other platform, reputation is a *claim*. On NCC, reputation is a *consequence of operation*.

When a contractor estimates a project, that estimate becomes structured data. When that estimate flows into a schedule, daily logs, financial tracking, and invoicing — the system knows: Did they hit the estimate? Did they hit the schedule? Did they maintain documentation? Did they resolve issues promptly?

This isn't a rating. It's a record. Built automatically from the same tools used to run the business.

**Implementation grounding:**
- Project execution data: PETL (Project Estimate Task List), daily logs, bills, invoices, receipts
- Financial accuracy: NexVERIFY convergence, duplicate detection, reconciliation audit chains
- Compliance tracking: NexCheck sign-offs, OSHA eCFR auto-sync
- Aggregate metrics: NexOP (operating percentage of revenue recovered), NexINT (operational integrity score)

### Pillar 3: The Integrated Lifecycle

**Discover → Estimate → Plan → Execute → Track → Invoice → Get Paid → Reputation → Discover again.**

Every existing solution owns one fragment. NCC owns the entire lifecycle. One estimate cascades through scheduling, daily logs, time tracking, material tracking, financial reconciliation, and invoicing. Every data point feeds back into the sovereign's reputation ledger, which feeds marketplace discovery, which generates the next project.

**Implementation grounding:**
- Estimating: Xact import → PETL → price lists (golden/active/master) → BOM pricing
- Scheduling: Gantt/timeline from estimate task structure
- Execution: Daily logs with crew, materials, equipment, receipts
- Finance: Bill auto-posting, receipt OCR, expense convergence, invoice generation
- Reputation: Computed from all of the above (planned: `ReputationLedger` model)

### Pillar 4: Intent Signaling

This is the pillar that makes the "Nexus of Intent" philosophy concrete.

**Every operational action on NCC is simultaneously two things:**
1. An action that does work (creates a bill, logs a daily, registers a skill)
2. A signal that expresses intent to the marketplace

The participant doesn't "build a profile" — they work, and the system reads intent from their work:

| Action | Operational Purpose | Intent Signal |
|--------|-------------------|---------------|
| Register trade skills (1-5 stars) | Onboarding checklist | "Here's what I can do" |
| Upload certifications | Compliance record | "I'm verified in these areas" |
| Assign transactions to projects | Financial tracking | "I'm actively managing this work" |
| Complete daily logs consistently | Field documentation | "I'm reliable and thorough" |
| Hit estimate targets | Project delivery | "I'm accurate" |
| Accept cross-tenant collaboration | Business relationship | "I'm available for this type of work" |
| Capture receipts from a supplier | Expense tracking | "This supplier is real and used" (→ NexFIND) |
| Navigate to a store for materials | Material run | "This store serves this area" (→ NexFIND) |
| Register personal equipment | Asset management | "This is available" (→ Phantom Fleet) |

**The insight**: No construction platform has ever treated operational telemetry as marketplace intelligence. Job boards know what you say you can do. PM tools know what you're doing right now. Only NCC connects the two — what you say, what you do, and how well you do it — into a single, queryable intent graph.

**Implementation grounding:**
- Telemetry: TUCKS (Telemetry, Usage, Compliance, KPI System) — tracks every meaningful action
- Supplier intent: NexFIND receipt bridge + navigation events → verified supplier map
- Equipment intent: Phantom Fleet personal asset sharing → cross-company availability
- Marketplace signals: `CandidateMarketProfile` (anonymized), `NexNetCandidate.visibilityScope`, skill ratings, document completeness

---

## III. How Participants Enter the Nexus

Three entry paths. One identity graph. Every path converges in the marketplace.

### Path A: Individual Self-Registration

**Who**: Tradespeople, laborers, crew members, sole proprietors — anyone who works in construction.

**Entry point**: `https://ncc.nfsgrp.com/welcome` → `/apply`

**Flow:**

<div class="mermaid">
flowchart TD
    A["Welcome Page<br/>/welcome"] -->|"Get Started"| B["Account Creation<br/>/apply"]
    B -->|"New account"| C["Nexis Profile Form<br/>/apply?token=xxx"]
    C --> C1["Referral Confirmation<br/>(if referred)"]
    C1 --> C2["Personal Information<br/>name, phone, DOB, address"]
    C2 --> C3["Document Uploads<br/>photo, gov ID, resume"]
    C3 --> C4["Trade Skills Assessment<br/>1-5 star self-rating by trade"]
    C4 --> D["Status: SUBMITTED"]
    D --> E["Candidate Portal<br/>/settings/profile"]
    E --> F{"Admin Review"}
    F -->|"Approve"| G["Status: APPROVED<br/>CompanyMembership: MEMBER"]
    F -->|"Reject"| H["Status: REJECTED"]
    G --> I["Active in NexNet Pool"]
    I --> J["Visible to marketplace<br/>(CandidateMarketProfile)"]

    style A fill:#1e3a8a,stroke:#3b82f6,color:#fff
    style D fill:#f59e0b,stroke:#d97706,color:#000
    style G fill:#16a34a,stroke:#15803d,color:#fff
    style J fill:#7c3aed,stroke:#6d28d9,color:#fff
</div>

**What's created at each stage:**

| Stage | Data Created | Intent Expressed |
|-------|-------------|-----------------|
| Account creation | `User` (APPLICANT), `CompanyMembership`, `OnboardingSession`, `NexNetCandidate` | "I want to work in construction" |
| Profile completion | `OnboardingProfile`, `OnboardingDocument` (photo, ID, resume) | "Here's who I am" |
| Skills assessment | `OnboardingSkillRating` → synced to `UserSkillRating` | "Here's what I can do (self-assessed)" |
| Submission | Status → SUBMITTED, `UserPortfolio` + `UserPortfolioHr` synced | "I'm ready to be evaluated" |
| Approval | Status → APPROVED/HIRED, `CandidateInterest` recorded | "I'm verified and available" |
| Marketplace | `CandidateMarketProfile` (anonymized headline, skills, region, rate range) | "Discover me" |

**Referral network:**
- Existing users generate referral links via the Referral model
- Each person has a unique `peopleToken` (prevents duplicate referral payouts)
- Referral confirmation is a two-way gate: referee must confirm "yes, this person referred me"
- The referral graph is itself an intent signal: who recommends whom reveals trusted professional networks

**Cross-tenant visibility:**
- Candidates start with `visibilityScope: TENANT_ONLY` — visible only to the company they registered with
- NEXUS System admins can promote to `GLOBAL_POOL` — visible to all subscribing tenants
- `CandidatePoolVisibility` grants fine-grained control: specific companies can be granted (or denied) access to specific candidates
- Companies express interest via `CandidateInterest` with employment window and pay snapshot

### Path B: Company Registration (Contractor Tier)

**Who**: Restoration firms, general contractors, specialty subcontractors, construction companies of any size.

**Flow:**

<div class="mermaid">
flowchart TD
    A["Company Created<br/>tier: CONTRACTOR"] --> B["Owner Account<br/>CompanyMembership: OWNER"]
    B --> C["Invite Team<br/>CompanyInvite / onboarding links"]
    C --> D["Team Members Join<br/>CompanyMembership: MEMBER/ADMIN"]
    D --> E["Operational Setup"]
    E --> E1["Projects created"]
    E --> E2["Price lists imported"]
    E --> E3["Equipment registered"]
    E --> E4["Crew rostered"]
    E1 --> F["Operational Data Accumulates"]
    E2 --> F
    E3 --> F
    E4 --> F
    F --> G["Reputation Ledger Builds"]
    G --> H["Marketplace Discovery<br/>(Sovereign Marketplace)"]

    style A fill:#2563eb,stroke:#1d4ed8,color:#fff
    style H fill:#7c3aed,stroke:#6d28d9,color:#fff
</div>

**Sovereignty dimensions built over time:**

| Dimension | How It's Built | Models |
|-----------|---------------|--------|
| Capability Portfolio | Team skill ratings, certifications, licenses, insurance docs | `UserSkillRating`, `CandidateCertification`, document uploads |
| Asset Registry | Equipment, vehicles, personal assets (Phantom Fleet) | Asset models, crew roster, `CompanyMembership` |
| Availability Surface | Project schedules, crew assignments, capacity gaps | Gantt data, daily log coverage, scheduling models |
| Reputation Ledger | Budget accuracy, timeline reliability, documentation quality | PETL vs. actuals, daily log completion rates, NexOP/NexINT scores |

**Company-level intent signals:**
- Module subscriptions activated (Living Membership) → "These are the capabilities we value"
- NexBRIDGE Desktop installed → "We invest in precision tools"
- Consistent daily log completion → "We're operationally disciplined"
- Cross-tenant collaboration initiated → "We work with other companies professionally"

### Path C: Client Entry (Client Tier)

**Who**: Property owners, insurance adjusters, facility managers, homeowners — anyone receiving construction services.

**Two models exist because client relationships have two scales:**

**Model 1: Individual Client** (most common — one person, one project)

<div class="mermaid">
flowchart LR
    A["Contractor creates project"] --> B["Enters client email"]
    B --> C["'Invite client' checkbox ✓"]
    C --> D["User created (CLIENT)<br/>TenantClient record linked"]
    D --> E["Client sets password"]
    E --> F["Client Portal<br/>/client-portal"]
</div>

- `User` (userType: CLIENT) + `TenantClient` record linked to the project
- No Company entity created — lightweight, zero-friction
- Multiple `TenantClient` records can point to the same User (one per contractor) — enabling cross-contractor project aggregation
- **This is the acquisition flywheel** (CLT-COLLAB-0001): every project invite is a product demo on real data

**Model 2: Organization Client** (company-to-company collaboration)

<div class="mermaid">
flowchart LR
    A["PM opens project SUMMARY"] --> B["Collaborating Organizations → + Add"]
    B --> C{"Company exists?"}
    C -->|"No"| D["Invite new org"]
    D --> E["Company created (tier: CLIENT)"]
    E --> F["Contact user created + OWNER membership"]
    F --> G["Onboarding email sent"]
    C -->|"Yes"| H["Select company"]
    H --> I["Configure role + visibility"]
    G --> I
    I --> J["ProjectCollaboration created"]
</div>

- `Company` (tier: CLIENT) + `ProjectCollaboration` with role and visibility level
- Five collaboration roles: `CLIENT`, `SUB`, `PRIME_GC`, `CONSULTANT`, `INSPECTOR`
- Three visibility levels: `FULL`, `LIMITED`, `READ_ONLY`
- **Upgrade path**: CLIENT-tier companies can upgrade to CONTRACTOR tier via subscription — the client becomes a full sovereign entity

**Client intent signals:**
- Portal login frequency → "I'm engaged with this project"
- Document downloads → "I'm reviewing the work"
- Collaboration acceptance speed → "I'm responsive"
- Upgrade to CONTRACTOR → "I need these tools for my own work" (conversion)

### The Identity Graph

All three paths converge into a single identity graph where every participant has edges to every other participant they've interacted with:

<div class="mermaid">
graph TD
    subgraph "Individual Path"
        I1["Tradesperson<br/>(User: APPLICANT)"] --> I2["NexNet Pool<br/>(NexNetCandidate)"]
        I2 --> I3["Hired by Company<br/>(CandidateInterest: HIRED)"]
    end

    subgraph "Company Path"
        C1["Contractor<br/>(Company: CONTRACTOR)"] --> C2["Creates Projects"]
        C2 --> C3["Invites Clients"]
        C2 --> C4["Hires from Pool"]
    end

    subgraph "Client Path"
        CL1["Client Invited<br/>(User: CLIENT)"] --> CL2["Views Projects"]
        CL2 --> CL3["Upgrades to CONTRACTOR"]
    end

    I3 --> C1
    C3 --> CL1
    CL3 --> C1
    C4 --> I2

    subgraph "Cross-Tenant"
        CT1["Company A<br/>shares candidate with<br/>Company B"]
        CT2["Company A<br/>collaborates on project with<br/>Company B"]
    end

    C1 --> CT1
    C1 --> CT2

    style I1 fill:#f59e0b,stroke:#d97706,color:#000
    style C1 fill:#2563eb,stroke:#1d4ed8,color:#fff
    style CL1 fill:#16a34a,stroke:#15803d,color:#fff
    style CL3 fill:#7c3aed,stroke:#6d28d9,color:#fff
</div>

**Key property**: the graph is self-densifying. Every new edge (hire, collaboration, client invite, candidate share) increases the value of every existing node. A tradesperson who has worked for 3 contractors has 3× the reputation signal. A contractor who has collaborated with 10 clients has 10× the social proof. A client who has been on the platform across 5 contractors has 5× the switching cost.

---

## IV. Cross-Tenant Collaboration — The Sublime Backbone

This is the architecture that makes NCC fundamentally different from every other construction platform. Not "multi-tenant SaaS" — that's table stakes. **Cross-tenant collaboration**: the ability for separate, sovereign companies to share people, projects, and intelligence while maintaining complete autonomy.

### The Five Collaboration Mechanisms

#### 1. ProjectCollaboration — Cross-Company Project Access

The `ProjectCollaboration` model connects a collaborating Company to a project owned by another Company. Five roles define the relationship:

| Role | Typical Entity | Access Pattern |
|------|---------------|----------------|
| `CLIENT` | Property owner, insurance company | View project status, financials, daily logs |
| `SUB` | Subcontractor | View assigned scope, log daily, submit bills |
| `PRIME_GC` | General contractor (when project owner is the client) | Full project management |
| `CONSULTANT` | Engineer, architect, inspector | View and comment on specific project aspects |
| `INSPECTOR` | Building inspector, compliance auditor | View compliance docs, sign-off workflows |

Visibility is capped per collaboration: `FULL`, `LIMITED`, or `READ_ONLY`. Within that cap, the user's `RoleProfile` within their own Company further restricts what they see.

**Intent signal**: The role a company plays on a project IS their intent — a SUB intends to deliver scope, a CLIENT intends to oversee quality, a CONSULTANT intends to advise. The system knows what each participant's intention is on every project.

#### 2. Dual-User Portal Routing — One Identity, Every Role

A single `User` can be a CLIENT on one project and an ADMIN on another, across different companies. The system resolves this at login:

- `hasPortalAccess` flag computed from cross-company project affiliations
- Portal-eligible users always land on the client portal first (clean, unconfused)
- "Project Portal" button opens the full internal workspace with ALL projects grouped by contractor
- Per-project role enforcement — click into any project, see exactly the view for that role
- "Return to Client Portal" pill for instant context switching

**Implementation**: `GET /users/me` returns `hasPortalAccess`. `GET /projects/all-affiliated` aggregates projects from direct memberships, cross-tenant collaborations, and OWNER/ADMIN company access.

**Intent signal**: Which view a user spends time in reveals their primary intent — managing their own work (internal) vs. overseeing work done for them (client).

#### 3. Cross-Tenant Person Search & Account Linking

When a company wants to hire someone who already exists on the platform (working for a different company), the cross-tenant search enables discovery without violating privacy:

**Stage 1 — Privacy-first search**: Admin enters phone number → system returns masked results (`***.***1234 - PG`)
**Stage 2 — Identity confirmation**: Admin selects initials → email revealed → confirm identity
**Stage 3 — Invite sent**: `CrossTenantInvite` created with full token tracking (tenant token, inviter people token, invitee people token)

**Account linking**: When the invited person's login email differs from the invite email but the phone matches an existing account, the system automatically links the emails as aliases (`UserEmailAlias`). No duplicate accounts. SMS verification happens asynchronously — zero friction at the moment of hire.

**Intent signal**: A cross-tenant search IS a hiring intent signal. The system knows which companies are looking for which types of people, creating marketplace intelligence about labor demand by trade and region.

#### 4. NexNet Candidate Pool Sharing

The NexNet is the network-level recruitment layer. Candidates in the pool have controlled visibility:

- `TENANT_ONLY` — visible only to the company they registered with (default)
- `GLOBAL_POOL` — visible to all subscribing tenants in the marketplace
- Fine-grained: `CandidatePoolVisibility` grants access per-candidate per-company

NEXUS System administrators can share batches of candidates with specific tenants: `POST /company/:companyId/share-prospects`. This enables curated talent distribution — the platform can match verified candidates to companies based on trade, location, and availability.

Companies express interest via `CandidateInterest`:
- Status lifecycle: `REQUESTED` → acknowledged → `HIRED` (with employment window + pay snapshot)
- Pay snapshot captures `baseHourlyRate`, `dayRate`, `cpHourlyRate`, `cpFringeHourlyRate` at the moment of hire
- This creates anonymized compensation intelligence across the network (→ feeds into state occupational wage comparisons via `StateOccupationalWageSnapshot`)

**Intent signal**: Pool visibility IS intent. A candidate in GLOBAL_POOL intends to be discovered. A company expressing CandidateInterest intends to hire. The density of interest signals per trade per region reveals real-time labor market dynamics.

#### 5. The Referral Graph — Trust as Intent

The referral system creates a trust graph overlaid on the identity graph:

- Every user has a unique `peopleToken` — one person, one identity, no matter how many emails or accounts
- Referrals are two-way: referrer invites, referee confirms ("Yes, this person referred me")
- `ReferralRelationship` tracks the ongoing connection (PERSONAL or COMPANY type)
- The graph reveals who trusts whom — a professional recommendation network built from actual hiring relationships

**Intent signal**: A referral is the strongest possible intent signal — "I know this person, I trust their work, I'm willing to stake my reputation on them."

### The Collaboration Graph — Why This Matters

When you combine all five mechanisms, you get a graph that no competitor has:

```
Company A (CONTRACTOR)
  ├── Employs: Worker 1 (hired via NexNet from Company B's pool)
  ├── Employs: Worker 2 (self-registered, referred by Worker 1)
  ├── Project X
  │   ├── Collaboration: Company C (CLIENT, LIMITED)
  │   ├── Collaboration: Company D (SUB, FULL)
  │   └── Client: Jane Doe (User: CLIENT, TenantClient)
  ├── Project Y
  │   ├── Collaboration: Company C (CLIENT, LIMITED) ← same client, different project
  │   └── Collaboration: Company E (CONSULTANT, READ_ONLY)
  └── Shared candidates with Company D (CandidatePoolVisibility)

Company C (CLIENT → upgrading to CONTRACTOR)
  ├── Views projects via client portal (Projects X, Y)
  ├── Also has internal projects (upgraded)
  └── Dual-user routing: CEO is CLIENT on X, ADMIN on internal projects

Company D (CONTRACTOR)
  ├── SUB on Company A's Project X
  ├── Received shared candidates from Company A
  ├── Has own projects where Company A is a CONSULTANT
  └── Workers cross-assigned via CandidateInterest
```

**Every edge in this graph is an intent signal.** The density and directionality of the graph tells the marketplace:
- Which companies work together frequently (trust signal)
- Which companies are hiring (demand signal)
- Which individuals are sought after by multiple companies (reputation signal)
- Which clients use the most contractors (volume signal → upgrade potential)

**This is the "sublime backbone" — the reason NCC is not a tool but a system.** The tools (estimating, scheduling, daily logs, invoicing) generate operational data. The collaboration graph converts that data into marketplace intelligence. The marketplace matches intent. And the cycle repeats.

---

## V. The Data Flywheel (Extended)

The CLT-INTG-0001 Sovereign Marketplace CAM defines the basic flywheel:

```
REGISTER → OPERATE → REPUTATION → DISCOVERY → MORE WORK → MORE DATA → STRONGER REPUTATION
```

With intent signaling, the flywheel has a second, parallel loop:

```
REGISTER as sovereign entity
  → Curate capability portfolio + asset registry
    → INTENT SIGNALS accumulate (skill ratings, certifications, module activation)
      → Get DISCOVERED in marketplace (structured query across 4 dimensions)
        → Win project
          → OPERATE using NCC tools
            → MORE INTENT SIGNALS accumulate (execution data, collaboration patterns)
              → REPUTATION LEDGER updates automatically
                → Stronger reputation + richer intent profile
                  → BETTER DISCOVERY ranking + CROSS-TENANT opportunities
                    → More projects → More data → More signals
                      → CYCLE ACCELERATES

Parallel loop (network intelligence):
  Every operation feeds platform-wide intelligence:
    Receipt captured → NexFIND supplier verified (OPS-INTL-0001)
    Material purchased → NexPRICE regional pricing updated (FIN-INTL-0003)
    Worker hired cross-tenant → Labor market signal recorded
    Equipment registered → Phantom Fleet availability updated (OPS-COLLAB-0001)
    Module activated → Feature demand signal (OPS-VIS-0001b)
```

**Critical flywheel properties (from CLT-INTG-0001, extended):**

1. **Self-reinforcing**: Every project makes the sovereign more discoverable
2. **Zero-friction**: The sovereign works, the profile builds itself
3. **Compounding**: 50 completed projects = 50× the reputation signal
4. **Switching-cost generating**: Reputation, history, and collaboration graph are non-portable
5. **Network-effect amplifying**: More sovereigns = more marketplace value per sovereign
6. **Intent-compounding** (new): Intent signals don't just accumulate — they compound. A tradesperson with 50 skill ratings, 20 project completions, and 5 cross-tenant hires has an intent profile so rich that the marketplace can predict what work they're best suited for before they even search for it.

---

## VI. NCC Executive Summary

*For pitch decks, investor updates, website copy, and the CAM handbook introduction.*

---

### The One-Sentence Version

**NCC is the only platform where a contractor's daily work — estimating, scheduling, building, tracking, invoicing — automatically builds a verified professional reputation that makes them discoverable to their next client, creating a self-reinforcing cycle that no marketplace, no PM tool, and no estimating software can replicate alone.**

### The One-Paragraph Version

Nexus Contractor Connect is a sovereign operating environment for the construction industry. Individuals self-register with verified skills and credentials. Companies establish sovereign identities with capability portfolios, asset registries, and real-time availability. Clients are invited into projects with one checkbox and experience the platform on their own data — then upgrade when they need the tools for their own work. Every operational action — every estimate, daily log, receipt, and invoice — simultaneously does work and signals intent to a marketplace that matches participants by verified execution, not purchased rank. 45 Competitive Advantage Modules span financial operations, estimating, project management, compliance, and technology infrastructure. Together they recover ~6–12% of revenue (NexOP) and raise operational integrity from an industry baseline of ~72% to ~95% (NexINT). The integrated lifecycle creates a seven-domain moat that no single-function competitor can replicate.

### The Three-Pillar Version (for slide decks)

**1. Sovereignty & Identity**
Every participant owns a self-governed digital identity. Individuals curate skills and credentials through self-registration. Companies build living capability portfolios from operational data. Clients maintain cross-contractor project visibility. No middlemen. No gatekeepers.

*Built on*: Self-registration flow, NexNet candidate pool, Client Tenant Tier (CLT-COLLAB-0001), Dual-User Portal Routing (CLT-COLLAB-0002)

**2. Marketplace Powered by Intent**
Discovery is not keyword search — it's structured query across capability, availability, reputation, and proximity. Every operational action is an intent signal that feeds the marketplace. Suppliers are verified by actual receipts (NexFIND), not paid listings. Regional pricing is crowdsourced from real purchases (NexPRICE), not estimates. Workers are matched by verified skills and execution history, not resumes.

*Built on*: CandidateMarketProfile, NexFIND (OPS-INTL-0001), NexPRICE (FIN-INTL-0003), TUCKS telemetry (TECH-INTL-0001b), Living Membership (FIN-INTG-0001)

**3. Cross-Company Collaboration & Transparency**
Separate companies collaborate on shared projects with role-based access and visibility controls. One identity spans client and internal roles across unlimited companies. Cross-tenant candidate sharing creates a network-level recruitment layer. Every dollar is traceable from checking account to receipt line item to project allocation.

*Built on*: ProjectCollaboration (5 roles, 3 visibility levels), cross-tenant search + account linking, NexNet pool sharing, NexVERIFY (FIN-ACC-0001), Purchase Reconciliation (FIN-VIS-0001)

### The Numbers

| Metric | Value | Source |
|--------|-------|--------|
| Competitive Advantage Modules | 45 | CAM Library |
| Revenue recovered (NexOP) | ~6–12% | Portfolio-wide aggregate |
| Operational integrity improvement | 72% → 95% (NexINT) | 4-dimension integrity index |
| Highest-scoring CAM | 37/40 (3-way tie) | CLT-INTG-0001, EST-ACC-0002, TECH-AUTO-0001 |
| Densest CAM area | Financial Operations (13 CAMs) | FIN mode |
| Participant types | 3 (Individual, Company, Client) | Identity graph |
| Collaboration roles | 5 (Client, Sub, Prime GC, Consultant, Inspector) | ProjectCollaboration model |
| Entry paths | 3 (self-register, company register, client invite) | Onboarding system |

---

## VII. Taglines & Positioning

### Primary Tagline
> **Nexus of Intent: Where every participant's goal becomes the platform's action.**

### Alternatives (by audience)

**Investor-facing:**
> *The only construction platform where operational tools, marketplace discovery, and financial transparency form a single self-reinforcing system. 45 competitive advantages. 7-domain moat. Network effects from day one.*

**Contractor-facing:**
> *Your work builds your reputation. Your reputation finds your next project. No ads. No leads. No guesswork.*

**Client-facing:**
> *See every project, across every contractor, in one place. Every dollar transparent. Every milestone tracked.*

**Tradesperson-facing:**
> *Register your skills. Get discovered by contractors who need exactly what you do. Your record speaks for itself.*

### The Sentence (from CLT-INTG-0001)
> **NCC is the only platform where a contractor's daily work — estimating, scheduling, building, tracking, invoicing — automatically builds a verified professional reputation that makes them discoverable to their next client, creating a self-reinforcing cycle that no marketplace, no PM tool, and no estimating software can replicate alone.**

---

## VIII. Relationship to the CAM Portfolio

Every CAM in the portfolio is a node in the Nexus of Intent:

**Discovery & Recruitment Layer**
- CLT-INTG-0001 — Sovereign Marketplace (the marketplace itself)
- CLT-COLLAB-0001 — Client Tenant Tier (acquisition flywheel)
- CLT-COLLAB-0002 — Dual-User Portal Routing (seamless cross-company UX)
- OPS-COLLAB-0001 — Phantom Fleet (equipment discovery)
- OPS-INTL-0001 — NexFIND Supplier Intelligence (supplier discovery)
- OPS-VIS-0001b — Intelligent Feature Discovery (module activation)

**Identity & Reputation Layer**
- CMP-AUTO-0001 — NexCheck (compliance as a credential)
- CMP-INTG-0001 — OSHA eCFR Auto-Sync (regulatory currency)
- TECH-INTL-0001b — TUCKS Telemetry (usage as reputation signal)
- TECH-VIS-0001 — NexOP (revenue impact metric)
- TECH-VIS-0002 — NexINT (operational integrity score)

**Operational Execution Layer**
- EST-AUTO-0002 — NexPLAN (estimating → lifecycle entry point)
- EST-INTG-0001 — BOM Pricing (competitive estimates → more work)
- OPS-VIS-0002 — Urgency Dashboard (execution visibility)
- OPS-AUTO-0001 — Group Task Cascading (multi-PM coordination)
- FIN-AUTO-0002 — Transaction-to-Bill Auto-Posting (zero-gap billing)

**Financial Transparency Layer**
- FIN-ACC-0001 — NexVERIFY (expense convergence → audit integrity)
- FIN-ACC-0002 — Zero-Loss Receipt Capture (complete financial record)
- FIN-VIS-0001 — Purchase Reconciliation Audit Chain (5-layer traceability)
- FIN-VIS-0002 — Invoice Retail Transparency (client-facing clarity)
- FIN-INTG-0001 — Living Membership (modular commerce engine)
- FIN-INTL-0003 — NexPRICE (crowdsourced pricing intelligence)

**Technology Infrastructure Layer**
- TECH-AUTO-0001 — NexBRIDGE Distributed Compute Mesh (edge computing)
- TECH-INTG-0001a — NexBRIDGE Modular Subscription (desktop revenue)
- TECH-INTG-0001b — NexCAD Precision Scan (LiDAR → CAD pipeline)
- TECH-SPD-0003 — Smart Media Upload (field reliability)
- TECH-ACC-0001 — Graceful Sync Fallback (infrastructure resilience)

**Together they form the Nexus of Intent — the reason NCC doesn't just manage projects… it aligns human intention at enterprise scale.**

---

## IX. What's Not Yet Built (Honest Gap Assessment)

The following elements are described in the philosophy but not yet implemented:

| Element | Status | Priority |
|---------|--------|----------|
| Reputation Ledger (computed, queryable) | Designed, not implemented | High — core to marketplace ranking |
| Marketplace Discovery UI (structured search) | Designed in CLT-INTG-0001 | High — the revenue-facing surface |
| Individual-to-marketplace profile publishing | `CandidateMarketProfile` model exists, UI not built | Medium |
| Company-to-marketplace profile publishing | Sovereignty dimensions defined, no marketplace listing UI | Medium |
| NexPRICE cross-tenant price aggregation | Model designed, anonymization layer not built | Medium |
| Phantom Fleet cross-company visibility | Personal asset model exists, marketplace surface not built | Medium |
| Automated intent signal scoring | TUCKS telemetry collects data, scoring engine not built | Lower |
| Premium marketplace placement (paid boost) | Not started | Future (revenue lever) |
| Verification services (third-party cert verify) | Not started | Future (trust layer) |

**This is the roadmap implicit in the philosophy.** Every gap is a feature that, when built, adds another thread to the intent graph and another reason the flywheel accelerates.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — system definition, four pillars, three entry paths, cross-tenant collaboration, executive summary, gap assessment |
