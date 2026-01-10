import { AssetType } from '@prisma/client';

// Local mirror of allowed location types for templates. We intentionally do not
// depend on a generated Prisma enum here so this helper stays stable across
// migrations.
type LocationType = 'WAREHOUSE' | 'AISLE' | 'SHELF' | 'BIN';

export type LocationTemplateNode = {
  type: LocationType;
  name: string;
  code?: string;
  metadata?: Record<string, unknown>;
  children?: LocationTemplateNode[];
};

export type LocationTemplateDefinition = {
  key: string;
  label: string;
  description?: string;
  rootNodes: LocationTemplateNode[];
};

const STANDARD_WH_KEY = 'STANDARD_WAREHOUSE_4x4x10';

function createStandardWarehouseTemplate(): LocationTemplateDefinition {
  const aisles = ['A', 'B', 'C', 'D'];
  const shelves = [1, 2, 3, 4];
  const bins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const warehouseNode: LocationTemplateNode = {
    type: 'WAREHOUSE',
    name: 'Main Warehouse',
    code: 'WH-MAIN',
    metadata: {
      kind: 'WAREHOUSE',
      templateKey: STANDARD_WH_KEY,
      zoneType: 'INDOOR',
      defaultTempC: 20,
      pickOrder: 1,
    },
      children: aisles.map((aisleCode, aisleIdx) => ({
      type: 'AISLE',
      name: `Aisle ${aisleCode}`,
      code: `A-${aisleCode}`,
      metadata: {
        kind: 'AISLE',
        templateKey: STANDARD_WH_KEY,
        aisleCode,
        pickOrder: aisleIdx + 1,
      },
      children: shelves.map((shelfNo, shelfIdx) => ({
        type: 'SHELF',
        name: `Shelf ${shelfNo}`,
        code: `S-${aisleCode}-${shelfNo}`,
        metadata: {
          kind: 'SHELF',
          templateKey: STANDARD_WH_KEY,
          aisleCode,
          shelfNumber: shelfNo,
          maxWeightKg: shelfNo === 1 ? 1000 : shelfNo === 2 ? 750 : 500,
          pickOrder: (aisleIdx + 1) * 100 + shelfIdx + 1,
        },
        children: bins.map((binNo, binIdx) => ({
          type: 'BIN',
          name: `Bin ${binNo}`,
          code: `B-${aisleCode}-${shelfNo}-${binNo}`,
          metadata: {
            kind: 'BIN',
            templateKey: STANDARD_WH_KEY,
            aisleCode,
            shelfNumber: shelfNo,
            binNumber: binNo,
            maxWeightKg: 100,
            allowedAssetTypes: [
              AssetType.TOOL,
              AssetType.MATERIAL,
            ],
            preferredItemSize: 'SMALL',
            pickOrder:
              (aisleIdx + 1) * 10000 +
              (shelfIdx + 1) * 100 +
              (binIdx + 1),
          },
        })),
      })),
    })),
  };

  return {
    key: STANDARD_WH_KEY,
    label: 'Standard Warehouse (4 aisles x 4 shelves x 10 bins)',
    description:
      'Main indoor warehouse with aisles A–D, shelves 1–4 per aisle, and bins 1–10 per shelf.',
    rootNodes: [warehouseNode],
  };
}

export const BUILT_IN_LOCATION_TEMPLATES: LocationTemplateDefinition[] = [
  createStandardWarehouseTemplate(),
];
