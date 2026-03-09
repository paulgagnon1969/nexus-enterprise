import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "video-index.json";

export interface IndexedVideo {
  videoPath: string;
  fileName: string;
  durationSecs: number;
  resolution: string;
  assessmentIds: string[];
  createdAt: string;
  lastAccessedAt: string;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_PATH);
  }
  return storeInstance;
}

/**
 * Register a video in the local index, linking it to an assessment.
 * If the video is already indexed, adds the assessment ID to its list.
 */
export async function registerVideo(
  videoPath: string,
  metadata: { fileName: string; durationSecs: number; resolution: string },
  assessmentId: string,
): Promise<void> {
  const store = await getStore();
  const existing = await store.get<IndexedVideo>(videoPath);

  if (existing) {
    // Add assessment ID if not already linked
    const ids = new Set(existing.assessmentIds);
    ids.add(assessmentId);
    await store.set(videoPath, {
      ...existing,
      assessmentIds: Array.from(ids),
      lastAccessedAt: new Date().toISOString(),
    });
  } else {
    await store.set(videoPath, {
      videoPath,
      fileName: metadata.fileName,
      durationSecs: metadata.durationSecs,
      resolution: metadata.resolution,
      assessmentIds: [assessmentId],
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    } satisfies IndexedVideo);
  }

  await store.save();
}

/**
 * Find the video path linked to a given assessment ID.
 * Scans all indexed videos for one that contains the assessment ID.
 */
export async function findVideoByAssessmentId(
  assessmentId: string,
): Promise<IndexedVideo | null> {
  const store = await getStore();
  const keys = await store.keys();

  for (const key of keys) {
    const entry = await store.get<IndexedVideo>(key);
    if (entry?.assessmentIds?.includes(assessmentId)) {
      return entry;
    }
  }
  return null;
}

/**
 * Find an indexed video by its path.
 */
export async function findVideoByPath(
  videoPath: string,
): Promise<IndexedVideo | null> {
  const store = await getStore();
  return (await store.get<IndexedVideo>(videoPath)) ?? null;
}

/**
 * List all indexed videos, sorted by last accessed.
 */
export async function listIndexedVideos(): Promise<IndexedVideo[]> {
  const store = await getStore();
  const keys = await store.keys();
  const videos: IndexedVideo[] = [];

  for (const key of keys) {
    const entry = await store.get<IndexedVideo>(key);
    if (entry?.videoPath) {
      videos.push(entry);
    }
  }

  return videos.sort(
    (a, b) =>
      new Date(b.lastAccessedAt).getTime() -
      new Date(a.lastAccessedAt).getTime(),
  );
}
