"use client";

import React, { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function CompanySettingsPage() {
  return (
    <PageCard>
      <h2 style={{ marginTop: 0 }}>Company settings</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Configure your company assets, client defaults, project management tools, financial controls,
        directory, and integrations.
      </p>

      {/* Company profile – logo + core company information + office locations */}
      <CompanyProfileCard />

      {/* Company-facing login and applicant-facing apply pages */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        <LoginBrandingCard />
        <ApplyBrandingCard />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* Company core */}
        <SettingsColumn
          title="NEXUS Fortified Structures, LLC"
          sections={[
            {
              title: undefined,
              items: [
                "Company logo",
                "Company information",
                "Subscriptions",
                "Jobs",
              ],
            },
            {
              title: "Client settings",
              items: ["Default job permissions"],
            },
            {
              title: "Sales",
              items: ["Sales", "Lead generation"],
            },
          ]}
        />

        {/* Project management */}
        <SettingsColumn
          title="Project management"
          sections={[
            {
              title: undefined,
              items: [
                "Schedule",
                "Daily Logs",
                "To-do's",
                "Change Orders",
                "Selections",
                "Warranty",
                "Time Clock",
                "Risk insurance",
                "Client Updates",
              ],
            },
          ]}
        />

        {/* Files & Messaging */}
        <SettingsColumn
          title="Files"
          sections={[
            { title: undefined, items: ["Files"] },
            { title: "Messaging", items: ["Surveys", "RFIs"] },
          ]}
        />

        {/* Financials */}
        <SettingsColumn
          title="Financials"
          sections={[
            {
              title: undefined,
              items: [
                "Cost codes",
                "Catalog",
                "Bids",
                "Estimates",
                "Bills / POs / Budget",
                "Invoices",
                "Online payments",
                "Taxes",
              ],
            },
          ]}
        />

        {/* Directory */}
        <SettingsColumn
          title="Directory"
          sections={[
            {
              title: undefined,
              items: [
                "Role management",
                "Internal users",
                "Client contacts",
                "Subs / vendors",
              ],
            },
          ]}
        />

        {/* Integrations */}
        <SettingsColumn
          title="Integrations"
          sections={[
            {
              title: undefined,
              items: [
                "Buildertrend Takeoff",
                "Lowe's PRO",
                "The Home Depot",
                "Accounting",
                "Gusto",
                "HubSpot",
                "Salesforce",
                "Pipedrive",
                "Buildertrend Marketplace",
              ],
            },
          ]}
        />
      </div>
    </PageCard>
  );
}

function CompanyProfileCard() {
  const [companyName, setCompanyName] = useState("NEXUS Fortified Structures, LLC");
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [iconFileName, setIconFileName] = useState<string | null>(null);
  const [offices, setOffices] = useState<
    {
      id: string;
      label: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    }[]
  >([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [officesError, setOfficesError] = useState<string | null>(null);

  // ZIP-first flow for creating new offices via Smarty
  const [zipModalOpen, setZipModalOpen] = useState(false);
  const [zipInput, setZipInput] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const updateOffice = (id: string, patch: Partial<(typeof offices)[number]>) => {
    setOffices(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const loadOffices = async () => {
      try {
        setOfficesLoading(true);
        setOfficesError(null);
        const res = await fetch(`${API_BASE}/companies/me/offices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setOfficesLoading(false);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setOffices(
            data.map((o: any) => ({
              id: o.id,
              label: o.label ?? "Office",
              addressLine1: o.addressLine1 ?? "",
              addressLine2: o.addressLine2 ?? "",
              city: o.city ?? "",
              state: o.state ?? "",
              postalCode: o.postalCode ?? "",
              country: o.country ?? "US",
            })),
          );
        }
        setOfficesLoading(false);
      } catch {
        setOfficesLoading(false);
        setOfficesError("Could not load offices.");
      }
    };

    loadOffices();
  }, []);

  const [editMode, setEditMode] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<
    | null
    | {
        companyName: string;
        logoFileName: string | null;
        iconFileName: string | null;
        offices: typeof offices;
      }
  >(null);

  const addOffice = async (seed?: { zip?: string; city?: string; state?: string }) => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const body = {
      label: "New office",
      addressLine1: "",
      addressLine2: "",
      city: seed?.city ?? "",
      state: seed?.state ?? "",
      postalCode: seed?.zip ?? "",
      country: "US",
    };

    try {
      const res = await fetch(`${API_BASE}/companies/me/offices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return;
      }
      const created = await res.json();
      setOffices(prev => [...prev, created]);
    } catch {
      // swallow
    }
  };

  const removeOffice = async (id: string) => {
    setOffices(prev => prev.filter(o => o.id !== id));
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;
    try {
      await fetch(`${API_BASE}/companies/me/offices/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore failure; UI already hid the office
    }
  };

  const beginAddOffice = () => {
    if (!editMode) return;
    setZipInput("");
    setZipError(null);
    setZipModalOpen(true);
  };

  const handleZipConfirm = async () => {
    const zip = zipInput.trim();
    if (!zip) {
      setZipError("ZIP code is required.");
      return;
    }

    setZipLoading(true);
    setZipError(null);

    try {
      if (typeof window === "undefined") {
        setZipLoading(false);
        return;
      }
      const token = window.localStorage.getItem("accessToken");
      if (!token) {
        setZipError("You must be logged in.");
        setZipLoading(false);
        return;
      }

      const res = await fetch(
        `${API_BASE}/address/zip-lookup?zip=${encodeURIComponent(zip)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        // Allow user to continue with manual city/state entry.
        addOffice({ zip });
        setZipModalOpen(false);
        setZipLoading(false);
        return;
      }

      const data = await res.json();
      addOffice({ zip, city: data.city, state: data.state });
      setZipModalOpen(false);
      setZipLoading(false);
    } catch {
      // On unexpected error, still allow creating the office with the ZIP only.
      addOffice({ zip });
      setZipModalOpen(false);
      setZipLoading(false);
    }
  };

  const beginEdit = () => {
    setOriginalProfile({
      companyName,
      logoFileName,
      iconFileName,
      offices,
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    if (originalProfile) {
      setCompanyName(originalProfile.companyName);
      setLogoFileName(originalProfile.logoFileName);
      setIconFileName(originalProfile.iconFileName);
      setOffices(originalProfile.offices);
    }
    setEditMode(false);
  };

  const persistOfficeChanges = async () => {
    if (!originalProfile) return;
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    const changed = offices.filter(office => {
      const prev = originalProfile.offices.find(o => o.id === office.id);
      if (!prev) return true;
      return (
        prev.label !== office.label ||
        prev.addressLine1 !== office.addressLine1 ||
        prev.addressLine2 !== office.addressLine2 ||
        prev.city !== office.city ||
        prev.state !== office.state ||
        prev.postalCode !== office.postalCode ||
        prev.country !== office.country
      );
    });

    await Promise.all(
      changed.map(async office => {
        try {
          await fetch(`${API_BASE}/companies/me/offices/${encodeURIComponent(office.id)}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                label: office.label,
                addressLine1: office.addressLine1,
                addressLine2: office.addressLine2 || "",
                city: office.city,
                state: office.state,
                postalCode: office.postalCode,
                country: office.country,
              }),
            },
          );
        } catch {
          // Ignore failures for now; UI state remains updated locally.
        }
      }),
    );
  };

  const saveEdit = async () => {
    await persistOfficeChanges();
    setOriginalProfile({
      companyName,
      logoFileName,
      iconFileName,
      offices,
    });
    setEditMode(false);
  };

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 16,
        marginTop: 8,
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 14 }}>Company profile</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
            Manage your company identity, logo, and office locations. These settings will be used across
            Nexus for branding and mailing addresses.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!editMode && (
            <button
              type="button"
              onClick={beginEdit}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Edit profile
            </button>
          )}
          {editMode && (
            <>
              <button
                type="button"
                onClick={saveEdit}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save (read-only mode)
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {!editMode && (
        <p style={{ margin: "0 0 12px", fontSize: 11, color: "#6b7280" }}>
          Fields are read-only until you click <strong>Edit profile</strong>. Changes are not yet
          persisted to the backend.
        </p>
      )}

      {/* Name + logo uploads */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 220 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Company name
          </label>
          <input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            readOnly={!editMode}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 4,
              border: "1px solid #d1d5db",
              fontSize: 13,
            }}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Legal name shown on headers and contracts.
          </p>
        </div>

        <div style={{ flex: "1 1 180px", minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Logo
          </label>
          <input
            type="file"
            accept="image/*"
            disabled={!editMode}
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              setLogoFileName(file ? file.name : null);
            }}
          />
          {logoFileName && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
              Selected: {logoFileName}
            </p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Placeholder – logo upload wiring to file storage pending.
          </p>
        </div>

        <div style={{ flex: "1 1 180px", minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            App icon / mark
          </label>
          <input
            type="file"
            accept="image/*"
            disabled={!editMode}
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              setIconFileName(file ? file.name : null);
            }}
          />
          {iconFileName && (
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
              Selected: {iconFileName}
            </p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
            Placeholder – icon upload wiring to file storage pending.
          </p>
        </div>
      </div>

      {/* Office locations */}
      <div>
        {officesLoading && (
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280" }}>Loading offices…</p>
        )}
        {officesError && (
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#b91c1c" }}>{officesError}</p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>Office locations</div>
          <button
            type="button"
            onClick={beginAddOffice}
            disabled={!editMode}
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Add office
          </button>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280" }}>
          Future-proofed for multiple offices and mailing addresses. Data is not yet persisted.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {offices.map(office => (
            <div
              key={office.id}
              style={{
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                padding: 8,
                background: "#f9fafb",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 11, color: "#6b7280" }}>Office location</div>
                <button
                  type="button"
                  onClick={() => removeOffice(office.id)}
                  disabled={!editMode}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: 11,
                    cursor: "pointer",
                    opacity: !editMode ? 0.6 : 1,
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Single-line, wrapping layout for all address fields to save vertical space */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: "0 0 160px", minWidth: 140 }}>
                  <input
                    value={office.label}
                    onChange={e => updateOffice(office.id, { label: e.target.value })}
                    readOnly={!editMode}
                    placeholder="Office label (e.g. Headquarters)"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 260px", minWidth: 200 }}>
                  <input
                    value={office.addressLine1}
                    onChange={e => updateOffice(office.id, { addressLine1: e.target.value })}
                    readOnly={!editMode}
                    placeholder="Address line 1"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                  <input
                    value={office.addressLine2}
                    onChange={e => updateOffice(office.id, { addressLine2: e.target.value })}
                    readOnly={!editMode}
                    placeholder="Address line 2 (optional)"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 160px", minWidth: 140 }}>
                  <input
                    value={office.city}
                    onChange={e => updateOffice(office.id, { city: e.target.value })}
                    readOnly={!editMode}
                    placeholder="City"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 80px" }}>
                  <input
                    value={office.state}
                    onChange={e => updateOffice(office.id, { state: e.target.value })}
                    readOnly={!editMode}
                    placeholder="State"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 100px" }}>
                  <input
                    value={office.postalCode}
                    onChange={e => updateOffice(office.id, { postalCode: e.target.value })}
                    onBlur={async (e) => {
                      if (!editMode) return;
                      const zip = e.target.value.trim();
                      if (!zip) return;
                      try {
                        if (typeof window === "undefined") return;
                        const token = window.localStorage.getItem("accessToken");
                        if (!token) return;
                        const res = await fetch(
                          `${API_BASE}/address/zip-lookup?zip=${encodeURIComponent(zip)}`,
                          {
                            headers: { Authorization: `Bearer ${token}` },
                          },
                        );
                        if (!res.ok) return;
                        const data = await res.json();
                        const next: Partial<(typeof offices)[number]> = {};
                        if (data.city && data.city !== office.city) {
                          next.city = data.city;
                        }
                        if (data.state && data.state !== office.state) {
                          next.state = data.state;
                        }
                        if (Object.keys(next).length) {
                          updateOffice(office.id, next);
                        }
                      } catch {
                        // Silent failure; user can still enter city/state manually.
                      }
                    }}
                    placeholder="ZIP"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 90px" }}>
                  <input
                    value={office.country}
                    onChange={e => updateOffice(office.id, { country: e.target.value })}
                    readOnly={!editMode}
                    placeholder="Country"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {zipModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 8,
              padding: 16,
              width: "100%",
              maxWidth: 360,
              boxShadow: "0 10px 25px rgba(15,23,42,0.25)",
              fontSize: 13,
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>Enter ZIP code</h4>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
              Start by entering the ZIP code for this office. We&apos;ll use it to look up the city and
              state using Smarty. You can fine-tune the address on the next screen.
            </p>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              ZIP code
            </label>
            <input
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              placeholder="e.g. 94105"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                fontSize: 13,
                marginBottom: 6,
              }}
            />
            {zipError && (
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#b91c1c" }}>{zipError}</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (zipLoading) return;
                  setZipModalOpen(false);
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#374151",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleZipConfirm}
                disabled={zipLoading}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#f9fafb",
                  fontSize: 12,
                  cursor: "pointer",
                  opacity: zipLoading ? 0.7 : 1,
                }}
              >
                {zipLoading ? "Looking up..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginBrandingCard() {
  const [headline, setHeadline] = useState("Welcome back to Nexus");
  const [subcopy, setSubcopy] = useState(
    "Sign in to manage projects, financials, and your team.",
  );
  const [heroFileName, setHeroFileName] = useState<string | null>(null);

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 16,
        fontSize: 13,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Standard login page</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
        Control the look and feel of the main Nexus login page for this organization. Branding
        is shared across all internal users.
      </p>

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Headline
      </label>
      <input
        value={headline}
        onChange={e => setHeadline(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 13,
          marginBottom: 6,
        }}
      />

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Subheadline
      </label>
      <textarea
        value={subcopy}
        onChange={e => setSubcopy(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 13,
          resize: "vertical",
          marginBottom: 8,
        }}
      />

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Hero image (optional)
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={e => {
          const file = e.target.files?.[0] ?? null;
          setHeroFileName(file ? file.name : null);
        }}
      />
      {heroFileName && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
          Selected: {heroFileName}
        </p>
      )}
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
        Placeholder – wiring to update the public login UI and asset storage will be added later.
      </p>
    </div>
  );
}

function ApplyBrandingCard() {
  const [headline, setHeadline] = useState("Apply to join our team");
  const [subcopy, setSubcopy] = useState(
    "Tell candidates what makes your organization great. This copy appears on the generic Apply page.",
  );
  const [heroFileName, setHeroFileName] = useState<string | null>(null);

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 16,
        fontSize: 13,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Apply page</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
        Customize the public Apply page used by candidates. This is separate from the
        internal login branding.
      </p>

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Headline
      </label>
      <input
        value={headline}
        onChange={e => setHeadline(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 13,
          marginBottom: 6,
        }}
      />

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Subheadline
      </label>
      <textarea
        value={subcopy}
        onChange={e => setSubcopy(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          fontSize: 13,
          resize: "vertical",
          marginBottom: 8,
        }}
      />

      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        Hero image (optional)
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={e => {
          const file = e.target.files?.[0] ?? null;
          setHeroFileName(file ? file.name : null);
        }}
      />
      {heroFileName && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
          Selected: {heroFileName}
        </p>
      )}
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6b7280" }}>
        Placeholder – this will later drive the candidate-facing Apply page theme and imagery.
      </p>
    </div>
  );
}

interface SettingsColumnProps {
  title: string;
  sections: {
    title?: string;
    items: string[];
  }[];
}

function SettingsColumn({ title, sections }: SettingsColumnProps) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 12,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {sections.map((section, idx) => (
        <div key={idx} style={{ marginBottom: idx === sections.length - 1 ? 0 : 8 }}>
          {section.title && (
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              {section.title}
            </div>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {section.items.map((item) => (
              <li
                key={item}
                style={{
                  padding: "4px 0",
                  borderTop: "1px solid #f3f4f6",
                  cursor: "default",
                  color: "#374151",
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
