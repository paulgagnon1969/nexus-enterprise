---
title: "Self-Registration Operations Study Guide"
module: self-registration
revision: "1.0"
tags: [sop, self-registration, onboarding, recruiting, operations, all-users]
status: draft
created: 2026-02-23
updated: 2026-02-23
author: Warp
visibility:
  public: false
  internal: true
  roles: [all]
---

# Self-Registration — From Welcome to Approved

## Purpose
This study guide documents the complete self-registration workflow for new candidates entering the Nexus Contractor Connect (NCC) platform. It covers every screen and system action from the public welcome page through final admin approval.

## Who Uses This
- **Candidates / Applicants** — registering themselves for the first time
- **HR / Hiring Managers** — reviewing and approving submitted profiles
- **Admins / Owners** — managing the Prospective Candidates pipeline
- **SUPER_ADMIN** — Nexus System-level oversight of the recruiting pool

---

## End-to-End Flow Overview

### Flowchart

<div class="mermaid">
flowchart TD
    A["1. /welcome — Landing Page"] -->|"Get Started" or "Get Started Free"| B["2. /apply — Account Creation"]
    B -->|Email already exists → 409| B1["Auto-login attempt"]
    B1 -->|Password matches| B2["Redirect by role"]
    B1 -->|Password fails| B3["Show error: use /login"]
    B -->|New account → 200| C["3. /apply?token=xxx — Nexis Profile Form"]
    C --> C1["3a. Referral Confirmation (if applicable)"]
    C1 --> C2["3b. Your Information"]
    C2 --> C3["3c. Document Uploads"]
    C3 --> C4["3d. Trade Skills Self-Assessment"]
    C4 --> C5{"Submit Nexis Profile"}
    C5 -->|Missing fields?| C6["Completion Hint Modal"]
    C6 -->|"Go back"| C2
    C6 -->|"Submit anyway"| D
    C5 -->|All fields present| D["4. Status → SUBMITTED"]
    D --> D1["Auto-login → /settings/profile"]
    D --> D2["Fallback → /login"]
    D1 --> E["5. Candidate Portal (/settings/profile)"]
    E --> F["6. Admin Reviews in Prospective Candidates"]
    F -->|Approve| G["7. Status → APPROVED"]
    F -->|Reject| H["Status → REJECTED"]

    style A fill:#1e3a8a,stroke:#3b82f6,color:#fff
    style B fill:#2563eb,stroke:#1d4ed8,color:#fff
    style C fill:#2563eb,stroke:#1d4ed8,color:#fff
    style D fill:#f59e0b,stroke:#d97706,color:#000
    style G fill:#16a34a,stroke:#15803d,color:#fff
    style H fill:#dc2626,stroke:#b91c1c,color:#fff
</div>

---

## Step-by-Step Walkthrough

### Step 1 — Welcome Page (`/welcome`)

**URL:** `https://ncc-nexus-contractor-connect.com/welcome`

**What the user sees:**
- NCC logo and "Nexus Contractor Connect" branding in the header
- Navigation links: Features, About, Privacy, Security, Sign In
- Hero section: "Build Smarter. Connect Faster." tagline
- **"Get Started"** button (primary CTA → links to `/apply`)
- **"Sign In →"** button (secondary → links to `/login`)
- Feature cards: Project Management, Workforce Management, Document Control, Financial Tracking, Reports & Analytics, Messaging & Alerts
- About section, Privacy Policy (inline), Security & Compliance summary
- Bottom CTA banner: "Ready to streamline your operations?" with a second "Get Started Free" link to `/apply`
- Footer: Privacy Policy, Security, Support links

**Key navigation paths from this page:**
- "Get Started" / "Get Started Free" → `/apply`
- "Sign In" → `/login`
- "Security" → `/security` (full Information Security Policy page)

---

### Step 2 — Account Creation (`/apply`)

**URL:** `https://ncc-nexus-contractor-connect.com/apply`

**What the user sees:**
- Nexus deconstruct animation header image
- Headline: "NEXUS Contractor-Connect" (or custom branding headline from Nexus System landing config)
- Optional subheadline and custom logo (pulled from `GET /companies/system-landing-config-public`)
- If arrived via referral link (`?referralToken=xxx`): banner showing "You were referred to Nexis by [Name]"
- Registration form with three fields:
  - **Email** (required)
  - **Password** (min 8 characters, with show/hide toggle)
  - **Confirm password** (with show/hide toggle)
- **"Start application"** button (disabled until email is valid, password ≥ 8 chars, and passwords match)
- Footer text: "Already a member of the Network? Log in at /login."

**What happens on submit (`POST /onboarding/start-public`):**

1. API normalizes the email (lowercase, trimmed)
2. Checks if email already exists in the system:
   - **If yes (409):** Frontend attempts auto-login with the provided password
     - Password matches → redirect by user type (APPLICANT → `/settings/profile`, SUPER_ADMIN → `/system`, else → `/projects`)
     - Password fails → error: "Account already exists, use /login or reset password"
   - **If no:** Proceeds to create the account
3. API creates:
   - A new `User` record with `userType: APPLICANT` and Argon2-hashed password
   - A `CompanyMembership` in the resolved company (Nexus System pool by default, or specific tenant if `companyToken` was provided)
   - An `OnboardingSession` with `status: NOT_STARTED` and a unique token
   - A `NexNetCandidate` entry (for Nex-Net system tracking)
   - If referral token provided: links the referral record to this candidate
4. API returns the session token
5. Frontend stores email/password in `sessionStorage` for auto-login after profile submission
6. Frontend redirects to `/apply?token=<session_token>`

**Optional query parameters:**
- `referralToken` — credits a referrer in the Nex-Net system
- `companyToken` / `companyReferralToken` — attaches the user to a specific tenant instead of the global pool
- `inviterToken` / `peopleToken` — attributes signup to a specific inviter for audit

---

### Step 3 — Nexis Profile Form (`/apply?token=xxx`)

**URL:** `https://ncc-nexus-contractor-connect.com/apply?token=<session_token>`

When a valid token is present, the page renders the `PublicOnboardingForm` component instead of the account creation form. The form loads the session state from `GET /onboarding/:token` and the skills matrix from `GET /onboarding/:token/skills`.

#### 3a. Referral Confirmation (conditional gate)

If the candidate was referred (`GET /onboarding/:token/referrer` returns data):
- A full-page gate appears before the profile form
- Shows: "Before we continue building your Nexis profile, please confirm whether the person below referred you."
- Referrer name and email displayed
- Two buttons: **"Yes, that's my referrer"** / **"No, I wasn't referred by this person"**
- Calls `POST /onboarding/:token/referrer/confirm` with `{ decision: "accept" | "reject" }`
- Once confirmed or rejected, the full profile form loads

#### 3b. Your Information

Profile fields (all auto-save on blur + debounced autosave every 1.5s):
- **First name** and **Last name** (side by side)
- **Mobile phone**
- **Date of birth** (date picker)
- **Address line 1** and **Address line 2** (optional)
- **City** and **State** (dropdown with all US states)
- **Postal code** and **Country** (defaults to "USA")

Each field change triggers `POST /onboarding/:token/profile` which updates the `OnboardingProfile` and the session checklist.

#### 3c. Document Uploads

Three upload slots (all optional, auto-upload on file selection):
- **Profile photo** — `type: PHOTO` (image files)
- **Government ID / Driver's License** — `type: GOV_ID` (image files)
- **Resume / Executive Summary** — `type: OTHER` (PDF, Word, or image)

Each upload calls `POST /onboarding/:token/document` (multipart form data). The API:
- Stores the file in `uploads/onboarding/`
- Creates an `OnboardingDocument` record
- Updates the session checklist flags (`photoUploaded`, `govIdUploaded`, `attachmentsUploaded`)
- Syncs photo to `UserPortfolio` and all docs to HR portfolio

#### 3d. Trade Skills Self-Assessment

- Loads the full skills matrix from the system
- Organized by **Functional Area** (category) → **Trade** → individual skills
- Collapsible category groups showing rated/total count and average self-rating
- Three filter controls: Functional Area dropdown, Trade dropdown, Search input
- Each skill has a **1–5 star rating** (Novice to Expert)
- Ratings are batched and saved on final submission

#### Submit

- **"Submit Nexis profile"** button
- If required fields are missing (first name, last name, phone, address, city, state, postal code, country):
  - A **completion hint modal** appears listing missing fields
  - Two options: **"Go back and add info"** or **"Submit anyway"**
- On submit, the system:
  1. Saves profile fields (`POST /onboarding/:token/profile`)
  2. Saves skill ratings (`POST /onboarding/:token/skills`)
  3. Submits the session (`POST /onboarding/:token/submit`) → status becomes **SUBMITTED**
  4. Syncs skill ratings to `UserSkillRating` table
  5. Syncs profile info to `UserPortfolio` + HR contact info
  6. Advances linked NexNetCandidate to `SUBMITTED` status
  7. Notifies referrers via in-app notification + email
- After successful submission:
  - Auto-login attempt using stored `sessionStorage` credentials
  - Success → redirect to `/settings/profile` (candidate portfolio)
  - Failure → redirect to `/login?email=<email>`

---

### Step 4 — Candidate Portal (`/settings/profile`)

After submission, the candidate lands on their portfolio page. Here they can see:
- Their profile photo and contact information
- Onboarding status (Submitted, Under Review, Approved, or Rejected)
- Their uploaded documents
- Portfolio visibility status: "visible to Nexus System and invited organizations"

The `/candidate` route also exists but immediately redirects to `/settings/profile`.

**Post-login routing logic:**
- `userType === "APPLICANT"` → `/settings/profile`
- `globalRole === "SUPER_ADMIN"` → `/system`
- Everyone else → `/projects`

---

### Step 5 — Admin Review (Prospective Candidates)

**Who can review:** OWNER, ADMIN, or users with `profileCode: HIRING_MANAGER`

**Endpoints used:**
- `GET /onboarding/company/:companyId/prospects` — list all prospective candidates
- `GET /onboarding/sessions/:id` — detailed view of one candidate's session
- `POST /onboarding/sessions/:id/detail-status` — set pipeline status codes (custom per-company)
- `POST /onboarding/sessions/:id/profile` — edit candidate profile fields
- `POST /onboarding/sessions/:id/bank-info` — edit bank info (HR/admin only)

**Review capabilities:**
- View candidate profile, uploaded documents, skill self-ratings, referral history
- See multi-tenant assignment info (which companies the candidate is visible to)
- Set custom pipeline status codes (defined via `GET /company/:companyId/status-definitions`)
- Edit candidate profile fields for normalization (e.g., fix capitalization, fill missing city/state)
- Share candidates with other tenant companies (`POST /company/:companyId/share-prospects`)

---

### Step 6 — Approval or Rejection

#### Approve (`POST /onboarding/sessions/:id/approve`)

**Authorization:** OWNER, ADMIN, or HIRING_MANAGER in the session's company

**What happens:**
1. Finds or creates a `User` record for the session email
2. Ensures a `CompanyMembership` exists (role: MEMBER)
3. Syncs onboarding skill ratings → `UserSkillRating` (self-level)
4. Sets session status to **APPROVED**
5. Updates NexNetCandidate status to `HIRED`
6. Records `CandidateInterest` as HIRED with pay snapshot (if available from Worker/HR portfolio)

#### Reject (`POST /onboarding/sessions/:id/reject`)

Sets session status to **REJECTED**.

---

## Status Lifecycle

<div class="mermaid">
stateDiagram-v2
    [*] --> NOT_STARTED: Account created
    NOT_STARTED --> IN_PROGRESS: Profile field saved or document uploaded
    IN_PROGRESS --> IN_PROGRESS: More edits / uploads
    IN_PROGRESS --> SUBMITTED: Candidate clicks "Submit Nexis profile"
    NOT_STARTED --> SUBMITTED: Submit with minimal info
    SUBMITTED --> UNDER_REVIEW: Admin opens for review (implicit)
    SUBMITTED --> APPROVED: Admin approves
    SUBMITTED --> REJECTED: Admin rejects
    UNDER_REVIEW --> APPROVED: Admin approves
    UNDER_REVIEW --> REJECTED: Admin rejects
</div>

---

## Key API Endpoints Summary

**Public (no auth):**
- `POST /onboarding/start-public` — create account + onboarding session
- `GET /onboarding/:token` — fetch session by token
- `POST /onboarding/:token/profile` — upsert profile fields
- `POST /onboarding/:token/document` — upload document (multipart)
- `GET /onboarding/:token/skills` — fetch skills matrix
- `POST /onboarding/:token/skills` — save skill ratings
- `POST /onboarding/:token/submit` — finalize submission
- `GET /onboarding/:token/referrer` — fetch referrer info
- `POST /onboarding/:token/referrer/confirm` — accept/reject referral

**Authenticated (JWT required):**
- `GET /onboarding/my-session` — candidate self-view
- `POST /onboarding/start-self` — bootstrap own profile if missing
- `GET /onboarding/company/:companyId/prospects` — list prospective candidates
- `GET /onboarding/sessions/:id` — review detail view
- `POST /onboarding/sessions/:id/approve` — approve candidate
- `POST /onboarding/sessions/:id/reject` — reject candidate
- `POST /onboarding/sessions/:id/detail-status` — set pipeline status
- `POST /onboarding/company/:companyId/share-prospects` — share with other tenants

---

## Data Model Touchpoints

<div class="mermaid">
erDiagram
    User ||--o{ CompanyMembership : has
    User ||--o{ OnboardingSession : owns
    OnboardingSession ||--|| OnboardingProfile : has
    OnboardingSession ||--o{ OnboardingDocument : contains
    OnboardingSession ||--o{ OnboardingSkillRating : rates
    User ||--o{ UserSkillRating : "synced from onboarding"
    User ||--o{ UserPortfolio : "portfolio per company"
    UserPortfolio ||--|| UserPortfolioHr : "encrypted HR data"
    User ||--o{ NexNetCandidate : "recruiting pool entry"
    NexNetCandidate ||--o{ Referral : "referred by"
    NexNetCandidate ||--o{ CandidateInterest : "tenant interest"
    NexNetCandidate ||--o{ CandidatePoolVisibility : "visible to tenants"
    Company ||--o{ CompanyMembership : employs
    Company ||--o{ OnboardingSession : recruits
</div>

---

## Security Notes

- Passwords are hashed with **Argon2id** before storage (never stored in plaintext)
- Session tokens are 24-byte random hex strings (cryptographically generated)
- Credentials are temporarily held in `sessionStorage` (not `localStorage`) for auto-login and cleared after use
- All document uploads stored server-side in `uploads/onboarding/` with token-prefixed filenames
- HR data (pay rates, banking info) encrypted at rest with AES-256-GCM
- Multi-tenant isolation enforced at the database query level — candidates are only visible to companies with explicit `CandidatePoolVisibility` grants

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-23 | Initial release — full self-registration flow documented from codebase |
