const fs = require("fs");
const path = require("path");

const API_URL = process.env.NEXUS_API_URL || "http://localhost:8000";
const API_TOKEN = process.env.NEXUS_API_TOKEN;

if (!API_TOKEN) {
  console.error("No NEXUS_API_TOKEN set in environment");
  process.exit(1);
}

// Parse frontmatter manually (no gray-matter needed)
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  match[1].split("\n").forEach((line) => {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) meta[m[1]] = m[2].replace(/^"|"$/g, "");
  });
  return { meta, body: match[2] };
}

// Simple Markdown to HTML converter
function mdToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p>\n<p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error("Usage: node sync-one-sop.js <filename-in-sops-staging>");
    process.exit(1);
  }

  const filepath = path.join(__dirname, "../docs/sops-staging", filename);
  if (!fs.existsSync(filepath)) {
    console.error("File not found:", filepath);
    process.exit(1);
  }

  const raw = fs.readFileSync(filepath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const html = mdToHtml(body);

  // Derive code from module or filename
  const moduleName = meta.module || filename.replace(/-sop\.md$/, "").replace(/\.md$/, "");
  const code = "SOP-" + moduleName.toUpperCase().replace(/[^A-Z0-9]/g, "-");

  console.log("Syncing:", filename);
  console.log("  Code:", code);
  console.log("  Title:", meta.title || filename);
  console.log("  API:", API_URL);

  // Check existing
  const listRes = await fetch(API_URL + "/documents/templates", {
    headers: { Authorization: "Bearer " + API_TOKEN },
  });

  let existing = null;
  if (listRes.ok) {
    const templates = await listRes.json();
    existing = templates.find((t) => t.code === code);
    if (existing) console.log("  Found existing:", existing.id);
  }

  const tags = meta.tags || "sop";
  const payload = {
    type: "SOP",
    code,
    label: meta.title || filename,
    description: `Module: ${meta.module || "N/A"}\nTags: ${tags}\nAuthor: ${meta.author || "Warp"}`,
    templateHtml: html,
    versionLabel: "Rev " + (meta.revision || "1.0"),
    versionNotes: `Synced from ${filename} on ${new Date().toISOString().split("T")[0]}`,
  };

  let res;
  if (existing) {
    res = await fetch(API_URL + "/documents/templates/" + existing.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + API_TOKEN },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log("  ✓ Updated existing document");
    }
  } else {
    res = await fetch(API_URL + "/documents/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + API_TOKEN },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("  ✓ Created new document:", data.id);
    }
  }

  if (!res.ok) {
    const err = await res.text();
    console.error("  ✗ API error:", res.status, err);
    process.exit(1);
  }

  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
