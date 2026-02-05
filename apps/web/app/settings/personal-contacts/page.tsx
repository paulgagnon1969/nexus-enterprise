"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";
import ContactPickerModal from "../../components/contact-picker-modal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MeDto {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface PersonalContactSummary {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source?: string | null;
}

export default function PersonalContactsSettingsPage() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [contacts, setContacts] = useState<PersonalContactSummary[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Soft search: single keyword/phrase across name, email, and phone.
  const [search, setSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvSaving, setCsvSaving] = useState(false);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token; please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const meRes = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meRes.ok) {
          throw new Error(`Failed to load profile (${meRes.status})`);
        }
        const meJson: MeDto = await meRes.json();
        setMe(meJson);

        // Initial contacts load with no search term.
        try {
          setSearchLoading(true);
          const contactsRes = await fetch(`${API_BASE}/personal-contacts?limit=200`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (contactsRes.ok) {
            const listJson: any[] = await contactsRes.json().catch(() => []);
            if (Array.isArray(listJson)) {
              setContacts(listJson as PersonalContactSummary[]);
            } else {
              setContacts([]);
            }
          } else {
            setContacts([]);
          }
        } finally {
          setSearchLoading(false);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load personal contacts.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const handleImportCsv = async (file: File | null) => {
    setCsvStatus(null);
    setCsvError(null);

    if (!file) {
      setCsvError("Please choose a CSV file first.");
      return;
    }

    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setCsvError("Missing access token; please log in again.");
      return;
    }

    setCsvSaving(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
      if (!lines.length) {
        throw new Error("CSV file is empty.");
      }

      // Strict, template-based header: First Name, Last Name, Email, Phone (optional), Company, Job Title.
      const rawHeader = lines[0].split(",");
      const header = rawHeader.map(h => h.replace(/"/g, "").trim().toLowerCase());

      const findIndex = (name: string) =>
        header.findIndex(h => h === name || h === name.replace(" ", "") || h === `${name} address`);

      const idxFirst = findIndex("first name");
      const idxLast = findIndex("last name");
      const idxEmail = findIndex("email");
      const idxPhone = findIndex("phone");
      const idxCompany = findIndex("company");
      const idxJobTitle = findIndex("job title");

      if (idxEmail === -1) {
        throw new Error(
          `Expected an 'Email' column. Please use the CSV template (First Name, Last Name, Email, Phone). ` +
            `Found headers: ${header.join(", ") || "<none>"}`,
        );
      }

      const contactsToImport: any[] = [];
      for (let i = 1; i < lines.length; i += 1) {
        const row = lines[i];
        if (!row) continue;
        const cols = row.split(",");
        const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : "");

        const firstName = idxFirst >= 0 ? get(idxFirst) : "";
        const lastName = idxLast >= 0 ? get(idxLast) : "";
        const email = get(idxEmail);
        const phone = idxPhone >= 0 ? get(idxPhone) : "";
        const company = idxCompany >= 0 ? get(idxCompany) : "";
        const jobTitle = idxJobTitle >= 0 ? get(idxJobTitle) : "";

        if (!email && !phone) {
          continue;
        }

        const baseName = `${firstName} ${lastName}`.trim();
        const nameParts: string[] = [];
        if (baseName) nameParts.push(baseName);
        if (company) nameParts.push(company);
        if (jobTitle) nameParts.push(jobTitle);
        const displayName = nameParts.length > 0 ? nameParts.join(" – ") : undefined;

        contactsToImport.push({
          displayName,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
        });
      }

      if (!contactsToImport.length) {
        throw new Error("No contacts with email or phone were found in the CSV.");
      }

      const res = await fetch(`${API_BASE}/personal-contacts/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contacts: contactsToImport }),
      });

      if (!res.ok) {
        const textBody = await res.text().catch(() => "");
        throw new Error(textBody || `Import failed (${res.status})`);
      }

      const json: any = await res.json().catch(() => null);
      const count = typeof json?.count === "number" ? json.count : contactsToImport.length;
      const createdCount = typeof json?.createdCount === "number" ? json.createdCount : null;
      const updatedCount = typeof json?.updatedCount === "number" ? json.updatedCount : null;

      const parts: string[] = [];
      parts.push(`Total touched: ${count}`);
      if (createdCount != null) parts.push(`created: ${createdCount}`);
      if (updatedCount != null) parts.push(`updated: ${updatedCount}`);

      const timestamp = new Date().toLocaleString();
      setCsvStatus(`Last import (${timestamp}) – ${parts.join(" · ")} into your confidential personal contact book.`);

      // Refresh list after import (best-effort).
      try {
        const listRes = await fetch(`${API_BASE}/personal-contacts?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (listRes.ok) {
          const listJson: any[] = await listRes.json().catch(() => []);
          if (Array.isArray(listJson)) {
            setContacts(listJson as PersonalContactSummary[]);
          }
        }
      } catch {
        // ignore list refresh errors
      }
    } catch (e: any) {
      setCsvError(e?.message ?? "Failed to import contacts from CSV.");
    } finally {
      setCsvSaving(false);
    }
  };

  const handleSearchChange = async (value: string) => {
    setSearch(value);

    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (value.trim()) params.set("search", value.trim());
      params.set("limit", "200");

      const res = await fetch(`${API_BASE}/personal-contacts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // Do not override the main page error; just leave existing list.
        return;
      }

      const listJson: any[] = await res.json().catch(() => []);
      if (Array.isArray(listJson)) {
        setContacts(listJson as PersonalContactSummary[]);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const csvDownloadName = (() => {
    const today = new Date();
    const yyyy = today.getFullYear().toString().padStart(4, "0");
    const mm = (today.getMonth() + 1).toString().padStart(2, "0");
    const dd = today.getDate().toString().padStart(2, "0");
    const datePrefix = `${yyyy}${mm}${dd}`;

    const rawLastName = (me?.lastName || "contacts").toString();
    const safeLastName = rawLastName.replace(/[^A-Za-z0-9_-]/g, "").trim() || "contacts";

    return `${datePrefix}_${safeLastName}_NCC-addressbook.csv`;
  })();

  const headerTitle = me
    ? `${me.firstName || ""} ${me.lastName || ""}`.trim() || me.email
    : "Your personal contacts";

  return (
    <PageCard>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Personal contacts</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        {headerTitle ? `Manage personal contacts for ${headerTitle}.` : "Manage your personal contacts."}
      </p>

      <section
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          fontSize: 12,
          maxWidth: 520,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 4,
          }}
        >
          <h2 style={{ fontSize: 14, marginTop: 0, marginBottom: 4 }}>CSV import</h2>
          <a
            href="/templates/personal-contacts-template.csv"
            download={csvDownloadName}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #16a34a",
              backgroundColor: "#16a34a",
              color: "#f9fafb",
              fontSize: 12,
              fontWeight: 500,
              fontVariant: "small-caps",
              textDecoration: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            Download CSV Template
          </a>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
          Import your personal contacts from a CSV file. Use the CSV template format: First Name, Last Name, Email,
          Phone, Company, Job Title (company/job title optional). Contacts are attached to your global profile and
          remain confidential to you; tenants and admins cannot browse these contacts.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={csvSaving}
          onChange={e => {
            const file = e.target.files?.[0] ?? null;
            setCsvFile(file);
            setCsvStatus(null);
            setCsvError(null);
          }}
          style={{ fontSize: 12 }}
        />
        {csvSaving && (
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Importing contacts…</p>
        )}
        {csvStatus && (
          <p style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>{csvStatus}</p>
        )}
        {csvError && (
          <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>{csvError}</p>
        )}
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            onClick={() => void handleImportCsv(csvFile)}
            disabled={!csvFile || csvSaving}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid #0f172a",
              backgroundColor: !csvFile || csvSaving ? "#e5e7eb" : "#0f172a",
              color: !csvFile || csvSaving ? "#4b5563" : "#f9fafb",
              fontSize: 12,
              cursor: !csvFile || csvSaving ? "default" : "pointer",
            }}
          >
            {csvSaving ? "Importing…" : "Import contacts from CSV"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, marginTop: 0, marginBottom: 6 }}>Use contacts to invite people</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          Open the same invite picker used by Refer a Friend. Your personal contact book remains confidential; invitations
          are only sent when you explicitly choose contacts and confirm.
        </p>
        <button
          type="button"
          onClick={() => setContactsOpen(true)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px dashed #16a34a",
            backgroundColor: "#f0fdf4",
            color: "#166534",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Invite from my contacts
        </button>
      </section>

      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <h2 style={{ fontSize: 14, marginTop: 0, marginBottom: 0 }}>Recent personal contacts</h2>
          <input
            type="text"
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={e => void handleSearchChange(e.target.value)}
            style={{
              minWidth: 180,
              maxWidth: 260,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 12,
            }}
          />
        </div>
        {loading ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Loading…</p>
        ) : error ? (
          <p style={{ fontSize: 12, color: "#b91c1c" }}>{error}</p>
        ) : searchLoading ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>Searching contacts…</p>
        ) : contacts.length === 0 ? (
          <p style={{ fontSize: 12, color: "#6b7280" }}>No personal contacts on file yet.</p>
        ) : (
          <div
            style={{
              marginTop: 4,
              maxHeight: 260,
              overflowY: "auto",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Name
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Email
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Phone
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const name =
                    c.displayName ||
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    c.email ||
                    c.phone ||
                    "—";
                  return (
                    <tr key={c.id}>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{name}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{c.email || "—"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{c.phone || "—"}</td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>{c.source || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ContactPickerModal open={contactsOpen} onClose={() => setContactsOpen(false)} />
    </PageCard>
  );
}
