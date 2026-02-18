---
title: "Cross-Tenant Person Search & Account Linking SOP"
module: cross-tenant-invite
revision: "1.0"
tags: [sop, cross-tenant-invite, account-linking, onboarding, admin, hiring-manager]
status: draft
created: 2026-02-18
updated: 2026-02-18
author: Warp
---

# Cross-Tenant Person Search & Account Linking

## Purpose
This module enables tenant administrators to search for people across the entire NEXUS System by phone number and invite them to their organization. It includes privacy-first search, full token relationship tracking for audit purposes, and automatic account linking to prevent duplicate user accounts.

## Who Uses This
- **Tenant Owners/Admins**: Can search for and invite people to their organization
- **NEXUS System Superusers/Admins**: Can share prospective candidates across tenants
- **Hiring Managers**: Can view cross-tenant invites sent by their organization

## Key Features
- **Privacy-First Search**: Phone search returns only masked phone numbers with initials (e.g., `***.***1234 - PG`)
- **Two-Stage Verification**: User confirms initials match before email is revealed
- **Token Relationship Tracking**: Captures tenant token, inviter people token, and invitee people token for every invite
- **Automatic Account Linking**: When a phone number matches an existing account, emails are automatically linked rather than creating duplicates
- **SMS Verification**: Post-link verification via SMS ensures account security

## Workflow

### Cross-Tenant Person Search

```mermaid
flowchart TD
    A[Admin enters phone number] --> B[Search NEXUS System]
    B --> C{Results found?}
    C -->|No| D[Show "No match found"]
    C -->|Yes| E[Display masked phone + initials list]
    E --> F[Admin selects initials]
    F --> G[Reveal email options]
    G --> H{Correct email?}
    H -->|Yes| I[Proceed to invite]
    H -->|No| J[Enter different email]
    J --> I
```

### Step-by-Step Process

#### Stage 1: Phone Search
1. Navigate to **People → Prospective Candidates** tab
2. In the "Find Person in NEXUS" section, enter the phone number
3. Click **Search**
4. Results display as: `***.***1234 - PG` (masked phone + initials)
5. If multiple people share the phone number, select the correct initials

#### Stage 2: Email Verification
1. After selecting initials, the system reveals available email(s)
2. Emails are shown partially masked initially: `p***@example.com`
3. Select the correct email or click "Use different email" to enter manually
4. Confirm the person to invite

#### Stage 3: Send Invite
1. Confirm target organization (your current tenant)
2. Select role for invitee (default: MEMBER)
3. Click **Send Invite**
4. System creates `CrossTenantInvite` with full token tracking:
   - `tenantToken`: Organization's worker invite token
   - `inviterPeopleToken`: Your unique people token
   - `inviteePeopleToken`: Invitee's people token (if existing user)

### Account Linking (Duplicate Prevention)

When an invite is accepted and the invitee's login email differs from the invite email but their phone matches an existing account:

```mermaid
flowchart TD
    A[Invitee clicks accept] --> B[Enter email to login]
    B --> C{Phone matches existing account?}
    C -->|No| D[Create new account or login]
    C -->|Yes| E[Auto-link email as alias]
    E --> F[Show notification: "Email linked to existing profile"]
    F --> G[Send SMS verification code]
    G --> H[User verifies at convenience]
    H --> I{Verified within 7 days?}
    I -->|Yes| J[Link status: VERIFIED]
    I -->|No| K[Escalate to admin review]
```

#### Key Points
- **No Choice Given**: Account linking is automatic when phone matches
- **Zero Friction**: Linking happens immediately; verification happens later
- **SMS Verification**: User confirms ownership via SMS code sent to phone on file
- **Admin Review Queue**: Unverified links after 7 days appear in admin review

## Access Control

### Who Can Search for People
- Tenant `OWNER` or `ADMIN` role
- `SUPER_ADMIN` global role

### Who Can Share Candidates with Tenants
- `SUPER_ADMIN` global role
- NEXUS System company `OWNER` or `ADMIN` (company ID: `cmjr7o4zs000101s6z1rt1ssz`)

Note: Regular tenant admins can search and invite, but cannot access the "Share with tenants" bulk sharing feature.

## Data Models

### CrossTenantInvite
Tracks each invite with full relationship context:
- `targetCompanyId`: Organization receiving the invitee
- `inviterUserId`: User who sent the invite
- `inviteeUserId`: Existing user being invited (if known)
- `inviteeEmail`: Email for the invite
- `inviteePhone`: Phone used for search
- `token`: Unique invite acceptance token
- `tenantToken`: Company.workerInviteToken snapshot
- `inviterPeopleToken`: Inviter's User.peopleToken
- `inviteePeopleToken`: Invitee's User.peopleToken (if exists)
- `status`: PENDING, ACCEPTED, DECLINED, EXPIRED
- `expiresAt`: 7 days from creation

### UserEmailAlias
Alternate login emails for a single user account:
- `userId`: Canonical account owner
- `email`: Alternate email (unique, can be used to login)
- `verified`: Has user verified via SMS
- `linkedAt`: When the alias was created

### AccountLinkEvent
Audit trail for account linking:
- `primaryUserId`: Account that absorbed the email
- `linkedEmail`: Email that was linked
- `phone`: Phone that triggered the match
- `verificationCode`: SMS code (hashed)
- `status`: PENDING_VERIFICATION, VERIFIED, DISPUTED, UNLINKED_BY_ADMIN

## Security Considerations

### Privacy Protection
- Phone numbers are never fully revealed to searchers (they already know the number)
- Initials confirm identity without exposing full name
- Email is only revealed after identity confirmation via initials

### Referral Fraud Prevention
- One `peopleToken` per person prevents multiple referral payouts for the same person
- Phone serves as identity anchor: same phone = same person
- Accounts with 3+ linked emails flagged for manual review

### Verification Flow
- Account linking is active immediately (no UX friction)
- SMS verification confirms the right person was linked
- Unverified links are visible but flagged in admin queue

## Related Modules
- **Onboarding**: Creates user accounts and onboarding sessions
- **Nex-Net / Prospective Candidates**: Candidate pool management
- **Referrals**: Referral tracking uses `peopleToken` for deduplication
- **Company Invites**: Standard single-tenant invite flow

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/onboarding/cross-tenant/search` | GET | Search by phone, returns masked results |
| `/onboarding/cross-tenant/person/:id` | GET | Get full details after initials selection |
| `/onboarding/cross-tenant/invite` | POST | Create invite with token tracking |

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-18 | Initial release |
