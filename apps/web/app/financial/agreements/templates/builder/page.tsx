"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { PageCard } from "../../../../ui-shell";
import { FileDropZone } from "../../../../components/file-drop-zone";
import { TemplateField, FIELD_TYPES } from "../../../../components/tiptap-template-field";
import DOMPurify from "dompurify";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// =============================================================================
// Types
// =============================================================================

interface ImportResult {
  html: string;
  sourceType: string;
  mode: "rich" | "overlay";
  pageImages?: string[];
  detectedVariables: string[];
  conversionQuality: string;
  warnings: string[];
}

interface FieldDef {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  group: string;
}

interface VersionSummary {
  id: string;
  versionNo: number;
  changeNote: string | null;
  createdAt: string;
  changedBy: { firstName: string | null; lastName: string | null; email: string } | null;
}

type BuilderStep = "upload" | "editor";

const CATEGORIES = [
  "CONTINGENCY",
  "SUBCONTRACT",
  "CHANGE_ORDER",
  "SERVICE",
  "NDA",
  "WORK_AUTHORIZATION",
  "OTHER",
] as const;

// =============================================================================
// Builder Page
// =============================================================================

export default function TemplateBuilderPage() {
  return (
    <Suspense
      fallback={
        <PageCard>
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
            Loading template builder…
          </div>
        </PageCard>
      }
    >
      <TemplateBuilderPageInner />
    </Suspense>
  );
}

function TemplateBuilderPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateId = searchParams.get("id");
  const isEdit = !!templateId;

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  // Step state
  const [step, setStep] = useState<BuilderStep>(isEdit ? "editor" : "upload");

  // Template metadata
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("OTHER");
  const [jurisdiction, setJurisdiction] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");

  // Content
  const [htmlContent, setHtmlContent] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [editingField, setEditingField] = useState<FieldDef | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[]>([]);

  // Loading states
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  // Transitions for heavy renders
  const [isUiPending, startUiTransition] = useTransition();

  // New field form
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldGroup, setNewFieldGroup] = useState("");

  // =========================================================================
  // TipTap editor
  // =========================================================================

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TemplateField,
    ],
    content: htmlContent || "<p>Start typing your agreement template here...</p>",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setHtmlContent(editor.getHTML());
      // Extract fields from the editor content
      syncFieldsFromEditor(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none",
        style: "min-height: 500px; padding: 24px; font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.6;",
      },
    },
  });

  // Sync editor content when editing an existing template
  useEffect(() => {
    if (editor && htmlContent && step === "editor") {
      const currentContent = editor.getHTML();
      if (currentContent !== htmlContent && !editor.isFocused) {
        editor.commands.setContent(htmlContent);
      }
    }
  }, [htmlContent, editor, step]);

  // =========================================================================
  // Load existing template (edit mode)
  // =========================================================================

  useEffect(() => {
    if (!templateId || !token) return;
    setLoading(true);
    fetch(`${API_BASE}/agreements/templates/${templateId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load template");
        return res.json();
      })
      .then((tpl) => {
        setTitle(tpl.title);
        setCode(tpl.code);
        setDescription(tpl.description || "");
        setCategory(tpl.category);
        setJurisdiction(tpl.jurisdiction || "");
        setSourceType(tpl.sourceType || "MANUAL");
        setHtmlContent(tpl.htmlContent);
        if (tpl.variables) {
          setFields(
            Array.isArray(tpl.variables)
              ? tpl.variables.map((v: any) => ({
                  fieldKey: v.key || v.fieldKey,
                  fieldLabel: v.label || v.fieldLabel || v.key || v.fieldKey,
                  fieldType: v.type || v.fieldType || "text",
                  required: v.required ?? false,
                  group: v.group || "",
                }))
              : [],
          );
        }
        setStep("editor");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [templateId, token]);

  // =========================================================================
  // Upload & Convert (Phase 3A)
  // =========================================================================

  const handleFileUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !token) return;

      setUploading(true);
      setError(null);
      setImportWarnings([]);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_BASE}/agreements/templates/import`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Upload failed (${res.status})`);
        }

        const result: ImportResult = await res.json();
        setHtmlContent(result.html);
        setSourceType(result.sourceType);
        setImportWarnings(result.warnings);

        // Pre-populate fields from detected variables
        if (result.detectedVariables.length > 0) {
          setFields(
            result.detectedVariables.map((key) => ({
              fieldKey: key,
              fieldLabel: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              fieldType: guessFieldType(key),
              required: false,
              group: "",
            })),
          );
        }

        // Auto-set title from filename
        if (!title) {
          const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
          setTitle(baseName.replace(/\b\w/g, (c) => c.toUpperCase()));
        }

        setStep("editor");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    },
    [token, title],
  );

  // =========================================================================
  // Field management
  // =========================================================================

  /** Extract template fields from the TipTap JSON to keep sidebar in sync */
  const syncFieldsFromEditor = useCallback((json: any) => {
    const found: FieldDef[] = [];
    const walk = (node: any) => {
      if (node.type === "templateField" && node.attrs) {
        found.push({
          fieldKey: node.attrs.fieldKey,
          fieldLabel: node.attrs.fieldLabel,
          fieldType: node.attrs.fieldType,
          required: node.attrs.required,
          group: node.attrs.group || "",
        });
      }
      if (node.content) node.content.forEach(walk);
    };
    walk(json);
    setFields((prev) => {
      // Merge: keep fields from editor, add any manual fields not in editor
      const editorKeys = new Set(found.map((f) => f.fieldKey));
      const manualFields = prev.filter((f) => !editorKeys.has(f.fieldKey));
      return [...found, ...manualFields];
    });
  }, []);

  const insertField = useCallback(
    (type: string) => {
      if (!editor) return;
      const key = newFieldKey.trim().toUpperCase().replace(/\s+/g, "_") || `${type.toUpperCase()}_FIELD`;
      const label = newFieldLabel.trim() || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      editor.chain().focus().insertTemplateField({
        fieldKey: key,
        fieldLabel: label,
        fieldType: type,
        required: newFieldRequired,
        group: newFieldGroup,
      }).run();

      // Reset field form
      setNewFieldKey("");
      setNewFieldLabel("");
      setNewFieldRequired(false);
      setNewFieldGroup("");
      setShowFieldConfig(false);
    },
    [editor, newFieldKey, newFieldLabel, newFieldRequired, newFieldGroup],
  );

  const removeField = useCallback(
    (fieldKey: string) => {
      if (!editor) return;
      // Remove from editor content
      const json = editor.getJSON();
      const removeFromNode = (node: any): any => {
        if (node.type === "templateField" && node.attrs?.fieldKey === fieldKey) {
          return null;
        }
        if (node.content) {
          node.content = node.content.map(removeFromNode).filter(Boolean);
        }
        return node;
      };
      const cleaned = removeFromNode({ ...json });
      editor.commands.setContent(cleaned);
      setFields((prev) => prev.filter((f) => f.fieldKey !== fieldKey));
    },
    [editor],
  );

  // =========================================================================
  // Save (Phase 3D)
  // =========================================================================

  const handleSave = useCallback(async () => {
    if (!token || !title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);

    const variables = fields.map((f) => ({
      key: f.fieldKey,
      label: f.fieldLabel,
      type: f.fieldType,
      required: f.required,
      group: f.group,
    }));

    const body: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      jurisdiction: jurisdiction.trim() || undefined,
      category,
      htmlContent: editor?.getHTML() || htmlContent,
      variables,
      sourceType,
    };

    try {
      if (isEdit) {
        // Update existing template
        const res = await fetch(`${API_BASE}/agreements/templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to update template");
        }
      } else {
        // Create new template
        if (!code.trim()) {
          setError("Template code is required");
          setSaving(false);
          return;
        }
        body.code = code.trim().toUpperCase().replace(/\s+/g, "-");
        const res = await fetch(`${API_BASE}/agreements/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to create template");
        }
        const created = await res.json();
        router.push(`/financial/agreements/templates/builder?id=${created.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [token, title, code, description, jurisdiction, category, htmlContent, fields, sourceType, isEdit, templateId, editor, router]);

  // =========================================================================
  // Version history
  // =========================================================================

  const loadVersions = useCallback(async () => {
    if (!templateId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/agreements/templates/${templateId}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setVersions(await res.json());
    } catch {}
  }, [templateId, token]);

  const restoreVersion = useCallback(
    async (versionNo: number) => {
      if (!templateId || !token) return;
      try {
        const res = await fetch(`${API_BASE}/agreements/templates/${templateId}/versions/${versionNo}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load version");
        const version = await res.json();
        setHtmlContent(version.htmlContent);
        if (version.variables) {
          setFields(
            Array.isArray(version.variables)
              ? version.variables.map((v: any) => ({
                  fieldKey: v.key || v.fieldKey,
                  fieldLabel: v.label || v.fieldLabel || v.key,
                  fieldType: v.type || v.fieldType || "text",
                  required: v.required ?? false,
                  group: v.group || "",
                }))
              : [],
          );
        }
        editor?.commands.setContent(version.htmlContent);
        setShowVersions(false);
      } catch (err: any) {
        setError(err.message);
      }
    },
    [templateId, token, editor],
  );

  // =========================================================================
  // Sanitized preview HTML
  // =========================================================================

  const previewHtml = useMemo(() => {
    if (typeof window === "undefined") return "";
    const raw = editor?.getHTML() || htmlContent;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["data-template-field", "data-field-type", "data-field-label"] });
  }, [editor, htmlContent, showPreview]);

  // =========================================================================
  // Render
  // =========================================================================

  if (loading) {
    return (
      <PageCard>
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading template...</div>
      </PageCard>
    );
  }

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/financial/agreements" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>
              ← Agreements
            </Link>
            <span style={{ color: "#d1d5db" }}>/</span>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
              {isEdit ? "Edit Template" : "New Template"}
            </span>
          </div>
          {step === "editor" && (
            <div style={{ display: "flex", gap: 8 }}>
              {isEdit && (
                <button
                  onClick={() => { startUiTransition(() => { setShowVersions(!showVersions); }); loadVersions(); }}
                  style={btnStyle("#f3f4f6", "#374151")}
                >
                  🕐 Versions
                </button>
              )}
              <button
                onClick={() => startUiTransition(() => setShowPreview(!showPreview))}
                style={btnStyle(showPreview ? "#dbeafe" : "#f3f4f6", showPreview ? "#1e40af" : "#374151")}
              >
                {showPreview ? "✏️ Edit" : "👁 Preview"}
              </button>
              <button onClick={handleSave} disabled={saving} style={btnStyle("#0f172a", "#ffffff")}>
                {saving ? "Saving..." : isEdit ? "💾 Save" : "💾 Create Template"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        {importWarnings.length > 0 && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fffbeb", color: "#92400e", fontSize: 12 }}>
            {importWarnings.map((w, i) => (
              <div key={i}>⚠️ {w}</div>
            ))}
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 1: Upload / Import                                          */}
        {/* ================================================================= */}
        {step === "upload" && (
          <div style={{ maxWidth: 600, margin: "40px auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Import a Document</h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 1.5 }}>
              Upload an existing document to convert it into an editable template.
              <br />
              <strong>DOCX files give the best editing experience.</strong> PDFs and images will use overlay mode.
            </p>

            <FileDropZone
              onFiles={handleFileUpload}
              accept=".docx,.pdf,.html,.htm,.png,.jpg,.jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/html,image/png,image/jpeg"
              multiple={false}
              disabled={uploading}
              buttonLabel={uploading ? "Converting..." : "Choose File"}
              buttonIcon={uploading ? "⏳" : "📄"}
              hint="Accepted: .docx (recommended), .pdf, .html, .png, .jpg"
              minHeight={140}
            />

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
              <button
                onClick={() => {
                  setSourceType("MANUAL");
                  setStep("editor");
                }}
                style={{
                  background: "none", border: "none", color: "#2563eb",
                  fontSize: 13, cursor: "pointer", textDecoration: "underline",
                }}
              >
                Or start from scratch →
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Editor                                                    */}
        {/* ================================================================= */}
        {step === "editor" && (
          <>
            {/* Metadata bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Florida Contingency Agreement"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Code {!isEdit && "*"}</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. FL-CONTINGENCY-001"
                  disabled={isEdit}
                  style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                  style={inputStyle}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Jurisdiction</label>
                <input
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="e.g. FL, TX"
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this template..."
                style={inputStyle}
              />
            </div>

            {/* Main editor area with sidebar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, minHeight: 600 }}>
              {/* Left: Editor or Preview */}
              <div style={{ border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                {showPreview ? (
                  /* Preview mode */
                  <div style={{ padding: 24, fontFamily: "'Times New Roman', Georgia, serif", fontSize: "12pt", lineHeight: 1.6 }}>
                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                ) : (
                  /* Edit mode */
                  <>
                    {/* Formatting toolbar */}
                    <div style={toolbarStyle}>
                      <ToolbarGroup>
                        <TBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold"><strong>B</strong></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic"><em>I</em></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive("underline")} title="Underline"><span style={{ textDecoration: "underline" }}>U</span></TBtn>
                      </ToolbarGroup>
                      <TDiv />
                      <ToolbarGroup>
                        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive("heading", { level: 1 })} title="H1">H1</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="H2">H2</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} title="H3">H3</TBtn>
                      </ToolbarGroup>
                      <TDiv />
                      <ToolbarGroup>
                        <TBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet List">•</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} title="Numbered List">1.</TBtn>
                      </ToolbarGroup>
                      <TDiv />
                      <ToolbarGroup>
                        <TBtn onClick={() => editor?.chain().focus().setTextAlign("left").run()} active={editor?.isActive({ textAlign: "left" })} title="Left">⫷</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().setTextAlign("center").run()} active={editor?.isActive({ textAlign: "center" })} title="Center">⫸</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().setTextAlign("right").run()} active={editor?.isActive({ textAlign: "right" })} title="Right">⫹</TBtn>
                      </ToolbarGroup>
                      <TDiv />
                      <ToolbarGroup>
                        <TBtn onClick={() => editor?.chain().focus().undo().run()} title="Undo">↶</TBtn>
                        <TBtn onClick={() => editor?.chain().focus().redo().run()} title="Redo">↷</TBtn>
                      </ToolbarGroup>
                    </div>

                    {/* Field insertion toolbar */}
                    <div style={{ ...toolbarStyle, borderBottom: "1px solid #e5e7eb", gap: 4, background: "#f0f9ff" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginRight: 4 }}>Insert Field:</span>
                      {FIELD_TYPES.map((ft) => (
                        <button
                          key={ft.type}
                          onClick={() => {
                            setNewFieldType(ft.type);
                            setShowFieldConfig(true);
                          }}
                          title={ft.label}
                          style={{
                            padding: "3px 8px", borderRadius: 4, border: "1px solid #d1d5db",
                            background: "#fff", fontSize: 11, cursor: "pointer", display: "flex",
                            alignItems: "center", gap: 3, whiteSpace: "nowrap",
                          }}
                        >
                          <span>{ft.icon}</span>
                          <span>{ft.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Field config popup */}
                    {showFieldConfig && (
                      <div style={{
                        padding: 12, background: "#fefce8", borderBottom: "1px solid #fde047",
                        display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap",
                      }}>
                        <div>
                          <label style={{ fontSize: 10, color: "#6b7280", display: "block" }}>Field Key</label>
                          <input
                            value={newFieldKey}
                            onChange={(e) => setNewFieldKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                            placeholder="e.g. CLIENT_NAME"
                            style={{ ...inputStyle, width: 140, fontSize: 12 }}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "#6b7280", display: "block" }}>Label</label>
                          <input
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder="e.g. Client Name"
                            style={{ ...inputStyle, width: 140, fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, color: "#6b7280", display: "block" }}>Group</label>
                          <input
                            value={newFieldGroup}
                            onChange={(e) => setNewFieldGroup(e.target.value)}
                            placeholder="e.g. Parties"
                            style={{ ...inputStyle, width: 100, fontSize: 12 }}
                          />
                        </div>
                        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          <input type="checkbox" checked={newFieldRequired} onChange={(e) => setNewFieldRequired(e.target.checked)} />
                          Required
                        </label>
                        <button onClick={() => insertField(newFieldType)} style={btnStyle("#0f172a", "#fff")}>
                          Insert {FIELD_TYPES.find((f) => f.type === newFieldType)?.icon} Field
                        </button>
                        <button onClick={() => setShowFieldConfig(false)} style={btnStyle("#f3f4f6", "#374151")}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Editor content */}
                    <EditorContent editor={editor} />
                  </>
                )}
              </div>

              {/* Right sidebar: field palette */}
              <div style={{ border: "1px solid #d1d5db", borderRadius: 8, background: "#fafafa", overflow: "auto" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#f3f4f6" }}>
                  <strong style={{ fontSize: 13 }}>Template Fields</strong>
                  <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>({fields.length})</span>
                </div>

                {fields.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                    No fields yet. Use the field toolbar above to insert fields into your template.
                  </div>
                ) : (
                  <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {fields.map((f) => (
                      <FieldCard
                        key={f.fieldKey}
                        field={f}
                        onRemove={() => removeField(f.fieldKey)}
                        onEdit={() => { setEditingField(f); }}
                      />
                    ))}
                  </div>
                )}

                {/* Quick reference */}
                <div style={{ padding: 12, borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>
                  <strong>Tip:</strong> Fields appear as colored pills in the editor. When the template is used to create an agreement, each field becomes a fillable input.
                  <br /><br />
                  <strong>Variable syntax:</strong> {"{{FIELD_KEY}}"} — The key is used in the rendered HTML.
                </div>
              </div>
            </div>
          </>
        )}

        {/* Version history drawer */}
        {showVersions && (
          <div style={{
            position: "fixed", right: 0, top: 0, bottom: 0, width: 380,
            background: "#fff", borderLeft: "1px solid #d1d5db",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.1)", zIndex: 50, overflowY: "auto",
          }}>
            <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 14 }}>🕐 Version History</strong>
              <button onClick={() => setShowVersions(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
            {versions.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No previous versions yet.</div>
            ) : (
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {versions.map((v) => (
                  <div key={v.id} style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: 13 }}>v{v.versionNo}</strong>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {v.changeNote && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{v.changeNote}</div>}
                    {v.changedBy && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                        by {v.changedBy.firstName} {v.changedBy.lastName}
                      </div>
                    )}
                    <button
                      onClick={() => restoreVersion(v.versionNo)}
                      style={{ ...btnStyle("#f3f4f6", "#374151"), marginTop: 6, fontSize: 11 }}
                    >
                      Restore this version
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor styles for template field pills */}
      <style jsx global>{`
        .ProseMirror {
          min-height: 500px;
          padding: 24px;
          outline: none;
          font-family: "Times New Roman", Georgia, serif;
          font-size: 12pt;
          line-height: 1.6;
        }
        .ProseMirror p { margin: 8pt 0; }
        .ProseMirror h1 { font-size: 18pt; font-weight: 600; margin: 16pt 0 10pt; }
        .ProseMirror h2 { font-size: 14pt; font-weight: 600; margin: 14pt 0 8pt; }
        .ProseMirror h3 { font-size: 12pt; font-weight: 600; margin: 12pt 0 6pt; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 24pt; margin: 8pt 0; }
        .ProseMirror li { margin: 4pt 0; }
        .ProseMirror blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; color: #6b7280; margin: 1em 0; }
        .ProseMirror hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
        .template-field-pill:hover { opacity: 0.85; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        .template-field-pill.ProseMirror-selectednode { outline: 2px solid #2563eb; outline-offset: 1px; }
      `}</style>
    </PageCard>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function FieldCard({ field, onRemove, onEdit }: { field: FieldDef; onRemove: () => void; onEdit: () => void }) {
  const ft = FIELD_TYPES.find((t) => t.type === field.fieldType);
  return (
    <div
      style={{
        padding: "8px 10px", borderRadius: 6,
        border: "1px solid #e5e7eb", background: "#fff",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>{ft?.icon || "📝"}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {field.fieldLabel}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280" }}>
            {`{{${field.fieldKey}}}`}
            {field.required && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
            {field.group && <span style={{ marginLeft: 4, color: "#9ca3af" }}>· {field.group}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={onRemove}
        title="Remove field"
        style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: 2 }}
      >
        ×
      </button>
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 2 }}>{children}</div>;
}

function TDiv() {
  return <div style={{ width: 1, backgroundColor: "#d1d5db", margin: "0 4px" }} />;
}

function TBtn({ onClick, active, title, children }: { onClick?: () => void; active?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 8px", fontSize: 13, fontWeight: 500, minWidth: 28, height: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", borderRadius: 4,
        backgroundColor: active ? "#dbeafe" : "transparent",
        color: active ? "#1e40af" : "#374151",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function guessFieldType(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("date") || k.includes("dob") || k.includes("expir")) return "date";
  if (k.includes("phone") || k.includes("tel") || k.includes("mobile")) return "phone";
  if (k.includes("email")) return "email";
  if (k.includes("sign")) return "signature";
  if (k.includes("initial")) return "initials";
  if (k.includes("amount") || k.includes("fee") || k.includes("price") || k.includes("cost")) return "currency";
  if (k.includes("address") || k.includes("street") || k.includes("city") || k.includes("zip")) return "address";
  if (k.includes("agree") || k.includes("accept") || k.includes("confirm")) return "checkbox";
  return "text";
}

// Shared styles
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, outline: "none" };
const toolbarStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 10px", borderBottom: "1px solid #e5e7eb", backgroundColor: "#f9fafb", alignItems: "center" };

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 6, border: bg === "#f3f4f6" ? "1px solid #d1d5db" : "none",
    background: bg, color, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  };
}
