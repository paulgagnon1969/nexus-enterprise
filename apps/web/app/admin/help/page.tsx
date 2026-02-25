"use client";

import React, { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ---------- Types ----------

interface HelpItem {
  id: string;
  helpKey: string;
  title: string;
  brief: string;
  sopId: string | null;
  sopSection: string | null;
  videoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  helpKey: string;
  title: string;
  brief: string;
  sopId: string;
  sopSection: string;
  videoUrl: string;
  isActive: boolean;
}

const emptyForm: FormData = {
  helpKey: "",
  title: "",
  brief: "",
  sopId: "",
  sopSection: "",
  videoUrl: "",
  isActive: true,
};

// ---------- Component ----------

export default function AdminHelpPage() {
  const [items, setItems] = useState<HelpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      const res = await fetch(`${API_BASE}/help-items`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to load help items (${res.status})`);
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleEdit = (item: HelpItem) => {
    setEditingId(item.id);
    setForm({
      helpKey: item.helpKey,
      title: item.title,
      brief: item.brief,
      sopId: item.sopId || "",
      sopSection: item.sopSection || "",
      videoUrl: item.videoUrl || "",
      isActive: item.isActive,
    });
  };

  const handleNew = () => {
    setEditingId("new");
    setForm(emptyForm);
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = getToken();

      const body = {
        helpKey: form.helpKey,
        title: form.title,
        brief: form.brief,
        sopId: form.sopId || null,
        sopSection: form.sopSection || null,
        videoUrl: form.videoUrl || null,
        isActive: form.isActive,
      };

      const url =
        editingId === "new"
          ? `${API_BASE}/help-items`
          : `${API_BASE}/help-items/${editingId}`;

      const res = await fetch(url, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to save (${res.status})`);
      }

      await loadItems();
      setEditingId(null);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this help item?")) return;

    try {
      setError(null);
      const token = getToken();
      const res = await fetch(`${API_BASE}/help-items/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      await loadItems();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Help Items
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            Manage contextual help content for the &quot;?&quot; overlay system
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          disabled={editingId !== null}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: editingId ? "#9ca3af" : "#2563eb",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: editingId ? "not-allowed" : "pointer",
          }}
        >
          + New Help Item
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "#fee2e2",
            color: "#b91c1c",
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Edit/Create Form */}
      {editingId && (
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
            {editingId === "new" ? "New Help Item" : "Edit Help Item"}
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Help Key *
              </label>
              <input
                type="text"
                value={form.helpKey}
                onChange={(e) =>
                  setForm({ ...form, helpKey: e.target.value })
                }
                placeholder="e.g., nav-projects, schedule-gantt-toggle"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                Must match data-help attribute in UI
              </span>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Projects Overview"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Brief Description *
            </label>
            <textarea
              value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
              placeholder="1-2 sentence description of this feature..."
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                SOP Document ID
              </label>
              <input
                type="text"
                value={form.sopId}
                onChange={(e) => setForm({ ...form, sopId: e.target.value })}
                placeholder="Document ID (optional)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                SOP Section
              </label>
              <input
                type="text"
                value={form.sopSection}
                onChange={(e) =>
                  setForm({ ...form, sopSection: e.target.value })
                }
                placeholder="Section anchor (optional)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Video URL
              </label>
              <input
                type="text"
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="YouTube or Loom URL (optional)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />
              <span style={{ fontSize: 13 }}>Active (visible in help overlay)</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.helpKey || !form.title || !form.brief}
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "none",
                background:
                  saving || !form.helpKey || !form.title || !form.brief
                    ? "#9ca3af"
                    : "#2563eb",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  saving || !form.helpKey || !form.title || !form.brief
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      {loading ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>Loading...</div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "#6b7280",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
          <p style={{ fontSize: 14 }}>No help items yet. Create one to get started!</p>
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                }}
              >
                Help Key
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                }}
              >
                Title
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                }}
              >
                Brief
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  width: 80,
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 600,
                  width: 120,
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {item.helpKey}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 500,
                  }}
                >
                  {item.title}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#6b7280",
                    maxWidth: 300,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.brief}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      background: item.isActive ? "#dcfce7" : "#f3f4f6",
                      color: item.isActive ? "#166534" : "#6b7280",
                    }}
                  >
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    textAlign: "right",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={editingId !== null}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      fontSize: 12,
                      cursor: editingId ? "not-allowed" : "pointer",
                      marginRight: 4,
                      opacity: editingId ? 0.5 : 1,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={editingId !== null}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      border: "1px solid #fca5a5",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: 12,
                      cursor: editingId ? "not-allowed" : "pointer",
                      opacity: editingId ? 0.5 : 1,
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
