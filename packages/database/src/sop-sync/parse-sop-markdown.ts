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

  const frontmatter: SopFrontmatter = {
    title: data.title || "Untitled SOP",
    module: data.module || "general",
    revision: data.revision || "1.0",
    tags: Array.isArray(data.tags) ? data.tags : [],
    status: data.status || "draft",
    created: data.created || new Date().toISOString().split("T")[0],
    updated: data.updated || new Date().toISOString().split("T")[0],
    author: data.author || "Unknown",
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

  // Tables (basic support)
  html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
    const cells = row.split("|").map((c: string) => c.trim());
    const cellHtml = cells.map((c: string) => `<td>${c}</td>`).join("");
    return `<tr>${cellHtml}</tr>`;
  });
  html = html.replace(/((?:<tr>.*<\/tr>\s*)+)/g, "<table>$1</table>");

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
