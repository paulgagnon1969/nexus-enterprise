---
title: "Plaid OAuth Integration SOP"
module: billing
revision: "1.0"
tags: [sop, billing, plaid, oauth, bank-linking, admin]
status: draft
created: 2026-02-26
updated: 2026-02-26
author: Warp
---

# Plaid OAuth Integration

## Purpose
Defines how the Plaid OAuth redirect flow is configured and works within Nexus. This enables users to link bank accounts for ACH billing via Plaid Link, including banks that require OAuth-based authentication.

## Who Uses This
- **Admins / Owners** — trigger bank linking from billing settings
- **Engineers** — maintain the OAuth page, env vars, and Plaid Dashboard config

## Architecture

### Flow Overview

```mermaid
flowchart TD
    A[User clicks "Link Bank Account" in billing settings] --> B[Frontend calls POST /billing/plaid/link-token]
    B --> C[API creates link_token with redirect_uri]
    C --> D[Frontend stores link_token in sessionStorage]
    D --> E[Frontend opens Plaid Link]
    E --> F{Bank uses OAuth?}
    F -->|No| G[User enters credentials in Plaid Link]
    F -->|Yes| H[User redirected to bank's OAuth page]
    H --> I[Bank redirects to /plaid/oauth]
    I --> J[OAuth page reads link_token from sessionStorage]
    J --> K[Reinitializes Plaid Link with receivedRedirectUri]
    K --> G
    G --> L[Plaid returns public_token]
    L --> M[Frontend calls POST /billing/plaid/exchange]
    M --> N[API exchanges for access_token + creates Stripe processor token]
    N --> O[Bank account attached to Stripe customer]
    O --> P[Redirect to billing settings]
```

## Key Files

- **OAuth redirect page:** `apps/web/app/plaid/oauth/page.tsx`
- **API link token + exchange:** `apps/api/src/modules/billing/billing.service.ts`
- **Plaid client provider:** `apps/api/src/modules/billing/plaid.provider.ts`
- **Billing controller:** `apps/api/src/modules/billing/billing.controller.ts`

## Environment Variables

### API (`apps/api`)

| Variable | Description | Example |
|----------|-------------|---------|
| `PLAID_CLIENT_ID` | Plaid client ID from dashboard | `abc123...` |
| `PLAID_SECRET` | Plaid secret (sandbox/development/production) | `xyz789...` |
| `PLAID_ENV` | `sandbox`, `development`, or `production` | `sandbox` |
| `PLAID_REDIRECT_URI` | Registered OAuth redirect URI | `https://app.nexusconnect.com/plaid/oauth` |

### Web (`apps/web`)

No Plaid-specific env vars needed on the web side. The OAuth page uses the standard `NEXT_PUBLIC_API_BASE_URL` to call the API.

## Plaid Dashboard Configuration

1. Sign in to [Plaid Dashboard](https://dashboard.plaid.com)
2. Go to **Team Settings → API**
3. Under **Allowed redirect URIs**, click **Configure → Add New URI**
4. Add your redirect URI:
   - Sandbox: `http://localhost:3000/plaid/oauth`
   - Production: `https://yourdomain.com/plaid/oauth`
5. Click **Save Changes**

**Rules:**
- Production URIs **must** be HTTPS
- URIs must **not** contain query parameters
- The URI registered in the dashboard must **exactly match** the `PLAID_REDIRECT_URI` env var
- Wildcard subdomains are supported: `https://*.example.com/plaid/oauth`

## Frontend Integration Contract

When launching Plaid Link from any page (currently billing settings), the calling code **must**:

1. Call `POST /billing/plaid/link-token` to get a `linkToken`
2. Store the token: `sessionStorage.setItem("plaid_link_token", linkToken)`
3. Initialize and open Plaid Link with that token
4. On success, call `POST /billing/plaid/exchange` with `{ publicToken, accountId }`

The OAuth redirect page at `/plaid/oauth` handles step 3 automatically when the user returns from the bank's OAuth flow. It reads the stored `plaid_link_token` from `sessionStorage` and reinitializes Link.

## Troubleshooting

### "Missing Plaid link token" error on OAuth page
The `sessionStorage` was cleared between launching Link and the OAuth redirect. This can happen if the user opened the bank OAuth in a different browser or cleared browser data. They need to restart the flow.

### "OAuth redirect URI must be configured in the developer dashboard"
The `PLAID_REDIRECT_URI` env var does not match what's registered in the Plaid Dashboard. Verify both match exactly.

### OAuth works in sandbox but not production
Production requires HTTPS redirect URIs. Ensure `PLAID_REDIRECT_URI` uses `https://` and is registered in the production environment in the Plaid Dashboard.

## Related Modules
- [Billing & Membership](./billing-membership-sop.md)
- Stripe ACH integration (processor token bridge)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-26 | Initial release — OAuth redirect page, API redirect_uri support |
