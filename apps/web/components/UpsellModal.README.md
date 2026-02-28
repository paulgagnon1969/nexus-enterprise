# UpsellModal Component

Reusable upsell modal for promoting premium module purchases.

## Usage

### Basic Example

```typescript
import UpsellModal, { useUpsellModal } from "@/components/UpsellModal";

function MyComponent() {
  const { isOpen, moduleConfig, showUpsell, hideUpsell } = useUpsellModal();

  const handleLockedFeature = () => {
    showUpsell(
      "MASTER_COSTBOOK",
      "Master Costbook",
      "$4,999",
      [
        "50,000+ pre-priced line items",
        "BWC Cabinet catalog included",
        "Xactimate components",
        "Construction materials database",
        "Lifetime updates",
      ]
    );
  };

  return (
    <>
      <button onClick={handleLockedFeature}>
        🔒 Unlock Master Costbook
      </button>

      {moduleConfig && (
        <UpsellModal
          isOpen={isOpen}
          onClose={hideUpsell}
          moduleCode={moduleConfig.moduleCode}
          moduleName={moduleConfig.moduleName}
          price={moduleConfig.price}
          features={moduleConfig.features}
        />
      )}
    </>
  );
}
```

### With Custom Purchase Handler

```typescript
<UpsellModal
  isOpen={isOpen}
  onClose={hideUpsell}
  moduleCode="GOLDEN_PETL"
  moduleName="Golden PETL"
  price="$2,999"
  features={["Pre-built estimate templates", "Common project types"]}
  onPurchase={() => {
    // Custom logic before navigating
    console.log("User clicked purchase");
    window.location.href = "/settings/modules";
  }}
/>
```

## Module Codes

| Code | Name | Price | Icon |
|------|------|-------|------|
| `MASTER_COSTBOOK` | Master Costbook Access | $4,999 | 📚 |
| `GOLDEN_PETL` | Golden PETL Library | $2,999 | ⚡ |
| `GOLDEN_BOM` | Golden BOM Library | $1,999 | 📋 |

## Integration Examples

### Example 1: Locked Price List Route

```typescript
// apps/web/app/pricing/page.tsx
"use client";

import { useEffect, useState } from "react";
import UpsellModal, { useUpsellModal } from "@/components/UpsellModal";

export default function PricingPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const { isOpen, moduleConfig, showUpsell, hideUpsell } = useUpsellModal();

  useEffect(() => {
    // Check access
    fetch("/api/billing/modules/MASTER_COSTBOOK/check", {
      headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
    })
      .then(res => res.json())
      .then(data => setHasAccess(data.hasAccess));
  }, []);

  if (hasAccess === null) return <div>Loading...</div>;

  if (!hasAccess) {
    return (
      <>
        <div style={{ padding: 40, textAlign: "center" }}>
          <h1>🔒 Master Costbook Required</h1>
          <p>Unlock access to 50,000+ pre-priced line items</p>
          <button
            onClick={() =>
              showUpsell("MASTER_COSTBOOK", "Master Costbook", "$4,999", [
                "50,000+ line items",
                "BWC Cabinets",
                "Xactimate components",
                "Lifetime updates",
              ])
            }
          >
            Unlock Now
          </button>
        </div>

        {moduleConfig && (
          <UpsellModal
            isOpen={isOpen}
            onClose={hideUpsell}
            moduleCode={moduleConfig.moduleCode}
            moduleName={moduleConfig.moduleName}
            price={moduleConfig.price}
            features={moduleConfig.features}
          />
        )}
      </>
    );
  }

  return <div>Price list content...</div>;
}
```

### Example 2: Golden PETL Import Dialog

```typescript
// apps/web/app/projects/[id]/components/ImportPETLDialog.tsx
function ImportPETLDialog() {
  const [hasAccess, setHasAccess] = useState(false);
  const { isOpen, moduleConfig, showUpsell, hideUpsell } = useUpsellModal();

  useEffect(() => {
    fetch("/api/billing/modules/GOLDEN_PETL/check")
      .then(res => res.json())
      .then(data => setHasAccess(data.hasAccess));
  }, []);

  const handleImport = () => {
    if (!hasAccess) {
      showUpsell("GOLDEN_PETL", "Golden PETL", "$2,999", [
        "Pre-built estimate templates",
        "Kitchen remodel templates",
        "Bathroom renovation templates",
        "Roofing & siding templates",
        "All future templates",
      ]);
      return;
    }

    // Proceed with import...
  };

  return (
    <>
      <button onClick={handleImport}>
        {hasAccess ? "Import Template" : "🔒 Unlock Golden PETL"}
      </button>

      {moduleConfig && (
        <UpsellModal
          isOpen={isOpen}
          onClose={hideUpsell}
          {...moduleConfig}
        />
      )}
    </>
  );
}
```

### Example 3: Golden BOM Button

```typescript
// apps/web/app/projects/[id]/components/BOMToolbar.tsx
function BOMToolbar() {
  const [hasAccess, setHasAccess] = useState(false);
  const upsell = useUpsellModal();

  useEffect(() => {
    fetch("/api/billing/modules/GOLDEN_BOM/check")
      .then(res => res.json())
      .then(data => setHasAccess(data.hasAccess));
  }, []);

  return (
    <>
      <button
        onClick={() => {
          if (!hasAccess) {
            upsell.showUpsell("GOLDEN_BOM", "Golden BOM", "$1,999", [
              "Pre-configured BOMs",
              "Kitchen cabinet BOMs",
              "Bathroom fixture BOMs",
              "Exterior material BOMs",
              "Quantity pre-calculated",
            ]);
          } else {
            // Open BOM library
          }
        }}
      >
        {hasAccess ? "BOM Library" : "🔒 Golden BOM"}
      </button>

      {upsell.moduleConfig && (
        <UpsellModal isOpen={upsell.isOpen} onClose={upsell.hideUpsell} {...upsell.moduleConfig} />
      )}
    </>
  );
}
```

## Styling

The modal uses inline styles for portability. To customize:

```typescript
// Create a styled wrapper
const StyledUpsellModal = (props) => (
  <div className="your-custom-class">
    <UpsellModal {...props} />
  </div>
);
```

## Testing

```typescript
// Test with React Testing Library
import { render, screen, fireEvent } from "@testing-library/react";
import UpsellModal from "@/components/UpsellModal";

test("renders upsell modal", () => {
  render(
    <UpsellModal
      isOpen={true}
      onClose={jest.fn()}
      moduleCode="MASTER_COSTBOOK"
      moduleName="Master Costbook"
      price="$4,999"
      features={["Feature 1", "Feature 2"]}
    />
  );

  expect(screen.getByText("Unlock Master Costbook")).toBeInTheDocument();
  expect(screen.getByText("$4,999")).toBeInTheDocument();
});

test("calls onClose when Maybe Later clicked", () => {
  const onClose = jest.fn();
  render(
    <UpsellModal
      isOpen={true}
      onClose={onClose}
      moduleCode="MASTER_COSTBOOK"
      moduleName="Master Costbook"
      price="$4,999"
      features={[]}
    />
  );

  fireEvent.click(screen.getByText("Maybe Later"));
  expect(onClose).toHaveBeenCalled();
});
```

## Best Practices

1. **Check access on mount** - Always verify module access before showing locked UI
2. **Use the hook** - `useUpsellModal()` manages state cleanly
3. **Clear features** - List 3-5 specific, valuable features
4. **Contextual messaging** - Show upsells at the point of value (when user tries to use the feature)
5. **Don't spam** - Only show upsell once per session for the same feature

## Environment Variables

Add to `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

Production (Cloud Run):

```bash
NEXT_PUBLIC_API_BASE_URL=https://nexus-api-wswbn2e6ta-uc.a.run.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
```
