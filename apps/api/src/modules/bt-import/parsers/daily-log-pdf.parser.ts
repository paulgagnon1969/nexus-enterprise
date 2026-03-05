/**
 * daily-log-pdf.parser.ts
 *
 * Parses Buildertrend "Daily Log Print" PDFs into structured entries.
 * The BT daily log PDF has a very consistent format across all projects.
 */

import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import type { BtDailyLogEntry } from "../bt-import.types";

// ── Date header: "Jan 23, 2026" on its own line ────────────────────────
// BT prints dates like "Jan 23, 2026" or "Dec 19, 2025"
const DATE_HEADER_RE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}$/;

// ── Field patterns (BT uses tabs between label and value) ───────────────
const JOB_RE = /^Job:\s+(.+)/;
const TITLE_RE = /^Title:\s*(.*)/;
const ADDED_BY_RE = /^Added By:\s+(.+)/;
const LOG_NOTES_RE = /^Log Notes:\s*$/;
const WEATHER_COND_RE = /^Weather Conditions:\s*$/;
const TAGS_RE = /^Tags:\s*$/;
const ATTACHMENTS_RE = /^Attachments:\s+(\d+)/;
const PAGE_BOUNDARY_RE = /^--\s*\d+\s+of\s+\d+\s*--$/;

// ── Weather detail parsing ──────────────────────────────────────────────
function parseWeatherBlock(lines: string[]): Record<string, any> | null {
  if (lines.length === 0) return null;
  const result: Record<string, any> = { raw: lines.join("\n") };
  for (const line of lines) {
    const tempMatch = line.match(/(\d+)\s*°F/g);
    if (tempMatch) {
      if (!result.highF) result.highF = parseInt(tempMatch[0]);
      else result.lowF = parseInt(tempMatch[tempMatch.length - 1]!);
    }
    const windMatch = line.match(/Wind:\s*([\d.]+)\s*mph/i);
    if (windMatch) result.windMph = parseFloat(windMatch[1]!);
    const humidMatch = line.match(/Humidity:\s*([\d.]+)\s*%/i);
    if (humidMatch) result.humidityPct = parseFloat(humidMatch[1]!);
    const precipMatch = line.match(/Total Precip:\s*([\d.]+)"/i);
    if (precipMatch) result.precipIn = parseFloat(precipMatch[1]!);
    // Condition text (first line is usually the condition)
    if (!result.condition && !tempMatch && !windMatch && !humidMatch && !precipMatch) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 3) result.condition = trimmed;
    }
  }
  return Object.keys(result).length > 1 ? result : null;
}

function parseDate(raw: string): Date {
  return new Date(raw);
}

/**
 * Parse a single BT Daily Log Print PDF into an array of entries.
 * Each PDF contains multiple daily log entries for one BT job / phase.
 */
export async function parseDailyLogPdf(pdfPath: string): Promise<BtDailyLogEntry[]> {
  const buffer = fs.readFileSync(pdfPath);
  const result = await pdfParse(buffer);
  const text: string = result.text;
  const lines = text.split("\n");
  const sourcePdf = path.basename(pdfPath);

  const entries: BtDailyLogEntry[] = [];

  let currentDate: string | null = null;
  let currentJob: string | null = null;
  let currentTitle: string | null = null;
  let currentAuthor: string | null = null;
  let collectingNotes = false;
  let collectingWeather = false;
  let collectingTags = false;
  let notesLines: string[] = [];
  let weatherLines: string[] = [];
  let tagsLines: string[] = [];

  function flushEntry(attachmentCount: number) {
    if (!currentDate || !currentAuthor) return;

    const logNotes = notesLines.join("\n").trim();
    const weatherRaw = weatherLines.length > 0 ? weatherLines.join("\n").trim() : null;
    const weatherJson = weatherRaw ? parseWeatherBlock(weatherLines) : null;
    const tags: string[] = [];
    for (const tl of tagsLines) {
      const cleaned = tl.replace(/^#+\s*/, "").trim();
      if (cleaned) tags.push(cleaned);
    }

    entries.push({
      dateRaw: currentDate!,
      logDate: parseDate(currentDate!),
      jobName: currentJob || "Unknown",
      title: currentTitle || null,
      addedBy: currentAuthor!,
      logNotes,
      weatherRaw,
      weatherJson,
      tags,
      attachmentCount,
      sourcePdf,
    });

    // Reset per-entry state
    currentTitle = null;
    currentAuthor = null;
    collectingNotes = false;
    collectingWeather = false;
    collectingTags = false;
    notesLines = [];
    weatherLines = [];
    tagsLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Skip page headers/footers/boundaries
    if (line.includes("Daily Log Print") && (line.includes("AM") || line.includes("PM"))) continue;
    if (line.includes("buildertrend.net")) continue;
    if (line.includes("Daily Logs List")) continue;
    if (line.startsWith("Printed:")) continue;
    if (line.match(/^\d+\/\d+$/)) continue; // page numbers like 1/13
    if (PAGE_BOUNDARY_RE.test(line)) continue; // "-- 1 of 13 --"
    if (line.startsWith("NEXUS Fortified") || line.startsWith("301 Main Plaza")) continue;
    if (line.startsWith("Phone:")) continue;
    if (line.includes("Member of the NEXUS Group")) continue;
    if (line === "") continue; // blank lines

    // Date header
    if (DATE_HEADER_RE.test(line)) {
      currentDate = line;
      collectingNotes = false;
      collectingWeather = false;
      collectingTags = false;
      continue;
    }

    // Job field
    const jobMatch = line.match(JOB_RE);
    if (jobMatch) {
      // Job name can span multiple lines
      let jobName = jobMatch[1]!.trim();
      // Look ahead for continuation (next line is NOT a known field or page noise)
      while (
        i + 1 < lines.length &&
        !lines[i + 1]!.trim().match(
          /^(Title:|Added By:|Log Notes:|Job:|Attachments:|Tags:|Weather Conditions:)/,
        ) &&
        !DATE_HEADER_RE.test(lines[i + 1]!.trim()) &&
        !lines[i + 1]!.trim().match(/\d+\/\d+\/\d+,\s+\d+:\d+\s+(AM|PM)/) && // page header with timestamp
        !lines[i + 1]!.trim().includes("Daily Log Print") &&
        !lines[i + 1]!.trim().includes("buildertrend.net") &&
        !PAGE_BOUNDARY_RE.test(lines[i + 1]!.trim()) &&
        lines[i + 1]!.trim().length > 0 &&
        lines[i + 1]!.trim().length < 80
      ) {
        i++;
        jobName += " " + lines[i]!.trim();
      }
      currentJob = jobName;
      collectingNotes = false;
      collectingWeather = false;
      collectingTags = false;
      continue;
    }

    // Title
    const titleMatch = line.match(TITLE_RE);
    if (titleMatch) {
      let titleText = titleMatch[1]!.trim();
      // Title can span multiple lines
      while (
        i + 1 < lines.length &&
        !lines[i + 1]!.trim().match(/^(Added By:|Log Notes:|Job:|Attachments:)/) &&
        !DATE_HEADER_RE.test(lines[i + 1]!.trim()) &&
        lines[i + 1]!.trim().length > 0 &&
        lines[i + 1]!.trim().length < 80
      ) {
        i++;
        titleText += " " + lines[i]!.trim();
      }
      currentTitle = titleText || null;
      collectingNotes = false;
      collectingWeather = false;
      collectingTags = false;
      continue;
    }

    // Added By
    const authorMatch = line.match(ADDED_BY_RE);
    if (authorMatch) {
      currentAuthor = authorMatch[1]!.trim();
      collectingNotes = false;
      collectingWeather = false;
      collectingTags = false;
      continue;
    }

    // Log Notes start
    if (LOG_NOTES_RE.test(line)) {
      collectingNotes = true;
      collectingWeather = false;
      collectingTags = false;
      notesLines = [];
      continue;
    }

    // Weather Conditions start
    if (WEATHER_COND_RE.test(line)) {
      collectingNotes = false;
      collectingWeather = true;
      collectingTags = false;
      weatherLines = [];
      continue;
    }

    // Tags start
    if (TAGS_RE.test(line)) {
      collectingNotes = false;
      collectingWeather = false;
      collectingTags = true;
      tagsLines = [];
      continue;
    }

    // Attachments (always marks end of an entry)
    const attachMatch = line.match(ATTACHMENTS_RE);
    if (attachMatch) {
      flushEntry(parseInt(attachMatch[1]!));
      continue;
    }

    // Collect lines into the active section
    if (collectingNotes) {
      notesLines.push(line);
    } else if (collectingWeather) {
      weatherLines.push(line);
    } else if (collectingTags) {
      tagsLines.push(line);
    }
  }

  // Flush any remaining entry (if PDF ends without an Attachments line)
  if (currentAuthor && currentDate) {
    flushEntry(0);
  }

  return entries;
}

/** Parse all Daily Log PDFs in parallel and return flat array of entries. */
export async function parseAllDailyLogPdfs(pdfPaths: string[]): Promise<BtDailyLogEntry[]> {
  const results = await Promise.all(pdfPaths.map(parseDailyLogPdf));
  return results.flat();
}
