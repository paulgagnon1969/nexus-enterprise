# Next Steps After nfsgrp.com Activation

**Date:** March 3, 2026
**Status:** Waiting for DNS propagation

## Current Status

✅ **Completed:**
- Added `nfsgrp.com` to Cloudflare
- Updated Squarespace nameservers to Cloudflare:
  - `nova.ns.cloudflare.com`
  - `yevgen.ns.cloudflare.com`

⏱️ **Waiting for:**
- DNS propagation (5-60 minutes, up to 24 hours)
- Cloudflare email notification when domain is Active

---

## Once nfsgrp.com is Active

### Step 1: Add Cloudflare Tunnel DNS Records

1. Go to Cloudflare dashboard: https://dash.cloudflare.com
2. Select domain: **nfsgrp.com**
3. Go to: **Zero Trust** → **Networks** → **Tunnels**
4. Edit tunnel: **nexus-shadow**
5. Under **Public Hostnames**, add:

   **Web hostname:**
   - Subdomain: `staging-ncc`
   - Domain: `nfsgrp.com`
   - Service Type: `HTTP`
   - URL: `web:3000`
   
   **API hostname:**
   - Subdomain: `staging-api`
   - Domain: `nfsgrp.com`
   - Service Type: `HTTP`
   - URL: `api:8000`

6. Save tunnel configuration

### Step 2: Update Shadow Stack Configuration

Files already updated (no action needed):
- ✅ `infra/cloudflared/config.yml`
- ✅ `infra/docker/docker-compose.shadow.yml`

### Step 3: Update .env.shadow (if needed)

Check if `.env.shadow` has any hardcoded domain references:

```bash
grep -E "(ncc-nexus-contractor-connect|ncc\.nfsgrp)" /Users/pg/nexus-enterprise/.env.shadow
```

If found, update to:
- `staging-ncc.nfsgrp.com`
- `staging-api.nfsgrp.com`

### Step 4: Rebuild and Restart Shadow Stack

```bash
cd /Users/pg/nexus-enterprise

# Rebuild web container with new API URL
docker compose -f infra/docker/docker-compose.shadow.yml build web

# Restart tunnel and web
docker compose -f infra/docker/docker-compose.shadow.yml restart cloudflared web

# Wait for services to stabilize
sleep 10
```

### Step 5: Verify SSL and Services

**Test DNS resolution:**
```bash
nslookup staging-ncc.nfsgrp.com
nslookup staging-api.nfsgrp.com
```
Should return Cloudflare IPs.

**Test SSL certificates:**
```bash
curl -I https://staging-ncc.nfsgrp.com
curl -I https://staging-api.nfsgrp.com
```
Should show `HTTP/2 200` with `server: cloudflare`.

**Test API health:**
```bash
curl https://staging-api.nfsgrp.com/health
```
Should return: `{"ok":true,...}`

**Test in browser:**
1. Open: https://staging-ncc.nfsgrp.com
2. Click padlock icon
3. Should show: "Connection is secure" ✅
4. Certificate issued by Cloudflare

---

## Troubleshooting

### Domain still showing "Pending" in Cloudflare
- Wait longer (can take up to 24 hours)
- Verify nameservers in Squarespace haven't reverted
- Check Cloudflare email for notifications

### DNS not resolving
- Flush local DNS cache:
  ```bash
  sudo dscacheutil -flushcache
  sudo killall -HUP mDNSResponder
  ```
- Wait 5-10 more minutes
- Check Cloudflare DNS records are set up correctly

### SSL warnings in browser
- Verify Cloudflare proxy is ON (orange cloud in DNS settings)
- Clear browser cache / try incognito mode
- Check SSL/TLS mode: Dashboard → SSL/TLS → Overview → Should be "Full" or "Full (strict)"

### API returning errors
- Check shadow stack logs:
  ```bash
  docker logs nexus-shadow-api --tail 50
  docker logs nexus-shadow-worker --tail 50
  ```
- Verify environment variables in `.env.shadow`
- Check API is actually running: `docker ps | grep shadow`

---

## Old Domain Transition

**`ncc-nexus-contractor-connect.com`** will continue to work during transition (old DNS records still exist).

**When to deprecate:**
- After verifying `nfsgrp.com` domains work correctly
- Update any external links/bookmarks
- Can delete old Cloudflare tunnel hostnames after 1-2 weeks

**Do NOT delete immediately** - gives time to catch any missed references.

---

## Documentation References

- **Full SSL SOP:** `docs/sops-staging/cloudflare-ssl-domain-flattening-sop.md`
- **Quick commands:** `docs/sops-staging/cloudflare-dns-update-commands.md`
- **Shadow compose:** `infra/docker/docker-compose.shadow.yml`
- **Tunnel config:** `infra/cloudflared/config.yml`

---

## Timeline Summary

| Step | When | Duration |
|------|------|----------|
| Update nameservers | ✅ Completed | 5 min |
| DNS propagation | ⏱️ In progress | 5-60 min |
| Add tunnel DNS | After active | 5 min |
| Rebuild & restart | After DNS | 10 min |
| Verify SSL | After restart | 5 min |

**Total estimated time:** 1-2 hours (mostly waiting for DNS)
