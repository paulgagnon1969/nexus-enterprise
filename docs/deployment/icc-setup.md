# ICC Integration Deployment Guide

## Overview
ICC (International Code Council) integration provides access to building codes and standards through the ICC Code Connect API.

## Prerequisites
- ICC Code Connect API account ([Get one here](https://solutions.iccsafe.org/codeconnect))
- API credentials (Client ID and Secret, or Email/Password for OAuth)

## Environment Variables

Add these to your deployment environment:

### Development (`apps/api/.env`)
```bash
# ICC (International Code Council) API
ICC_API_KEY=your_icc_api_key_here
ICC_API_BASE_URL=https://api.iccsafe.org
```

### Production (Cloud Run)
```bash
# Set via Google Cloud Console or gcloud CLI:
gcloud run services update nexus-api \
  --set-env-vars="ICC_API_KEY=your_actual_key,ICC_API_BASE_URL=https://api.iccsafe.org" \
  --region=us-central1
```

## Authentication

ICC Code Connect API supports two authentication methods:

### 1. OAuth Bearer Token (Recommended)
```bash
# Get token via OAuth flow
curl -X POST https://api.iccsafe.org/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Use token in ICC_API_KEY
ICC_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. API Key
If ICC provides a static API key, use that directly:
```bash
ICC_API_KEY=your_static_api_key
```

## Testing the Integration

### 1. Start the API
```bash
npm run dev:api
```

### 2. Check ICC Status
```bash
curl http://localhost:8001/icc/status

# Expected response:
{
  "enabled": true,
  "healthy": true
}
```

### 3. List Available Books
```bash
curl http://localhost:8001/icc/codes/search \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
{
  "codes": [
    {
      "id": "IBC2021",
      "name": "2021 International Building Code",
      "jurisdiction": "US",
      "effectiveDate": "2022-01-01T00:00:00-05:00",
      "version": "First Printing: August 2020"
    }
  ]
}
```

## API Endpoints

All ICC endpoints require JWT authentication.

### GET /icc/status
Health check for ICC integration.

### GET /icc/codes/search
List available ICC building codes.

### GET /icc/codes/:id
Get details for a specific code (e.g., `IBC2021`).

### GET /icc/jurisdictions/:jurisdiction/codes
Get codes for a jurisdiction (currently returns all US codes).

### POST /icc/compliance/validate
*Not implemented* - ICC API doesn't provide this endpoint natively.

## Rate Limiting

ICC Code Connect API rate limits:
- **Initial quota:** 600 requests
- **Replenishment:** +200 requests every 2 minutes
- **Max quota:** 600 requests (no accumulation)

Response headers include:
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Retry-After` - Seconds until next replenishment
- `X-RateLimit-Limit` - Maximum requests allowed

## Troubleshooting

### "ICC integration is not configured"
- Verify `ICC_API_KEY` is set in environment
- Check API server logs for initialization errors
- Ensure `.env` file is in `apps/api/` directory

### "ICC API authentication failed"
- Verify API key is valid and not expired
- Check if key format is correct (Bearer token vs static key)
- Confirm API key has access to Code Connect API

### "429 Too Many Requests"
- Rate limit exceeded
- Wait for `X-RateLimit-Retry-After` seconds
- Implement request caching to reduce API calls

### Books not showing up
- Verify your ICC account has books assigned
- Check book access dates (`accessStartDate`, `accessEndDate`)
- Ensure API key has proper permissions

## Cost Considerations

- ICC Code Connect is a paid service
- Pricing based on subscription tier and usage
- Consider caching frequently accessed books/sections
- Monitor usage via rate limit headers

## Next Steps

1. **Replace placeholder API key** in `apps/api/.env`
2. **Test locally** with `npm run dev:api`
3. **Deploy to Cloud Run** with environment variables
4. **Implement caching** for frequently accessed codes
5. **Build UI** for code lookup in project management

## Related Documentation

- ICC Code Connect: https://solutions.iccsafe.org/codeconnect
- API Reference: `docs/architecture/icc-integration.md`
- OpenAPI Spec: `packages/icc-client/icc-openapi.json`
