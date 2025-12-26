"use client";

import React, { useState } from "react";
import { PageCard } from "../../ui-shell";

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
  >([
    {
      id: "office-1",
      label: "Headquarters",
      addressLine1: "123 Main St",
      addressLine2: "",
      city: "Your city",
      state: "ST",
      postalCode: "00000",
      country: "US",
    },
  ]);

  const updateOffice = (id: string, patch: Partial<(typeof offices)[number]>) => {
    setOffices(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
  };

  const addOffice = () => {
    const id = `office-${offices.length + 1}`;
    setOffices(prev => [
      ...prev,
      {
        id,
        label: "New office",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
      },
    ]);
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
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Company profile</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
        Manage your company identity, logo, and office locations. These settings will be used across
        Nexus for branding and mailing addresses.
      </p>

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
            onClick={addOffice}
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
              <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px", minWidth: 120 }}>
                  <input
                    value={office.label}
                    onChange={e => updateOffice(office.id, { label: e.target.value })}
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
                <div style={{ flex: "2 1 220px", minWidth: 180 }}>
                  <input
                    value={office.addressLine1}
                    onChange={e => updateOffice(office.id, { addressLine1: e.target.value })}
                    placeholder="Address line 1"
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  />
                  <input
                    value={office.addressLine2}
                    onChange={e => updateOffice(office.id, { addressLine2: e.target.value })}
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
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 140px", minWidth: 120 }}>
                  <input
                    value={office.city}
                    onChange={e => updateOffice(office.id, { city: e.target.value })}
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
                <div style={{ flex: "0 0 80px" }}>
                  <input
                    value={office.country}
                    onChange={e => updateOffice(office.id, { country: e.target.value })}
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
