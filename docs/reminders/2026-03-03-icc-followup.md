# ICC API Key Follow-Up

**Date:** Monday, March 3, 2026  
**Contact:** Phil Anthony at ICC  
**Subject:** ICC Code Connect API Access

## Background

We've completed the technical integration for ICC (International Code Council) building codes API on February 26, 2026. The integration is ready to test but awaiting API credentials.

## What's Ready

- ✅ `@repo/icc-client` TypeScript package (built and tested)
- ✅ NestJS `IccModule` with REST endpoints
- ✅ OpenAPI spec downloaded and processed
- ✅ Documentation complete (`docs/architecture/icc-integration.md`, `docs/deployment/icc-setup.md`)
- ✅ Environment variable placeholders in place

## What's Needed

**ICC Code Connect API credentials** (one of):
1. **OAuth Client ID and Secret** (preferred)
2. **Static API Key** (if available)

## Endpoints Needed

- `GET /v1/books` - List available building codes
- `GET /v1/books/{bookId}` - Get book structure
- `GET /v1/books/{bookId}/content/{sectionId}` - Get section content
- `POST /v1/search` - Search within books

## Action Items

### If Haven't Heard Back
- [ ] Email Phil Anthony at ICC
- [ ] Reference ICC Code Connect pilot program (https://solutions.iccsafe.org/codeconnect)
- [ ] Request access for Keystone Restoration / Nexus platform
- [ ] Ask for timeline on credential provisioning

### Once Credentials Received
- [ ] Add `ICC_API_KEY` to `apps/api/.env`
- [ ] Set `ICC_API_BASE_URL=https://api.iccsafe.org`
- [ ] Test locally: `curl http://localhost:8001/icc/status`
- [ ] Deploy to Cloud Run with env vars
- [ ] Test `/icc/codes/search` endpoint
- [ ] Build UI for code lookup in project management

## Contact Info

**Phil Anthony**  
International Code Council  
ICC Code Connect API Team  
Email: (add when available)

## Related Files

- Integration code: `packages/icc-client/`, `apps/api/src/modules/icc/`
- Documentation: `docs/architecture/icc-integration.md`, `docs/deployment/icc-setup.md`
- OpenAPI spec: `packages/icc-client/icc-openapi.json`

## Notes

- ICC API has rate limiting: 600 initial requests, +200 every 2 minutes
- API is primarily for building code lookup, not compliance validation
- Integration uses ICC Code Connect API v1 endpoints
- All endpoints require JWT authentication
