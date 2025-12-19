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

const DEFAULT_PROFILE_PHOTO_SRC = "/pg-pic-20250410-2.jpg";

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
            src={DEFAULT_PROFILE_PHOTO_SRC}
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
            Signed in as <strong style={{ color: "var(--color-text)" }}>{me?.email}</strong>
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
        </div>
      )}
    </PageCard>
  );
}
