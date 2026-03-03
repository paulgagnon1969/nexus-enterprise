# Cloudflare DNS Update Commands - Quick Reference

**Date:** March 3, 2026
**Purpose:** Update DNS routes for flattened domain structure

## Summary of Changes

| What | Old Domain | New Domain |
|------|-----------|-----------|
| Web | `staging.ncc.nfsgrp.com` | `staging-ncc.nfsgrp.com` |
| API | `api-staging.ncc.nfsgrp.com` | `staging-api.nfsgrp.com` |

**Why:** Multi-level subdomains aren't covered by Cloudflare Universal SSL. Flattened to single-level for automatic SSL coverage.

---

## Files Already Updated ✅

- ✅ `infra/cloudflared/config.yml` - Tunnel ingress rules
- ✅ `infra/docker/docker-compose.shadow.yml` - Web build args

---

## Commands to Run

### Option A: Via Cloudflare Dashboard (Recommended)

1. Log in to Cloudflare: https://dash.cloudflare.com
2. Select domain: **nfsgrp.com**
3. Go to: **Zero Trust** → **Networks** → **Tunnels**
4. Find and edit tunnel: **nexus-shadow**
5. Under **Public Hostnames**:
   - **Delete old:**
     - `staging.ncc.nfsgrp.com`
     - `api-staging.ncc.nfsgrp.com`
   - **Add new:**
     - `staging-ncc.nfsgrp.com` → Service: `http://web:3000`
     - `staging-api.nfsgrp.com` → Service: `http://api:8000`
6. Click **Save**

### Option B: Via CLI (if you prefer command line)

```bash
# Remove old DNS routes
cloudflared tunnel route dns delete nexus-shadow staging.ncc.nfsgrp.com
cloudflared tunnel route dns delete nexus-shadow api-staging.ncc.nfsgrp.com

# Add new DNS routes
cloudflared tunnel route dns nexus-shadow staging-ncc.nfsgrp.com
cloudflared tunnel route dns nexus-shadow staging-api.nfsgrp.com
```

---

## Rebuild and Restart Shadow Stack

```bash
# Navigate to repo root
cd /Users/pg/nexus-enterprise

# Rebuild web container with new API URL
docker compose -f infra/docker/docker-compose.shadow.yml build web

# Restart tunnel and web to pick up new config
docker compose -f infra/docker/docker-compose.shadow.yml restart cloudflared web
```

---

## Verify SSL is Working

### Test 1: Check DNS Resolution
```bash
nslookup staging-ncc.nfsgrp.com
nslookup staging-api.nfsgrp.com
```
Should return Cloudflare IPs (not NXDOMAIN).

### Test 2: Check SSL Certificates
```bash
curl -I https://staging-ncc.nfsgrp.com
curl -I https://staging-api.nfsgrp.com
```
Should show:
- `HTTP/2 200`
- `server: cloudflare`
- No SSL errors

### Test 3: Browser Check
Open: https://staging-ncc.nfsgrp.com

- Click padlock icon in address bar
- Should show: "Connection is secure" ✅
- Certificate issued by Cloudflare

### Test 4: API Health Check
```bash
curl https://staging-api.nfsgrp.com/health
```
Should return: `{"ok":true,...}`

---

## Troubleshooting

### DNS not resolving?
Wait 5-10 minutes for propagation, then flush DNS cache:
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

### Still seeing old domain?
Old DNS may take up to 24 hours to expire. New domains should work immediately once DNS propagates.

### SSL warning in browser?
1. Verify DNS is resolving (see Test 1 above)
2. Verify Cloudflare proxy is ON (orange cloud icon in DNS settings)
3. Clear browser cache / try incognito mode

---

## Full Documentation

See: `docs/sops-staging/cloudflare-ssl-domain-flattening-sop.md`
