import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { SopFrontmatter, ParsedSop } from "./types";

/**
 * Parse YAML frontmatter from markdown content.
 * Expects format:
 * ---
 * key: value
 * ---
 */
function parseFrontmatter(content: string): { frontmatter: SopFrontmatter; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error("No valid frontmatter found in SOP file");
  }

  const yamlContent = match[1];
  const body = match[2];

  // Simple YAML parser for our known structure
  const lines = yamlContent.split("\n");
  const data: Record<string, any> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle arrays like [tag1, tag2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    // Handle quoted strings
    else if (value.startsWith('"') && value.endsWith('"')) {
      data[key] = value.slice(1, -1);
    }
    // Handle plain values
    else {
      data[key] = value;
    }
  }

  // Parse nested scores block (indented under "scores:", "score:", or "cam_score:")
  let scores: SopFrontmatter["scores"] | undefined;
  const scoresBlockRegex = /^(?:scores|score|cam_score):\s*\n((?:\s+\w+:.*\n?)+)/m;
  const scoresMatch = yamlContent.match(scoresBlockRegex);
  if (scoresMatch) {
    const scoreLines = scoresMatch[1].split("\n");
    scores = {};
    for (const sl of scoreLines) {
      const sm = sl.match(/^\s+(\w+):\s*(\d+)/);
      if (sm) {
        (scores as any)[sm[1]] = parseInt(sm[2], 10);
      }
    }
  }
  // Fallback: inline score object e.g. score: { uniqueness: 6, value: 7, ... }
  if (!scores) {
    const inlineScoreMatch = yamlContent.match(/^(?:scores|score|cam_score):\s*\{([^}]+)\}/m);
    if (inlineScoreMatch) {
      scores = {};
      const pairs = inlineScoreMatch[1].split(",");
      for (const pair of pairs) {
        const pm = pair.match(/(\w+):\s*(\d+)/);
        if (pm) {
          (scores as any)[pm[1]] = parseInt(pm[2], 10);
        }
      }
    }
  }

  const frontmatter: SopFrontmatter = {
    title: data.title || "Untitled SOP",
    module: data.module || "general",
    revision: data.revision || "1.0",
    tags: Array.isArray(data.tags) ? data.tags : [],
    status: data.status || "draft",
    created: data.created || new Date().toISOString().split("T")[0],
    updated: data.updated || new Date().toISOString().split("T")[0],
    author: data.author || "Unknown",
    ...(data.module_code ? { module_code: data.module_code } : {}),
    ...(data.cam_id ? { cam_id: data.cam_id } : {}),
    ...(data.mode ? { mode: data.mode } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(scores ? { scores } : {}),
  };

  return { frontmatter, body };
}

/**
 * Convert markdown to HTML.
 * Simple converter for common markdown elements.
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Mermaid code blocks → <div class="mermaid"> for client-side rendering
  html = html.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    // Un-escape HTML entities inside mermaid blocks so the renderer gets raw syntax
    const raw = code.trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return `<div class="mermaid">${raw}</div>`;
  });

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || "text"}">${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^(\s*)-\s+(.+)$/gm, (_, indent, content) => {
    const level = Math.floor(indent.length / 2);
    return `<li data-level="${level}">${content}</li>`;
  });

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, "<ul>$1</ul>");

  // Ordered lists (simple numbered)
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr>");

  // Tables — detect header row, separator, and body rows.
  // Produces <table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr>…</tbody></table>
  const tableBlockRegex = /((?:^\|.+\|\s*$\n?)+)/gm;
  html = html.replace(tableBlockRegex, (block) => {
    const rows = block.trim().split("\n").filter(Boolean);
    if (rows.length < 2) return block; // Not a real table

    // Parse cells from a pipe-delimited row, dropping empty leading/trailing cells
    const parseCells = (row: string): string[] =>
      row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c: string) => c.trim());

    // Detect separator row (all cells are dashes like ---, :--:, ---:, etc.)
    const isSeparator = (row: string): boolean =>
      parseCells(row).every((c) => /^:?-+:?$/.test(c));

    let headerRow: string | null = null;
    const dataRows: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (isSeparator(rows[i])) {
        // The row before the separator is the header (if it exists and we haven't set one)
        if (i === 1 && !headerRow) {
          headerRow = rows[0];
        }
        continue; // Skip separator row entirely
      }
      if (i === 0 && rows.length > 1 && isSeparator(rows[1])) {
        continue; // Header row already captured above
      }
      dataRows.push(rows[i]);
    }

    let tableHtml = "<table>";

    if (headerRow) {
      const headerCells = parseCells(headerRow)
        .map((c) => `<th>${c}</th>`)
        .join("");
      tableHtml += `<thead><tr>${headerCells}</tr></thead>`;
    }

    if (dataRows.length > 0) {
      tableHtml += "<tbody>";
      for (const row of dataRows) {
        const cells = parseCells(row)
          .map((c) => `<td>${c}</td>`)
          .join("");
        tableHtml += `<tr>${cells}</tr>`;
      }
      tableHtml += "</tbody>";
    }

    tableHtml += "</table>";
    return tableHtml;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraphs (wrap remaining text blocks)
  const lines = html.split("\n");
  const processedLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBlock =
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<pre") ||
      trimmed.startsWith("<table") ||
      trimmed.startsWith("<tr") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("</");

    if (!trimmed) {
      if (inParagraph) {
        processedLines.push("</p>");
        inParagraph = false;
      }
      processedLines.push("");
    } else if (isBlock) {
      if (inParagraph) {
        processedLines.push("</p>");
        inParagraph = false;
      }
      processedLines.push(line);
    } else {
      if (!inParagraph) {
        processedLines.push("<p>");
        inParagraph = true;
      }
      processedLines.push(line);
    }
  }

  if (inParagraph) {
    processedLines.push("</p>");
  }

  return processedLines.join("\n").trim();
}

/**
 * Compute SHA-256 hash of content
 */
function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Parse a single SOP markdown file
 */
export function parseSopFile(filePath: string): ParsedSop {
  const content = fs.readFileSync(filePath, "utf8");
  const filename = path.basename(filePath, ".md");
  const stats = fs.statSync(filePath);

  const { frontmatter, body } = parseFrontmatter(content);
  const htmlBody = markdownToHtml(body);
  const contentHash = computeHash(content);

  return {
    code: filename,
    frontmatter,
    markdownBody: body,
    htmlBody,
    contentHash,
    filePath,
    fileModifiedAt: stats.mtime.toISOString(),
  };
}

/**
 * Parse all SOP files in a directory
 */
export function parseAllSops(stagingDir: string): ParsedSop[] {
  if (!fs.existsSync(stagingDir)) {
    return [];
  }

  const files = fs.readdirSync(stagingDir).filter((f) => f.endsWith(".md"));
  const sops: ParsedSop[] = [];

  for (const file of files) {
    try {
      const sop = parseSopFile(path.join(stagingDir, file));
      sops.push(sop);
    } catch (err: any) {
      console.error(`Failed to parse SOP ${file}: ${err.message}`);
    }
  }

  return sops;
}
