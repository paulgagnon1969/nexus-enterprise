/**
 * catalog.ts — NEXI Object Catalog Storage
 *
 * FileSystem-based local storage for NEXI catalog entries.
 * Follows the same pattern as scannex/storage.ts (JSON files in Documents dir).
 *
 * Directory structure:
 *   {documentDirectory}/nexi/
 *     catalog.json          ← master index (array of entry IDs + lightweight metadata)
 *     entries/
 *       {entryId}/
 *         meta.json         ← full NexiCatalogEntry
 *         prints.json       ← array of NexiStoredPrint
 *         thumbnail.jpg     ← first captured image
 *         model.usdz        ← optional 3D model
 */

import * as FileSystem from "expo-file-system/legacy";
import type { NexiCatalogEntry, NexiStoredPrint } from "./types";

// ── Paths ────────────────────────────────────────────────────

const NEXI_DIR = `${FileSystem.documentDirectory}nexi`;
const CATALOG_INDEX = `${NEXI_DIR}/catalog.json`;
const ENTRIES_DIR = `${NEXI_DIR}/entries`;

function entryDir(entryId: string): string {
  return `${ENTRIES_DIR}/${entryId}`;
}

// ── Index (lightweight master list) ──────────────────────────

interface CatalogIndex {
  version: number;
  entries: Array<{
    id: string;
    name: string;
    category: string;
    thumbnailUri: string | null;
    featurePrintCount: number;
    matchCount: number;
    updatedAt: string;
  }>;
}

async function ensureDirs(): Promise<void> {
  await FileSystem.makeDirectoryAsync(ENTRIES_DIR, { intermediates: true });
}

async function readIndex(): Promise<CatalogIndex> {
  try {
    const raw = await FileSystem.readAsStringAsync(CATALOG_INDEX);
    return JSON.parse(raw) as CatalogIndex;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeIndex(index: CatalogIndex): Promise<void> {
  await ensureDirs();
  await FileSystem.writeAsStringAsync(CATALOG_INDEX, JSON.stringify(index, null, 2));
}

// ── CRUD Operations ──────────────────────────────────────────

/**
 * Add a new catalog entry with its feature prints and optional thumbnail.
 */
export async function addEntry(
  entry: NexiCatalogEntry,
  prints: NexiStoredPrint[],
  thumbnailSourceUri?: string,
): Promise<NexiCatalogEntry> {
  await ensureDirs();
  const dir = entryDir(entry.id);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  // Copy thumbnail to persistent storage
  let thumbnailUri: string | null = null;
  if (thumbnailSourceUri) {
    const destUri = `${dir}/thumbnail.jpg`;
    try {
      await FileSystem.copyAsync({ from: thumbnailSourceUri, to: destUri });
      thumbnailUri = destUri;
    } catch (err) {
      console.warn("[NEXI] Failed to copy thumbnail:", err);
    }
  }

  const finalEntry: NexiCatalogEntry = {
    ...entry,
    thumbnailUri,
    featurePrintCount: prints.length,
  };

  // Write entry metadata
  await FileSystem.writeAsStringAsync(`${dir}/meta.json`, JSON.stringify(finalEntry, null, 2));

  // Write feature prints
  await FileSystem.writeAsStringAsync(`${dir}/prints.json`, JSON.stringify(prints, null, 2));

  // Update index
  const index = await readIndex();
  index.entries.push({
    id: finalEntry.id,
    name: finalEntry.name,
    category: finalEntry.category,
    thumbnailUri: finalEntry.thumbnailUri,
    featurePrintCount: finalEntry.featurePrintCount,
    matchCount: finalEntry.matchCount,
    updatedAt: finalEntry.updatedAt,
  });
  await writeIndex(index);

  return finalEntry;
}

/**
 * Remove a catalog entry and all its data.
 */
export async function removeEntry(entryId: string): Promise<void> {
  const dir = entryDir(entryId);
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch (err) {
    console.warn("[NEXI] Failed to delete entry:", err);
  }

  // Update index
  const index = await readIndex();
  index.entries = index.entries.filter((e) => e.id !== entryId);
  await writeIndex(index);
}

/**
 * Get a single catalog entry by ID.
 */
export async function getEntry(entryId: string): Promise<NexiCatalogEntry | null> {
  const metaPath = `${entryDir(entryId)}/meta.json`;
  try {
    const raw = await FileSystem.readAsStringAsync(metaPath);
    return JSON.parse(raw) as NexiCatalogEntry;
  } catch {
    return null;
  }
}

/**
 * List all catalog entries (from index — lightweight, no prints loaded).
 * Sorted by most recently updated first.
 */
export async function listEntries(): Promise<CatalogIndex["entries"]> {
  const index = await readIndex();
  return index.entries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Get the total number of entries in the catalog.
 */
export async function getCatalogSize(): Promise<number> {
  const index = await readIndex();
  return index.entries.length;
}

/**
 * Update an existing catalog entry's metadata.
 */
export async function updateEntry(
  entryId: string,
  updates: Partial<Pick<NexiCatalogEntry, "name" | "category" | "subcategory" | "material" | "tags" | "dimensions">>,
): Promise<NexiCatalogEntry | null> {
  const entry = await getEntry(entryId);
  if (!entry) return null;

  const updated: NexiCatalogEntry = {
    ...entry,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const dir = entryDir(entryId);
  await FileSystem.writeAsStringAsync(`${dir}/meta.json`, JSON.stringify(updated, null, 2));

  // Update index
  const index = await readIndex();
  const idx = index.entries.findIndex((e) => e.id === entryId);
  if (idx >= 0) {
    index.entries[idx] = {
      ...index.entries[idx],
      name: updated.name,
      category: updated.category,
      updatedAt: updated.updatedAt,
    };
    await writeIndex(index);
  }

  return updated;
}

/**
 * Search entries by category.
 */
export async function searchByCategory(category: string): Promise<CatalogIndex["entries"]> {
  const index = await readIndex();
  const lower = category.toLowerCase();
  return index.entries.filter((e) => e.category.toLowerCase().includes(lower));
}

/**
 * Increment match count for an entry (called when NEXI identifies an object).
 */
export async function incrementMatchCount(entryId: string): Promise<void> {
  const entry = await getEntry(entryId);
  if (!entry) return;

  entry.matchCount += 1;
  entry.updatedAt = new Date().toISOString();

  const dir = entryDir(entryId);
  await FileSystem.writeAsStringAsync(`${dir}/meta.json`, JSON.stringify(entry, null, 2));

  // Update index
  const index = await readIndex();
  const idx = index.entries.findIndex((e) => e.id === entryId);
  if (idx >= 0) {
    index.entries[idx].matchCount = entry.matchCount;
    index.entries[idx].updatedAt = entry.updatedAt;
    await writeIndex(index);
  }
}

// ── Feature Prints ───────────────────────────────────────────

/**
 * Load all feature prints for an entry.
 */
export async function loadPrints(entryId: string): Promise<NexiStoredPrint[]> {
  const printsPath = `${entryDir(entryId)}/prints.json`;
  try {
    const raw = await FileSystem.readAsStringAsync(printsPath);
    return JSON.parse(raw) as NexiStoredPrint[];
  } catch {
    return [];
  }
}

/**
 * Load the first (representative) feature print for each entry in the catalog.
 * Returns an array of { entryId, data } for use with findBestMatch().
 */
export async function loadAllRepresentativePrints(): Promise<
  Array<{ entryId: string; data: string }>
> {
  const index = await readIndex();
  const results: Array<{ entryId: string; data: string }> = [];

  for (const entry of index.entries) {
    const prints = await loadPrints(entry.id);
    if (prints.length > 0) {
      results.push({ entryId: entry.id, data: prints[0].data });
    }
  }

  return results;
}

/**
 * Load ALL feature prints for every entry (for more thorough matching).
 * Returns flat array with entryId for each print.
 */
export async function loadAllPrintsFlat(): Promise<
  Array<{ entryId: string; data: string; printIndex: number }>
> {
  const index = await readIndex();
  const results: Array<{ entryId: string; data: string; printIndex: number }> = [];

  for (const entry of index.entries) {
    const prints = await loadPrints(entry.id);
    for (let i = 0; i < prints.length; i++) {
      results.push({ entryId: entry.id, data: prints[i].data, printIndex: i });
    }
  }

  return results;
}

// ── Utilities ────────────────────────────────────────────────

/**
 * Generate a unique entry ID.
 */
export function generateEntryId(): string {
  return `nexi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wipe the entire NEXI catalog (for testing / reset).
 */
export async function clearCatalog(): Promise<void> {
  try {
    await FileSystem.deleteAsync(NEXI_DIR, { idempotent: true });
  } catch (err) {
    console.warn("[NEXI] Failed to clear catalog:", err);
  }
}
