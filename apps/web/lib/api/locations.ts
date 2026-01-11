export type Location = {
  id: string;
  companyId: string;
  type: string;
  name: string;
  code?: string | null;
  parentLocationId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type Holdings = {
  location: Location | null;
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
};

async function localApiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export function fetchRootLocations(): Promise<Location[]> {
  return localApiFetch<Location[]>('/api/locations/roots');
}

export function fetchChildLocations(parentId: string): Promise<Location[]> {
  return localApiFetch<Location[]>(`/api/locations/${parentId}/children`);
}

export function fetchMyPersonLocation(): Promise<{ locationId: string; location: Location }> {
  return localApiFetch<{ locationId: string; location: Location }>(
    '/api/locations/me/person-location',
  );
}

export function fetchLocationHoldings(locationId: string): Promise<Holdings> {
  return localApiFetch<Holdings>(`/api/inventory/holdings/location/${locationId}`);
}

export function fetchMyHoldings(): Promise<Holdings> {
  return localApiFetch<Holdings>('/api/inventory/holdings/me');
}
