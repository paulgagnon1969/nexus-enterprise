# ICC Integration Architecture

## Overview

The ICC (International Code Council) integration provides access to building codes, standards, and compliance validation directly within Nexus. This enables automatic compliance checking for construction projects against applicable building codes.

## Architecture

### Package Structure

```
packages/icc-client/           # Shared ICC API client
├── src/
│   ├── generated/             # Auto-generated from OpenAPI spec
│   ├── icc-client.ts         # Wrapper with error handling
│   └── index.ts              # Public exports
├── icc-openapi.json          # ICC OpenAPI specification
└── package.json

apps/api/src/modules/icc/     # NestJS ICC module
├── icc.module.ts
├── icc.service.ts            # NestJS service wrapper
└── icc.controller.ts         # REST endpoints
```

### Components

1. **@repo/icc-client** (Shared Package)
   - Type-safe TypeScript client generated from ICC's OpenAPI spec
   - Axios-based HTTP client with auth and error handling
   - Convenience methods for common operations
   - Reusable across API, web, and admin apps

2. **IccModule** (NestJS Module)
   - Service layer for ICC API interactions
   - REST endpoints for web/mobile apps
   - Authentication via JWT
   - Error handling and logging

## Setup

### 1. Download ICC OpenAPI Spec

Get the OpenAPI JSON file from ICC's developer portal and save to:
```
packages/icc-client/icc-openapi.json
```

### 2. Generate TypeScript Client

```bash
cd packages/icc-client
npm run generate
```

This generates:
- `src/generated/api/` - API client classes
- `src/generated/models/` - TypeScript interfaces
- `src/generated/configuration.ts` - Client config

### 3. Build ICC Client Package

```bash
cd packages/icc-client
npm run build
```

Or from root:
```bash
npm run build --workspace=@repo/icc-client
```

### 4. Configure Environment Variables

Add to `apps/api/.env`:
```bash
ICC_API_KEY=your_icc_api_key
ICC_API_BASE_URL=https://api.iccsafe.org  # Replace with actual ICC API URL
```

### 5. Register ICC Module in API

Add to `apps/api/src/app.module.ts`:
```typescript
import { IccModule } from './modules/icc/icc.module';

@Module({
  imports: [
    // ... existing modules
    IccModule,
  ],
})
export class AppModule {}
```

## API Endpoints

### GET /icc/status
Check if ICC integration is enabled and healthy.

**Response:**
```json
{
  "enabled": true,
  "healthy": true
}
```

### GET /icc/codes/search
Search ICC building codes.

**Query Parameters:**
- `query` - Search keywords
- `jurisdiction` - State, city, or region (e.g., "CA", "Los Angeles")
- `codeType` - Type of code (e.g., "building", "fire", "plumbing")
- `year` - Year of code (e.g., 2021)

**Example:**
```bash
GET /icc/codes/search?jurisdiction=CA&codeType=building&year=2021
```

**Response:**
```json
{
  "codes": [
    {
      "id": "ibc-2021-ca",
      "name": "International Building Code 2021 - California",
      "jurisdiction": "CA",
      "effectiveDate": "2022-01-01",
      "version": "2021"
    }
  ]
}
```

### GET /icc/codes/:id
Get a specific code by ID.

**Example:**
```bash
GET /icc/codes/ibc-2021-ca
```

### GET /icc/jurisdictions/:jurisdiction/codes
Get all applicable codes for a jurisdiction.

**Example:**
```bash
GET /icc/jurisdictions/CA/codes
```

### POST /icc/compliance/validate
Validate project specifications against ICC standards.

**Body:**
```json
{
  "projectId": "proj-123",
  "specifications": {
    "occupancyType": "A-2",
    "constructionType": "Type II-B",
    "height": 45,
    "area": 12000,
    "sprinklered": true
  }
}
```

**Response:**
```json
{
  "projectId": "proj-123",
  "compliant": false,
  "violations": [
    {
      "code": "IBC 503.1",
      "description": "Building height exceeds allowable for Type II-B construction",
      "severity": "critical"
    }
  ],
  "recommendations": [
    "Upgrade to Type II-A construction",
    "Install automatic sprinkler system throughout"
  ]
}
```

## Usage Examples

### From NestJS Services

```typescript
import { IccService } from './modules/icc/icc.service';

@Injectable()
export class ProjectService {
  constructor(private iccService: IccService) {}

  async validateProjectCompliance(projectId: string) {
    const project = await this.getProject(projectId);
    
    const result = await this.iccService.validateCompliance({
      occupancyType: project.occupancyType,
      constructionType: project.constructionType,
      height: project.height,
      area: project.area,
      sprinklered: project.hasSprinklers,
    });

    return result;
  }
}
```

### From Web/Admin Apps

```typescript
import { ICCClient } from '@repo/icc-client';

const client = new ICCClient({
  apiKey: process.env.ICC_API_KEY,
});

// Search codes
const codes = await client.searchCodes({
  jurisdiction: 'CA',
  codeType: 'building',
});

// Validate compliance
const result = await client.validateCompliance({
  occupancyType: 'A-2',
  constructionType: 'Type II-B',
  height: 45,
});
```

## Integration Points

### 1. Project Creation/Editing
- Display applicable building codes based on project location
- Store selected codes as project metadata
- Show compliance warnings during project setup

### 2. Estimating
- Check material/method compliance against ICC standards
- Flag non-compliant items in estimates
- Suggest compliant alternatives

### 3. Document Review
- Auto-tag documents with relevant ICC code sections
- Highlight code references in plans/specs
- Generate compliance checklists

### 4. Inspection/QC
- Reference ICC requirements during inspections
- Record code compliance checks
- Track violations and remediation

## Future Enhancements

### Phase 2: Code Reference Library
- Build local cache of frequently used codes
- Full-text search across ICC standards
- Offline access to downloaded codes

### Phase 3: Automatic Code Updates
- Webhook notifications when codes are amended
- Automatic sync of jurisdiction code adoptions
- Version comparison and change tracking

### Phase 4: AI-Powered Compliance Assistant
- Natural language queries ("What's the max height for Type V construction?")
- Extract code requirements from project descriptions
- Suggest design changes to achieve compliance

## Security

- API keys stored in environment variables (never in code)
- All ICC endpoints require JWT authentication
- Rate limiting on compliance validation endpoint
- Audit logging for all ICC API calls

## Cost Management

- ICC API likely charges per request or has rate limits
- Implement caching for frequently accessed codes
- Consider local code library for common jurisdictions
- Monitor usage and alert if approaching limits

## Related Documentation

- ICC Developer Portal: [URL from ICC]
- OpenAPI Spec: `packages/icc-client/icc-openapi.json`
- NestJS Module: `apps/api/src/modules/icc/`
- Client Package: `packages/icc-client/`
