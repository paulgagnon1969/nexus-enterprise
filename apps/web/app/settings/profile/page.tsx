"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MeDto {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface PortfolioDto {
  id: string;
  headline?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
}

interface PortfolioHrDto {
  displayEmail?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  bankName?: string | null;
  bankAddress?: string | null;
  hipaaNotes?: string | null;

  ssnLast4?: string | null;
  itinLast4?: string | null;
  bankAccountLast4?: string | null;
  bankRoutingLast4?: string | null;

  hasSsn?: boolean;
  hasItin?: boolean;
  hasBankAccount?: boolean;
  hasBankRouting?: boolean;
}

interface MyPortfolioResponse {
  user: MeDto;
  portfolio: PortfolioDto;
  canViewHr: boolean;
  hr: PortfolioHrDto | null;
}


export default function ProfileSettingsPage() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioDto | null>(null);
  const [hr, setHr] = useState<PortfolioHrDto | null>(null);
  const [canViewHr, setCanViewHr] = useState(false);

  // Public
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");

  // HR-only (non-secret)
  const [displayEmail, setDisplayEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [bankName, setBankName] = useState("");
  const [bankAddress, setBankAddress] = useState("");
  const [hipaaNotes, setHipaaNotes] = useState("");

  // HR-only (secret inputs; never prefilled)
  const [ssn, setSsn] = useState("");
  const [itin, setItin] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankRoutingNumber, setBankRoutingNumber] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "es">("en");


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

        const res = await fetch(`${API_BASE}/users/me/portfolio`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load profile (${res.status})`);
        }

        const json: MyPortfolioResponse = await res.json();
        setMe(json.user);
        setPortfolio(json.portfolio);
        setCanViewHr(!!json.canViewHr);
        setHr(json.hr ?? null);

        setFirstName(json.user.firstName ?? "");
        setLastName(json.user.lastName ?? "");
        setHeadline(json.portfolio.headline ?? "");
        setBio(json.portfolio.bio ?? "");

        // HR-only values (safe to prefill)
        setDisplayEmail(json.hr?.displayEmail ?? "");
        setPhone(json.hr?.phone ?? "");
        setAddressLine1(json.hr?.addressLine1 ?? "");
        setAddressLine2(json.hr?.addressLine2 ?? "");
        setCity(json.hr?.city ?? "");
        setState(json.hr?.state ?? "");
        setPostalCode(json.hr?.postalCode ?? "");
        setCountry(json.hr?.country ?? "US");
        setBankName(json.hr?.bankName ?? "");
        setBankAddress(json.hr?.bankAddress ?? "");
        setHipaaNotes(json.hr?.hipaaNotes ?? "");
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);


  const save = async () => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const payload: any = {
        firstName,
        lastName,
        headline,
        bio,

        // HR-only (non-secret)
        displayEmail,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        bankName,
        bankAddress,
        hipaaNotes,
      };

      // HR-only (secret): only send if user typed something.
      if (ssn.trim() !== "") payload.ssn = ssn;
      if (itin.trim() !== "") payload.itin = itin;
      if (bankAccountNumber.trim() !== "") payload.bankAccountNumber = bankAccountNumber;
      if (bankRoutingNumber.trim() !== "") payload.bankRoutingNumber = bankRoutingNumber;

      const res = await fetch(`${API_BASE}/users/me/portfolio`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${text}`);
      }

      const json: MyPortfolioResponse = await res.json();
      setMe(json.user);
      setPortfolio(json.portfolio);
      setCanViewHr(!!json.canViewHr);
      setHr(json.hr ?? null);

      // Refresh form state from persisted values (and clear secret inputs)
      setFirstName(json.user.firstName ?? "");
      setLastName(json.user.lastName ?? "");
      setHeadline(json.portfolio.headline ?? "");
      setBio(json.portfolio.bio ?? "");

      setDisplayEmail(json.hr?.displayEmail ?? "");
      setPhone(json.hr?.phone ?? "");
      setAddressLine1(json.hr?.addressLine1 ?? "");
      setAddressLine2(json.hr?.addressLine2 ?? "");
      setCity(json.hr?.city ?? "");
      setState(json.hr?.state ?? "");
      setPostalCode(json.hr?.postalCode ?? "");
      setCountry(json.hr?.country ?? "US");
      setBankName(json.hr?.bankName ?? "");
      setBankAddress(json.hr?.bankAddress ?? "");
      setHipaaNotes(json.hr?.hipaaNotes ?? "");

      setSsn("");
      setItin("");
      setBankAccountNumber("");
      setBankRoutingNumber("");

      setMessage("Saved.");

      // Reload so the header initials update.
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };


  const displayName =
    me?.firstName || me?.lastName ? `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim() : "";
  const headerTitle = displayName ? `${displayName} (${me?.email ?? ""})` : me?.email ?? "";

  const profilePhotoSrc = (() => {
    const url = portfolio?.photoUrl || null;
    if (!url) return null;
    if (url.startsWith("/uploads/")) {
      return `${API_BASE}${url}`;
    }
    return url;
  })();

  return (
    <PageCard>
      {/* Skills Matrix-style profile header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: 12,
          border: "1px solid var(--color-border-subtle)",
          borderRadius: 10,
          backgroundColor: "#ffffff",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "9999px",
            overflow: "hidden",
            backgroundColor: "#e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img
            src={profilePhotoSrc || "/nexus-logo-mark.png"}
            alt={displayName ? `Profile photo of ${displayName}` : "Profile photo"}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>
            {headerTitle || "—"}
          </div>
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--color-muted)" }}>
            Manage your portfolio content here (public profile + HR-only).
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 0, fontSize: 18, color: "var(--color-text)" }}>Portfolio Manager</h2>
      <p style={{ marginTop: 6, fontSize: 13, color: "var(--color-muted)" }}>
        Public info (left) is safe to share. HR-only info (right) is private.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
            Signed in as{" "}
            {me?.email ? (
              <a
                href={`mailto:${me.email}`}
                style={{ color: "var(--color-text)", textDecoration: "none" }}
              >
                {me.email}
              </a>
            ) : (
              <strong style={{ color: "var(--color-text)" }}>{me?.email}</strong>
            )}
          </div>


          <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
            {/* LEFT: PUBLIC */}
            <div
              style={{
                flex: "1 1 420px",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: 10,
                padding: 14,
                background: "#ffffff",
                minWidth: 320,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>
                My Portfolio — Public (others can see)
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-muted)" }}>
                Safe-to-share information used across Nexus.
              </div>

              <div style={{ height: 1, background: "var(--color-border-subtle)", margin: "12px 0" }} />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 220px" }}>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>First name</div>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </label>

                <label style={{ flex: "1 1 220px" }}>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Last name</div>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                <label style={{ flex: "1 1 420px" }}>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Headline</div>
                  <input
                    value={headline}
                    onChange={e => setHeadline(e.target.value)}
                    placeholder="e.g., Project Manager, Carpenter, Welder"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                    }}
                  />
                </label>

                <label style={{ flex: "1 1 420px" }}>
                  <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Public bio</div>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Short public summary (non-sensitive)."
                    rows={5}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
            </div>

            {/* RIGHT: HR ONLY */}
            <div
              style={{
                flex: "1 1 420px",
                border: "1px solid var(--color-text)",
                borderRadius: 10,
                padding: 14,
                background: "#ffffff",
                minWidth: 320,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>
                My Portfolio — HR ONLY
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-muted)" }}>
                Private information. Visible to you, HR, and Nexus System Super Users.
              </div>

              {!canViewHr ? (
                <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-muted)" }}>
                  HR-only data is locked.
                </div>
              ) : (
                <>
                  <div style={{ height: 1, background: "var(--color-border-subtle)", margin: "12px 0" }} />

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ flex: "1 1 240px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Email (display)</div>
                      <input
                        value={displayEmail}
                        onChange={e => setDisplayEmail(e.target.value)}
                        placeholder="e.g., you@company.com"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>

                    <label style={{ flex: "1 1 240px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Phone</div>
                      <input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="e.g., (555) 555-5555"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ flex: "1 1 420px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Address line 1</div>
                      <input
                        value={addressLine1}
                        onChange={e => setAddressLine1(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 420px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Address line 2</div>
                      <input
                        value={addressLine2}
                        onChange={e => setAddressLine2(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ flex: "1 1 180px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>City</div>
                      <input
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 120px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>State</div>
                      <input
                        value={state}
                        onChange={e => setState(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 140px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Postal code</div>
                      <input
                        value={postalCode}
                        onChange={e => setPostalCode(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 140px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Country</div>
                      <input
                        value={country}
                        onChange={e => setCountry(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ height: 1, background: "var(--color-border-subtle)", margin: "12px 0" }} />

                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text)" }}>
                    Sensitive (stored encrypted)
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ flex: "1 1 200px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>SSN / ITIN</div>
                      <input
                        value={ssn}
                        onChange={e => setSsn(e.target.value)}
                        placeholder={hr?.ssnLast4 ? `Stored (ends in ${hr.ssnLast4})` : "Enter SSN"}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-muted)" }}>
                        Leave blank to keep existing.
                      </div>
                    </label>

                    <label style={{ flex: "1 1 200px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>ITIN (optional)</div>
                      <input
                        value={itin}
                        onChange={e => setItin(e.target.value)}
                        placeholder={hr?.itinLast4 ? `Stored (ends in ${hr.itinLast4})` : "Enter ITIN"}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-muted)" }}>
                        Leave blank to keep existing.
                      </div>
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ flex: "1 1 200px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Bank account #</div>
                      <input
                        value={bankAccountNumber}
                        onChange={e => setBankAccountNumber(e.target.value)}
                        placeholder={
                          hr?.bankAccountLast4 ? `Stored (ends in ${hr.bankAccountLast4})` : "Enter account number"
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 200px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Routing #</div>
                      <input
                        value={bankRoutingNumber}
                        onChange={e => setBankRoutingNumber(e.target.value)}
                        placeholder={
                          hr?.bankRoutingLast4 ? `Stored (ends in ${hr.bankRoutingLast4})` : "Enter routing number"
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ flex: "1 1 240px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Bank name</div>
                      <input
                        value={bankName}
                        onChange={e => setBankName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                    <label style={{ flex: "1 1 240px" }}>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Bank address</div>
                      <input
                        value={bankAddress}
                        onChange={e => setBankAddress(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>HIPAA / private notes</div>
                      <textarea
                        value={hipaaNotes}
                        onChange={e => setHipaaNotes(e.target.value)}
                        rows={4}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d1d5db",
                          fontSize: 13,
                          resize: "vertical",
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>

          {message && <div style={{ fontSize: 12, color: "#16a34a" }}>{message}</div>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              marginTop: 4,
              padding: "10px 12px",
              borderRadius: 6,
              border: "none",
              background: saving ? "#e5e7eb" : "#2563eb",
              color: saving ? "#4b5563" : "#f9fafb",
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
              width: 180,
            }}
          >
            {saving ? "Saving…" : "Save portfolio"}
          </button>

          <section style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <h3 style={{ fontSize: 15, margin: 0 }}>About your Nexis profile</h3>
              <div
                style={{
                  display: "inline-flex",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "none",
                    backgroundColor: lang === "en" ? "#0f172a" : "#ffffff",
                    color: lang === "en" ? "#f9fafb" : "#4b5563",
                    cursor: "pointer",
                  }}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("es")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "none",
                    borderLeft: "1px solid #e5e7eb",
                    backgroundColor: lang === "es" ? "#0f172a" : "#ffffff",
                    color: lang === "es" ? "#f9fafb" : "#4b5563",
                    cursor: "pointer",
                  }}
                >
                  ES
                </button>
              </div>
            </div>

            {lang === "en" ? <PortfolioEn /> : <PortfolioEs />}
          </section>
        </div>
      )}
    </PageCard>
  );
}

function PortfolioEn() {
  return (
    <div style={{ fontSize: 13, color: "#333" }}>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />
      <h2
        style={{
          margin: "8px 0 6px",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Welcome to Your Nexus Contractor Connect Capability Portfolio
        </span>
      </h2>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        Join the Marketplace &amp; Try NCC Enterprise Application for Your Business:
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Advanced Estimating + Full Project Infrastructure
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Financials (estimating and billing), daily project management (task and personnel alignment), Asset
        management, learning and reference documentaiton, certifications and more
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>Nexus Contractor Connect</span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Our network is <strong>always looking</strong> for capable individuals, sole proprietors, specialty
        subcontractors, and organizations of any size to join our high-demand contractor marketplace. General
        Contractors, Project Managers, and project owners are actively searching for skilled professionals and
        reliable teams to deliver projects every day.
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Registering your Capability Portfolio gets you Discovered
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        For contractors who want real business tools, thjis portfolio registration unlocks the
        <strong> Nexus Contractor Connect (NCC) App</strong> as your all-in-one operating system.
      </p>
      <p style={{ margin: "4px 0" }}>
        Start testing it immediately, especially our <strong>estimating engine</strong> &mdash; designed to scale
        from simple, fast bids to fully integrated, robust estimates that flow directly into your project
        timeline, schedules, and accounting (down to the room level if desired).
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>For Individuals, Sole Proprietors &amp; Tradespeople:</strong> Create your
          <strong> free professional portfolio</strong> &mdash; upload your resume, showcase your skills,
          certifications, experience, and assets (tools, equipment, vehicles, availability). Get found by GCs
          and PMs for direct hires or subcontracting opportunities. <strong>Plus:</strong> As a registered
          contractor, instantly <strong>test the NCC App</strong> for your own jobs &mdash; start with simple,
          quick estimates to price your work, then grow into more detailed takeoffs. See how your estimates
          automatically feed into project schedules, daily logs, and basic accounting &mdash; all in one place.
          Perfect for sole proprietors who want professional tools without complexity.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>For Companies, Subcontractors, Specialty Firms &amp; Larger Organizations:</strong> Showcase
          your full capabilities &mdash; crew sizes, equipment fleet, offices, service areas, bonding capacity,
          and availability. Advertise in the marketplace while discovering top talent. <strong>Best
          part:</strong> Upon registration, activate your own <strong>custom tenant</strong> and immediately start
          using the NCC App as your central business platform, featuring: &bull; <strong>Estimating</strong>
          &mdash; from basic line-item bids to advanced, integrated estimates (room-by-room detail, assemblies,
          labor/material breakdowns) &bull; Estimates that <strong>automatically flow</strong> into project
          timelines, Gantt-style schedules, resource allocation, and project accounting &bull; Daily logs,
          role-based project management, automated workflows, tagging, reports, invoicing prep &bull;
          <strong>Asset tracking</strong> for people, equipment, offices, vehicles, and more Test everything
          risk-free: run a real estimate, watch it populate your schedule and books, and see how it saves time
          and reduces errors &mdash; from first-time users to large-scale operations.
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Why Contractors Are Excited to Try NCC Estimating &amp; Operations:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          Go from a simple bid to a fully connected and integrated project plan &mdash; estimates update
          schedules, trigger workflows, and feed accounting in real time
        </li>
        <li style={{ marginBottom: 4 }}>
          Room-level granularity when you need it (e.g., per-floor, per-space breakdowns for finish work, MEP
          coordination, etc.)
        </li>
        <li style={{ marginBottom: 4 }}>
          Sole proprietors get lightweight, powerful estimating without expensive software
        </li>
        <li style={{ marginBottom: 4 }}>
          Larger firms get scalable, multi-user tools with audit-ready data flow
        </li>
        <li style={{ marginBottom: 4 }}>
          The marketplace keeps bringing you opportunities while &mdash; GCs want contractors who can estimate
          accurately and execute efficiently
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Come and Joint the Nexus Contractor Connect network:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        The Nexus Contractor Connect network is ready for you &mdash; and the NCC App is ready to transform how
        you estimate and run projects.
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Individuals &amp; Sole Proprietors:</strong> Build your free portfolio and start testing
          simple-to-advanced estimating today.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>Companies &amp; Larger Contractors:</strong> Register your capabilities, activate your tenant,
          and run a full estimate-to-schedule workflow right now.
        </li>
      </ul>
    </div>
  );
}

function PortfolioEs() {
  return (
    <div style={{ fontSize: 13, color: "#333" }}>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />
      <h2
        style={{
          margin: "8px 0 6px",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Bienvenido a Tu Portafolio de Capacidades de Nexus Contractor Connect
        </span>
      </h2>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        &Uacute;nete al Mercado y Prueba la Aplicaci&oacute;n Empresarial NCC para Tu Negocio:
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Estimaci&oacute;n Avanzada + Infraestructura Completa de Proyectos
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        Finanzas (estimaci&oacute;n y facturaci&oacute;n), gesti&oacute;n diaria de proyectos
        (alineaci&oacute;n de tareas y personal), administraci&oacute;n de activos, documentaci&oacute;n de
        aprendizaje y referencia, certificaciones y m&aacute;s
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>Nexus Contractor Connect</span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Nuestra red <strong>siempre est&aacute; buscando</strong> individuos capaces, propietarios
        &uacute;nicos, subcontratistas especializados y organizaciones de cualquier tama&ntilde;o para unirse a
        nuestro mercado de contratistas de alta demanda. Los Contratistas Generales, Gerentes de Proyecto y
        due&ntilde;os de proyectos est&aacute;n activamente buscando profesionales calificados y equipos confiables
        como t&uacute; para entregar proyectos todos los d&iacute;as.
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Registrar tu Portafolio de Capacidades te hace ser Descubierto
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Para los contratistas que quieren herramientas reales de negocio, este registro de portafolio desbloquea
        la <strong>Aplicaci&oacute;n Nexus Contractor Connect (NCC)</strong> como tu sistema operativo
        todo-en-uno.
      </p>
      <p style={{ margin: "4px 0" }}>
        Empieza a probarla de inmediato, especialmente nuestro <strong>motor de estimaci&oacute;n</strong>
        &mdash; dise&ntilde;ado para escalar desde ofertas r&aacute;pidas y simples hasta estimaciones robustas e
        integradas que fluyen directamente a tu cronograma de proyecto, programaci&oacute;n y contabilidad (hasta
        el nivel de habitaci&oacute;n si lo deseas).
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Para Individuos, Propietarios &Uacute;nicos y Oficios:</strong> Crea tu
          <strong> portafolio profesional gratuito</strong> &mdash; sube tu curr&iacute;culum, destaca tus
          habilidades, certificaciones, experiencia y activos (herramientas, equipo, veh&iacute;culos,
          disponibilidad). S&eacute; encontrado por CGs y Gerentes de Proyecto para contrataciones directas o
          subcontrataciones. <strong> Adem&aacute;s:</strong> Como contratista registrado, prueba al instante la
          <strong>App NCC</strong> para tus propios trabajos &mdash; comienza con estimaciones simples y r&aacute;pidas
          para cotizar tu trabajo, y crece hacia desgloses m&aacute;s detallados. Observa c&oacute;mo tus estimaciones
          se alimentan autom&aacute;ticamente a cronogramas, bit&aacute;coras diarias y contabilidad b&aacute;sica
          &mdash; todo en un solo lugar. Ideal para propietarios &uacute;nicos que quieren herramientas
          profesionales sin complicaciones.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>Para Empresas, Subcontratistas, Firmas Especializadas y Organizaciones M&aacute;s Grandes:</strong>
          Muestra todas tus capacidades &mdash; tama&ntilde;o de cuadrillas, flota de equipo, oficinas, &aacute;reas de
          servicio, capacidad de fianza y disponibilidad. Public&iacute;tate en el mercado mientras descubres
          talento de primer nivel. <strong>Lo mejor:</strong> Al registrarte, activa tu propio
          <strong> tenant personalizado</strong> e inicia de inmediato el uso de la App NCC como la plataforma
          central de tu negocio, con:
          <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
            <li style={{ marginBottom: 4 }}>
              <strong>Estimaci&oacute;n</strong> &mdash; desde ofertas b&aacute;sicas por rengl&oacute;n hasta
              estimaciones avanzadas e integradas (detalle habitaci&oacute;n por habitaci&oacute;n, ensambles,
              desglose de mano de obra/materiales)
            </li>
            <li style={{ marginBottom: 4 }}>
              Estimaciones que <strong>fluyen autom&aacute;ticamente</strong> a cronogramas del proyecto,
              programaci&oacute;n estilo Gantt, asignaci&oacute;n de recursos y contabilidad de proyecto
            </li>
            <li style={{ marginBottom: 4 }}>
              Bit&aacute;coras diarias, gesti&oacute;n de proyectos basada en roles, flujos de trabajo
              automatizados, etiquetado, reportes, preparaci&oacute;n de facturaci&oacute;n
            </li>
            <li style={{ marginBottom: 4 }}>
              <strong>Seguimiento de activos</strong> para personas, equipo, oficinas, veh&iacute;culos y m&aacute;s
            </li>
          </ul>
          Prueba todo sin riesgo: realiza una estimaci&oacute;n real, observa c&oacute;mo se llena tu cronograma y
          libros contables, y descubre c&oacute;mo ahorra tiempo y reduce errores &mdash; desde usuarios nuevos hasta
          operaciones a gran escala.
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Por Qu&eacute; los Contratistas Est&aacute;n Entusiasmados de Probar la Estimaci&oacute;n y Operaciones de
          NCC:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          Pasa de una oferta simple a un plan de proyecto completamente conectado e integrado &mdash; las
          estimaciones actualizan cronogramas, activan flujos de trabajo y alimentan la contabilidad en tiempo
          real
        </li>
        <li style={{ marginBottom: 4 }}>
          Nivel de detalle por habitaci&oacute;n cuando lo necesites (ej. desgloses por piso o espacio para
          acabados, coordinaci&oacute;n MEP, etc.)
        </li>
        <li style={{ marginBottom: 4 }}>
          Propietarios &uacute;nicos obtienen estimaci&oacute;n ligera y poderosa sin software caro
        </li>
        <li style={{ marginBottom: 4 }}>
          Empresas grandes obtienen herramientas escalables multiusuario con flujo de datos auditable
        </li>
        <li style={{ marginBottom: 4 }}>
          El mercado sigue tray&eacute;ndote oportunidades &mdash; los CGs quieren contratistas que estimen con
          precisi&oacute;n y ejecuten eficientemente
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <strong>
          <span style={{ color: "#000080" }}>
            &iexcl;Ven y &Uacute;nete a la Red Nexus Contractor Connect!
          </span>
        </strong>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        La red Nexus Contractor Connect est&aacute; lista para ti &mdash; y la App NCC est&aacute; lista para
        transformar c&oacute;mo estimas y diriges tus proyectos.
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Individuos y Propietarios &Uacute;nicos:</strong> Crea tu portafolio gratuito y empieza a
          probar estimaciones de simple a avanzadas hoy mismo.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>Empresas y Contratistas Grandes:</strong> Registra tus capacidades, activa tu tenant y
          ejecuta un flujo completo de estimaci&oacute;n a cronograma ahora mismo.
        </li>
      </ul>
    </div>
  );
}
