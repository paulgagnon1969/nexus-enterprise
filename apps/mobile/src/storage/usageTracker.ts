import { getDb } from "../offline/db";

// ---- Types ----

export type UsageAction =
  | "open_project"       // Tapped into a project (Projects screen or Home feed)
  | "create_daily_log"   // Created a daily log for a project
  | "view_daily_log"     // Viewed a daily log detail
  | "open_petl"          // Opened PETL for a project
  | "open_directions";   // Opened directions to a project

export interface ProjectScore {
  projectId: string;
  score: number;       // Higher = more relevant
  eventCount: number;  // Total events in the scoring window
  lastUsedTs: number;  // Epoch ms of most recent event
}

// ---- Constants ----

const MS_PER_DAY = 86_400_000;
/** Only score events from the last 60 days */
const SCORING_WINDOW_DAYS = 60;
/** Prune events older than 90 days to keep DB lean */
const PRUNE_AFTER_DAYS = 90;
/** Minimum score to be considered "frequent" */
export const FREQUENT_THRESHOLD = 0.5;
/** Max number of projects to show in the "frequent" section */
export const MAX_FREQUENT = 5;

// ---- Public API ----

/**
 * Record a usage event for a project.
 * Fire-and-forget — callers don't need to await this.
 */
export async function recordUsage(projectId: string, action: UsageAction): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO usage_events (projectId, action, ts) VALUES (?, ?, ?)",
      [projectId, action, Date.now()],
    );
  } catch {
    // Non-fatal — don't break the app if tracking fails
  }
}

/**
 * Compute a relevance score for each project the user has interacted with.
 * Uses recency-weighted frequency: each event contributes 1 / (1 + daysSinceEvent).
 * Returns scores sorted descending (most relevant first).
 */
export async function getProjectScores(): Promise<ProjectScore[]> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - SCORING_WINDOW_DAYS * MS_PER_DAY;

    const rows = await db.getAllAsync<{
      projectId: string;
      ts: number;
    }>(
      "SELECT projectId, ts FROM usage_events WHERE ts > ? ORDER BY projectId, ts DESC",
      [cutoff],
    );

    // Aggregate per project
    const map = new Map<string, { score: number; count: number; lastTs: number }>();
    const now = Date.now();

    for (const row of rows) {
      const daysSince = (now - row.ts) / MS_PER_DAY;
      const eventScore = 1 / (1 + daysSince);

      const existing = map.get(row.projectId);
      if (existing) {
        existing.score += eventScore;
        existing.count += 1;
        if (row.ts > existing.lastTs) existing.lastTs = row.ts;
      } else {
        map.set(row.projectId, { score: eventScore, count: 1, lastTs: row.ts });
      }
    }

    const scores: ProjectScore[] = [];
    for (const [projectId, data] of map) {
      scores.push({
        projectId,
        score: Math.round(data.score * 100) / 100,
        eventCount: data.count,
        lastUsedTs: data.lastTs,
      });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores;
  } catch {
    return [];
  }
}

/**
 * Delete events older than PRUNE_AFTER_DAYS.
 * Call periodically (e.g. on app start or once per session).
 */
export async function pruneOldUsageEvents(): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - PRUNE_AFTER_DAYS * MS_PER_DAY;
    await db.runAsync("DELETE FROM usage_events WHERE ts < ?", [cutoff]);
    // Also prune old tab events
    await db.runAsync("DELETE FROM tab_events WHERE ts < ?", [cutoff]);
  } catch {
    // Non-fatal
  }
}

// ---- Tab Usage Tracking ----

/**
 * Record a tab selection event. Fire-and-forget.
 */
export async function recordTabUsage(tabKey: string): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO tab_events (tabKey, ts) VALUES (?, ?)",
      [tabKey, Date.now()],
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Get the most-used tab using recency-weighted scoring.
 * Returns the tab key with the highest score, or null if no data.
 */
export async function getTopTab(): Promise<string | null> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - SCORING_WINDOW_DAYS * MS_PER_DAY;
    const rows = await db.getAllAsync<{ tabKey: string; ts: number }>(
      "SELECT tabKey, ts FROM tab_events WHERE ts > ? ORDER BY tabKey, ts DESC",
      [cutoff],
    );
    if (rows.length === 0) return null;

    const now = Date.now();
    const map = new Map<string, number>();
    for (const row of rows) {
      const daysSince = (now - row.ts) / MS_PER_DAY;
      const eventScore = 1 / (1 + daysSince);
      map.set(row.tabKey, (map.get(row.tabKey) ?? 0) + eventScore);
    }

    let best: string | null = null;
    let bestScore = 0;
    for (const [key, score] of map) {
      if (score > bestScore) {
        best = key;
        bestScore = score;
      }
    }
    return best;
  } catch {
    return null;
  }
}
