# Supplier Bidding System

Token-based supplier bidding system for NEXUS. Allows project managers to create bid packages from estimate items, invite suppliers, receive competitive bids, and award contracts.

## Features

- ✅ Create bid packages from estimate line items
- ✅ Token-based supplier portal (no login required)
- ✅ Email/SMS invitation with unique access URLs
- ✅ Suppliers can submit, save drafts, and amend bids
- ✅ CSV upload/download for offline editing
- ✅ Side-by-side bid comparison with lowest bid highlighting
- ✅ Award tracking and bidding lifecycle management

## Database Schema

See `packages/database/prisma/schema.prisma` (lines 6986-7161):

- **BidPackage**: Container for bid requests (DRAFT → OPEN → CLOSED → AWARDED)
- **BidPackageLineItem**: Items to price (description, qty, unit, optional specHash for catalog linking)
- **SupplierInvitation**: Supplier contact info + unique access token (PENDING → OPENED → SUBMITTED → DECLINED)
- **SupplierBid**: Submission with revision tracking (DRAFT → SUBMITTED → AMENDED → AWARDED)
- **SupplierBidLineItem**: Per-line pricing (unitPrice, total, leadTime, notes)

## API Endpoints

### PM-Side (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/bid-packages` | Create new bid package |
| GET | `/bid-packages?projectId=xxx` | List bid packages for project |
| GET | `/bid-packages/:id` | Get bid package details |
| POST | `/bid-packages/:id/invite` | Invite suppliers |
| GET | `/bid-packages/:id/compare` | Compare bids side-by-side |
| POST | `/bid-packages/:id/award` | Award bid to supplier |
| POST | `/bid-packages/:id/close` | Close bidding |

### Supplier Portal (Token-Based, No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/supplier-portal/:accessToken` | Get bid package details |
| POST | `/supplier-portal/:accessToken/bid` | Submit or save bid |
| PATCH | `/supplier-portal/:accessToken/bid/:bidId` | Amend existing bid |
| GET | `/supplier-portal/:accessToken/csv-template` | Download CSV template |
| POST | `/supplier-portal/:accessToken/upload-csv` | Upload completed CSV |
| POST | `/supplier-portal/:accessToken/decline` | Decline invitation |

## Usage Flow

### 1. PM Creates Bid Package

```typescript
POST /bid-packages
{
  "projectId": "cm...",
  "title": "Cabinet and Flooring Bid Request",
  "description": "Seeking competitive bids",
  "dueDate": "2026-03-15T23:59:59.000Z",
  "attachmentUrls": ["https://..."],
  "lineItems": [
    {
      "category": "CABINETS",
      "description": "Kitchen base cabinets, white shaker, 36\"W",
      "unit": "EA",
      "qty": 12,
      "specHash": "abc123" // Optional: links to CatalogItem
    }
  ]
}
```

### 2. PM Invites Suppliers

```typescript
POST /bid-packages/:id/invite
{
  "suppliers": [
    {
      "supplierName": "ABC Cabinets",
      "contactEmail": "john@abccabinets.com",
      "contactPhone": "+15551234567"
    }
  ]
}

// Returns:
[
  {
    "id": "inv_...",
    "accessToken": "cuid_...",
    "portalUrl": "http://localhost:3000/supplier-portal/cuid_..."
  }
]
```

### 3. Supplier Accesses Portal

Supplier clicks link → no login required → sees bid package details:

```typescript
GET /supplier-portal/:accessToken

// Returns:
{
  "bidPackage": {
    "title": "...",
    "dueDate": "...",
    "lineItems": [...],
    "project": { "name": "...", "addressLine1": "..." },
    "company": { "name": "...", "email": "..." }
  },
  "invitation": {
    "supplierName": "ABC Cabinets",
    "status": "OPENED"
  },
  "existingBid": null // or existing bid if already submitted
}
```

### 4. Supplier Submits Bid

```typescript
POST /supplier-portal/:accessToken/bid
{
  "status": "SUBMITTED", // or "DRAFT" to save without submitting
  "notes": "We can complete within 2 weeks",
  "lineItems": [
    {
      "bidPackageLineItemId": "cm...",
      "unitPrice": 450.00,
      "leadTimeDays": 10
    }
  ],
  "subtotal": 5400.00,
  "total": 5400.00
}
```

### 5. PM Compares Bids

```typescript
GET /bid-packages/:id/compare

// Returns:
{
  "lineItems": [
    {
      "lineNo": 1,
      "description": "Kitchen base cabinets...",
      "qty": 12,
      "unit": "EA",
      "bids": [
        { "supplier": "ABC Cabinets", "unitPrice": 450, "total": 5400 },
        { "supplier": "XYZ Cabinets", "unitPrice": 425, "total": 5100 }
      ],
      "lowestBid": { "supplier": "XYZ Cabinets", "unitPrice": 425 }
    }
  ],
  "totals": [
    { "supplier": "ABC Cabinets", "total": 5400 },
    { "supplier": "XYZ Cabinets", "total": 5100 }
  ]
}
```

### 6. PM Awards Bid

```typescript
POST /bid-packages/:id/award
{
  "bidId": "cm...",
  "notes": "Best value and timeline"
}
```

## CSV Workflow

Suppliers can download a CSV template, fill it out offline, and upload:

**Download:**
```
GET /supplier-portal/:accessToken/csv-template
```

**CSV Format:**
```csv
Line #,Description,Category,Qty,Unit,Unit Price,Lead Time (days),Notes
1,Kitchen base cabinets...,CABINETS,12,EA,450.00,10,Premium grade
2,Luxury vinyl plank...,FLOORING,850,SF,5.25,7,
```

**Upload:**
```
POST /supplier-portal/:accessToken/upload-csv
{
  "csv": "Line #,Description,...\n1,Kitchen base cabinets,..."
}
```

## Bid Amendments

Suppliers can amend their bids before bidding closes:

```typescript
PATCH /supplier-portal/:accessToken/bid/:bidId
{
  "status": "SUBMITTED",
  "lineItems": [...]
}
```

- Creates new revision (revisionNo increments)
- Status changes to AMENDED
- Original submission preserved in audit trail

## Security

- **Token-based access**: No login required, unique cuid() per invitation
- **Time-gated**: Submissions blocked after dueDate or CLOSED status
- **Company isolation**: All queries scoped to companyId
- **Audit trail**: Full revision history (submittedAt, amendedAt, awardedAt)

## Email/SMS Notifications

TODO: Implement notification templates:

- Invitation sent (with portal link)
- Bid received (to PM)
- Bid amended (to PM)
- Bidding closed (to all suppliers)
- Award notification (to winner)

Integration: Use MessageBird for SMS, existing email service for email.

## Future Enhancements

- [ ] PDF export of bid comparison
- [ ] Supplier performance tracking (on-time, quality ratings)
- [ ] Automated PO generation from awarded bid
- [ ] Integration with Master Costbook (auto-price from catalog)
- [ ] Supplier portal branding (company logo, colors)
- [ ] Multi-language support
- [ ] Real-time bid notifications (WebSocket)
- [ ] Supplier Q&A thread on bid packages
- [ ] Automated vendor selection based on past performance + price

## Testing

Use the test file: `test-bidding.http`

1. Start API: `npm run dev:api`
2. Get JWT token from login endpoint
3. Run requests in sequence
4. Verify status transitions and bid comparison logic

## Migration

Migration: `20260226121006_add_supplier_bidding_system`

```bash
npm run db:migrate:dev
```
