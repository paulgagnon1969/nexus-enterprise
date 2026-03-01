import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFTS_KEY = "nexus.tagread.drafts";

export type TagReadDraft = {
  id: string;
  photoUris: string[];
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  year: string;
  isTemplate: boolean;
  /** Partial label for the drafts list — e.g. "Dri-Eaz LGR 3500i" or "2 photos" */
  label: string;
  createdAt: number;
  updatedAt: number;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getDrafts(): Promise<TagReadDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const drafts: TagReadDraft[] = JSON.parse(raw);
    // Sort newest first
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function getDraftCount(): Promise<number> {
  const drafts = await getDrafts();
  return drafts.length;
}

export async function saveDraft(
  partial: Omit<TagReadDraft, "id" | "createdAt" | "updatedAt">,
): Promise<TagReadDraft> {
  const drafts = await getDrafts();
  const now = Date.now();
  const draft: TagReadDraft = {
    ...partial,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  drafts.unshift(draft);
  await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  return draft;
}

export async function updateDraft(
  id: string,
  partial: Partial<Omit<TagReadDraft, "id" | "createdAt">>,
): Promise<void> {
  const drafts = await getDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx < 0) return;
  drafts[idx] = { ...drafts[idx], ...partial, updatedAt: Date.now() };
  await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export async function deleteDraft(id: string): Promise<void> {
  const drafts = await getDrafts();
  const filtered = drafts.filter((d) => d.id !== id);
  await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
}

export async function clearAllDrafts(): Promise<void> {
  await AsyncStorage.removeItem(DRAFTS_KEY);
}
