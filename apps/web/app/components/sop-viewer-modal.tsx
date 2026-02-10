"use client";

import React from "react";

interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: string;
  created: string;
  updated: string;
  author: string;
  featureId?: string;
}

interface SopViewerModalProps {
  frontmatter: SopFrontmatter;
  content: string;
  onClose: () => void;
}

/**
 * Simple markdown-to-HTML renderer for SOP content.
 * Handles headings, lists, bold, code blocks, and mermaid diagrams.
 */
function renderMarkdown(md: string): string {
  let html = md;

  // Escape HTML entities first
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks (```language ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    if (lang === "mermaid") {
      // Return mermaid block for client-side rendering
      return `<div class="mermaid-placeholder" data-diagram="${encodeURIComponent(code.trim())}">[Flowchart diagram]</div>`;
    }
    return `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 8px;font-size:14px;font-weight:600;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:20px 0 10px;font-size:15px;font-weight:600;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:0 0 12px;font-size:18px;font-weight:700;">$1</h2>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Em-dash handling
  html = html.replace(/ — /g, " — ");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;">$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;margin-left:20px;list-style-type:decimal;">$1</li>');

  // Paragraphs (lines that aren't already HTML)
  const lines = html.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
    } else if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<pre") ||
      trimmed.startsWith("<div") ||
      trimmed.startsWith("|")
    ) {
      result.push(line);
    } else {
      result.push(`<p style="margin:8px 0;line-height:1.5;">${trimmed}</p>`);
    }
  }

  return result.join("\n");
}

export function SopViewerModal({ frontmatter, content, onClose }: SopViewerModalProps) {
  const htmlContent = renderMarkdown(content);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(15,23,42,0.3)",
          maxHeight: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{frontmatter.title}</h2>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#6b7280" }}>
              <span>Rev {frontmatter.revision}</span>
              <span>•</span>
              <span>Updated {frontmatter.updated}</span>
              <span>•</span>
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: frontmatter.status === "draft" ? "#fef3c7" : "#dcfce7",
                  color: frontmatter.status === "draft" ? "#92400e" : "#166534",
                }}
              >
                {frontmatter.status}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 20,
              color: "#6b7280",
              padding: "0 4px",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            fontSize: 13,
            color: "#1f2937",
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />

        {/* Footer with tags */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {(frontmatter.tags || []).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 999,
                background: "#f1f5f9",
                color: "#475569",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
