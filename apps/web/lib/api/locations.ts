import type {
  LocationDto as Location,
  LocationHoldingsDto as Holdings,
  LocationMovementDto as LocationMovement,
} from '@repo/types/locations';

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

export function fetchLocationHistory(locationId: string): Promise<LocationMovement[]> {
  return localApiFetch<LocationMovement[]>(`/api/inventory/holdings/location/${locationId}/history`);
}

export type { Location, Holdings, LocationMovement };
