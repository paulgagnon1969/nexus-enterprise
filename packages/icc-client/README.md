# @repo/icc-client

TypeScript client for ICC (International Code Council) API integration.

## Setup

### 1. Download ICC OpenAPI Spec
Place the ICC OpenAPI JSON file in this directory as `icc-openapi.json`.

### 2. Generate Client
```bash
npm run generate
```

This creates TypeScript types and API clients in `src/generated/`.

### 3. Build
```bash
npm run build
```

## Usage

```typescript
import { ICCClient } from '@repo/icc-client';

const client = new ICCClient({
  apiKey: process.env.ICC_API_KEY,
  baseUrl: 'https://api.iccsafe.org' // Replace with actual ICC API base URL
});

// Example: Fetch building codes
const codes = await client.getCodes({ jurisdiction: 'CA' });
```

## Environment Variables

- `ICC_API_KEY` - Your ICC API key
- `ICC_API_BASE_URL` - ICC API base URL (optional, defaults to production)

## Generated Files

- `src/generated/api/` - API client classes
- `src/generated/models/` - TypeScript interfaces for ICC data models
- `src/generated/configuration.ts` - Client configuration

Do not manually edit files in `src/generated/` - they will be overwritten on next `npm run generate`.
