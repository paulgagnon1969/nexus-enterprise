/**
 * Sync NccPM Session Logs
 * 
 * Reads markdown files from docs/nccpm/sessions/ and syncs them to:
 * 1. SystemDocument (for content storage and versioning)
 * 2. ManualDocument (links to NccPM's "Session Logs" chapter)
 * 
 * Usage: npx ts-node src/sync-nccpm-sessions.ts
 */

import * as fs from "fs";
import * as path from "path";
import prisma from "./client";

const SESSIONS_DIR = path.resolve(__dirname, "../../../docs/nccpm/sessions");
const NCCPM_CODE = "nccpm";
const SESSION_LOGS_CHAPTER_TITLE = "Session Logs";

interface SessionFile {
  filename: string;
  code: string;
  title: string;
  date: string;
  content: string;
  htmlContent: string;
}

function parseMarkdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion
  // In production, you'd use a proper parser like marked or remark
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Tables (basic - wrap in table tags)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(c => c.trim());
      return "<tr>" + cells.map(c => `<td>${c.trim()}</td>`).join("") + "</tr>";
    })
    // Paragraphs (lines not already tagged)
    .split("\n\n")
    .map(block => {
      if (block.startsWith("<")) return block;
      if (block.trim() === "") return "";
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  // Wrap list items in ul
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
  
  return html;
}

function extractTitleFromMarkdown(content: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1] : "Untitled Session";
}

function parseSessionFiles(): SessionFile[] {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log(`Sessions directory not found: ${SESSIONS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".md"));
  
  return files.map(filename => {
    const filePath = path.join(SESSIONS_DIR, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Extract date from filename (e.g., 2026-02-16-documents-dashboard.md)
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];
    
    // Generate code from filename
    const code = `NCCPM-SESSION-${filename.replace(".md", "").toUpperCase()}`;
    
    // Extract title from markdown
    const title = extractTitleFromMarkdown(content);
    
    return {
      filename,
      code,
      title,
      date,
      content,
      htmlContent: parseMarkdownToHtml(content),
    };
  });
}

async function getSystemUser(): Promise<string> {
  // Find a SUPER_ADMIN user to attribute document creation
  const user = await prisma.user.findFirst({
    where: { globalRole: "SUPER_ADMIN" },
    select: { id: true },
  });
  
  if (!user) {
    throw new Error("No SUPER_ADMIN user found to attribute documents");
  }
  
  return user.id;
}

async function getNccpmSessionLogsChapter(): Promise<{ manualId: string; chapterId: string } | null> {
  const manual = await prisma.manual.findFirst({
    where: { code: NCCPM_CODE },
    include: {
      chapters: {
        where: { title: SESSION_LOGS_CHAPTER_TITLE, active: true },
        select: { id: true },
      },
    },
  });

  if (!manual || manual.chapters.length === 0) {
    console.log("NccPM manual or Session Logs chapter not found");
    return null;
  }

  return {
    manualId: manual.id,
    chapterId: manual.chapters[0].id,
  };
}

async function syncSession(
  session: SessionFile,
  userId: string,
  chapterId: string,
  manualId: string
): Promise<void> {
  console.log(`\nSyncing: ${session.filename}`);
  
  // Check if SystemDocument exists
  let systemDoc = await prisma.systemDocument.findUnique({
    where: { code: session.code },
    include: { currentVersion: true },
  });

  if (systemDoc) {
    // Check if content changed
    const currentContent = systemDoc.currentVersion?.htmlContent || "";
    if (currentContent === session.htmlContent) {
      console.log("  No changes detected, skipping update");
    } else {
      // Update with new version
      const nextVersion = (systemDoc.currentVersion?.versionNo || 0) + 1;
      
      const newVersion = await prisma.systemDocumentVersion.create({
        data: {
          systemDocumentId: systemDoc.id,
          versionNo: nextVersion,
          htmlContent: session.htmlContent,
          contentHash: Buffer.from(session.htmlContent).toString("base64").slice(0, 16),
          notes: `Synced from ${session.filename}`,
          createdByUserId: userId,
        },
      });

      await prisma.systemDocument.update({
        where: { id: systemDoc.id },
        data: { currentVersionId: newVersion.id },
      });

      console.log(`  Updated to version ${nextVersion}`);
    }
  } else {
    // Create new SystemDocument
    systemDoc = await prisma.systemDocument.create({
      data: {
        code: session.code,
        title: session.title,
        description: `NccPM Session Log: ${session.date}`,
        category: "NccPM",
        subcategory: "Session Logs",
        tags: ["nccpm", "session-log", session.date],
        createdByUserId: userId,
      },
    });

    // Create initial version
    const version = await prisma.systemDocumentVersion.create({
      data: {
        systemDocumentId: systemDoc.id,
        versionNo: 1,
        htmlContent: session.htmlContent,
        contentHash: Buffer.from(session.htmlContent).toString("base64").slice(0, 16),
        notes: `Initial sync from ${session.filename}`,
        createdByUserId: userId,
      },
    });

    await prisma.systemDocument.update({
      where: { id: systemDoc.id },
      data: { currentVersionId: version.id },
    });

    console.log(`  Created SystemDocument: ${systemDoc.id}`);
  }

  // Ensure linked to manual chapter
  const existingLink = await prisma.manualDocument.findFirst({
    where: {
      manualId,
      systemDocumentId: systemDoc.id,
    },
  });

  if (!existingLink) {
    // Get manual's current version
    const manual = await prisma.manual.findUnique({
      where: { id: manualId },
      select: { currentVersion: true },
    });
    
    // Get next sort order
    const lastDoc = await prisma.manualDocument.findFirst({
      where: { manualId, chapterId },
      orderBy: { sortOrder: "desc" },
    });
    const sortOrder = (lastDoc?.sortOrder || 0) + 1;

    await prisma.manualDocument.create({
      data: {
        manualId,
        chapterId,
        systemDocumentId: systemDoc.id,
        sortOrder,
        includeInToc: true,
        addedInManualVersion: manual?.currentVersion || 1,
      },
    });

    console.log(`  Linked to Session Logs chapter (order: ${sortOrder})`);
  } else {
    console.log("  Already linked to manual");
  }
}

async function main() {
  console.log("=== NccPM Session Logs Sync ===\n");

  const sessions = parseSessionFiles();
  if (sessions.length === 0) {
    console.log("No session files found to sync");
    return;
  }

  console.log(`Found ${sessions.length} session file(s)`);

  const userId = await getSystemUser();
  const chapter = await getNccpmSessionLogsChapter();

  if (!chapter) {
    console.error("Cannot sync: NccPM Session Logs chapter not found");
    process.exit(1);
  }

  for (const session of sessions) {
    await syncSession(session, userId, chapter.chapterId, chapter.manualId);
  }

  console.log("\n=== Sync complete ===");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
