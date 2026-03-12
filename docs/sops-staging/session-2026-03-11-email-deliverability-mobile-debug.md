---
title: "Email Deliverability & Mobile Build Debugging SOP"
module: email-infrastructure
revision: "1.0"
tags: [sop, email, dns, deliverability, mobile, device-trust, debugging]
status: draft
created: 2026-03-11
updated: 2026-03-12
author: Warp
---

# Email Deliverability & Mobile Build Debugging

## Purpose
Documents the root cause analysis and fix for email delivery failures to `@nfsgrp.com` addresses, the mobile build diagnostic process for missing UI features, and the operational procedure for bypassing device trust verification when email is unavailable.

## Problems Solved

### 1. Emails from NCC Not Reaching nfsgrp.com
**Symptom:** All emails sent via Resend from `noreply@mailnexusconnect.com` to `paul@nfsgrp.com` showed `delivery_delayed` or `bounced` in Resend. Emails to `@me.com` and `@gmail.com` delivered instantly.

**Root Cause (two issues):**
1. `mailnexusconnect.com` (sending domain) had **no SPF record** — Gmail couldn't verify the sender was authorized, causing soft-fails and silent drops.
2. `nfsgrp.com` (receiving domain) had **no MX records and no A record** in Cloudflare DNS — mail servers had no authoritative route to deliver email, relying on unreliable fallback mechanisms.

**Fix:**
- Added SPF record to `mailnexusconnect.com` (Name.com DNS):
  - `TXT @ v=spf1 include:amazonses.com ~all`
- Added 5 Google Workspace MX records to `nfsgrp.com` (Cloudflare DNS):
  - `MX @ ASPMX.L.GOOGLE.COM` (priority 1)
  - `MX @ ALT1.ASPMX.L.GOOGLE.COM` (priority 5)
  - `MX @ ALT2.ASPMX.L.GOOGLE.COM` (priority 5)
  - `MX @ ALT3.ASPMX.L.GOOGLE.COM` (priority 10)
  - `MX @ ALT4.ASPMX.L.GOOGLE.COM` (priority 10)
- Added SPF record to `nfsgrp.com` (Cloudflare DNS):
  - `TXT @ v=spf1 include:_spf.google.com ~all`
- User also added `mailnexusconnect.com` to Google Workspace approved senders list.

**Verification:**
```bash
# Check sending domain SPF
dig +short TXT mailnexusconnect.com
# Expected: "v=spf1 include:amazonses.com ~all"

# Check sending domain DKIM
dig +short TXT resend._domainkey.mailnexusconnect.com
# Expected: DKIM public key

# Check receiving domain MX
dig +short MX nfsgrp.com
# Expected: 5 Google MX records

# Check receiving domain SPF
dig +short TXT nfsgrp.com
# Expected: "v=spf1 include:_spf.google.com ~all"
```

### 2. CAM/Class Tabs Missing on iPhone
**Symptom:** InviteScreen showed only "Company" and "Referral" tabs on iPhone, but all 4 tabs (including 🏆 CAM and 🎓 Class) appeared on iPad.

**Diagnostic Process:**
1. Added a debug banner to InviteScreen showing version, build number, `globalRole`, membership roles, and the `isOwnerPlus` evaluation result.
2. iPad showed: `g:SUPER_ADMIN r:MEMBER → true` ✅
3. iPhone showed: `g:NONE r:ADMIN,ADMIN → false` ❌

**Root Cause:** iPhone was logged into a **different user account** — one with `globalRole: NONE` and `ADMIN` role (not the SUPER_ADMIN/OWNER account). Same display name "Paul Gagnon" but different user records in the database.

**Fix:** Logged out on iPhone and logged back in with the correct SUPER_ADMIN credentials.

**Lesson:** When features are gated on roles, always verify the actual auth state on the device — don't assume it's the same account across devices. The debug banner pattern (showing role + build info) is effective for field diagnosis.

### 3. Device Trust Verification Email Not Arriving
**Symptom:** After logging out and back in on iPhone, device trust triggered (new device), but the verification code email never arrived (due to issue #1 above).

**Bypass Procedure (admin-only, for testing):**
```bash
# 1. Find pending challenge keys in Redis
docker exec nexus-shadow-redis redis-cli KEYS "devchallenge:*"

# 2. Get the verification code for a specific user+device
docker exec nexus-shadow-redis redis-cli GET "devchallenge:<userId>:<fingerprint>"
# Returns JSON with "code" field — the 6-digit verification code

# 3. User enters the code on the device verification screen
```

**Important:** This bypass should only be used by admins during testing when email delivery is broken. The code expires after 10 minutes (CHALLENGE_TTL_SECONDS = 600).

## DNS Record Inventory

### mailnexusconnect.com (Name.com)
| Type | Name | Value | Purpose |
|------|------|-------|---------|
| TXT | @ | `v=spf1 include:amazonses.com ~all` | SPF — authorizes Resend/SES |
| TXT | resend._domainkey | (DKIM public key) | DKIM — email signing |
| TXT | _dmarc | `v=DMARC1; p=none;` | DMARC — reporting policy |
| MX | @ | `inbound-smtp.us-east-1.amazonaws.com` (10) | Inbound (Resend) |

### nfsgrp.com (Cloudflare)
| Type | Name | Value | Purpose |
|------|------|-------|---------|
| MX | @ | Google MX records (5 entries) | Route email to Google Workspace |
| TXT | @ | `v=spf1 include:_spf.google.com ~all` | SPF for receiving domain |
| Tunnel | ncc | nexus-shadow | Cloudflare Tunnel |
| Tunnel | staging-api | nexus-shadow | Cloudflare Tunnel |
| Tunnel | staging-ncc | nexus-shadow | Cloudflare Tunnel |

## Resend Email Debugging Commands

```bash
# Check delivery status of a specific email
cd /Users/pg/nexus-enterprise && set -a; source .env.shadow; set +a
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
  "https://api.resend.com/emails/<email-id>" | python3 -m json.tool

# List recent emails (last 10)
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
  "https://api.resend.com/emails?limit=10" | python3 -m json.tool

# Send a plain-text test email
curl -s -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"noreply@mailnexusconnect.com","to":"<address>","subject":"Test","text":"Test email"}'
```

**Resend delivery status values:**
- `sent` — Resend accepted and dispatched; no delivery confirmation yet
- `delivered` — Receiving server accepted the message
- `delivery_delayed` — Receiving server is deferring (greylisting, reputation issue)
- `bounced` — Receiving server permanently rejected
- `opened` — Recipient opened the email (tracking pixel fired)

## Mobile Build Debugging Pattern

When a feature is missing on a device:
1. Add a visible debug banner showing: app version, build number, and the relevant state/check result
2. Push via OTA update (works on iPad) or native TestFlight build (for iPhone if OTA fails)
3. Compare debug output across devices to isolate the variable (build version vs auth state vs API response)
4. Remove debug banner after diagnosis

## Known Issue: OTA Updates Inconsistent on iPhone
OTA updates via `eas update` reliably reached the iPad but not the iPhone during this session. A fresh native TestFlight build was required for iPhone. The root cause is unclear — may be related to Expo Updates caching behavior on iOS. When in doubt, do a full native build + TestFlight submission.

## Related Modules
- Device Trust / 2FA: `apps/api/src/modules/auth/device-trust.service.ts`
- Email Service: `apps/api/src/common/email.service.ts`
- InviteScreen: `apps/mobile/src/screens/InviteScreen.tsx`
- Production Health Monitor: `infra/scripts/prod-health-monitor.sh`

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-12 | Initial release — email deliverability fix, mobile debug, device trust bypass |
