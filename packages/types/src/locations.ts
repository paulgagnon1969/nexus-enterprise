export interface LocationDto {
  id: string;
  companyId: string;
  type: string;
  name: string;
  code?: string | null;
  parentLocationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LocationHoldingsDto {
  location: LocationDto | null;
  people: Array<{
    userId: string;
    name: string | null;
    email: string | null;
  }>;
  assets: Array<{
    id: string;
    name: string;
    code?: string | null;
    assetType: string;
  }>;
  materialLots: Array<{
    id: string;
    sku: string;
    name: string;
    quantity: string;
    uom: string;
  }>;
  particles: Array<{
    id: string;
    parentEntityType: string;
    parentEntityId: string;
    quantity: string;
    uom: string;
  }>;
}

export interface LocationMovementDto {
  id: string;
  itemType: string;
  itemId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: string;
  reason: string | null;
  movedAt: string;
  movedByUserId: string | null;
  fromLocation?: { name: string | null } | null;
  toLocation?: { name: string | null } | null;
}
