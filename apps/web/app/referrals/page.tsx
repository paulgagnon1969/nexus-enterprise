"use client";

import { useEffect, useMemo, useState } from "react";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ReferralSummary {
  totals: {
    totalInvited: number;
    totalConfirmedByReferee: number;
    totalRejectedByReferee: number;
    totalWithEarnings: number;
  };
  earnings: {
    totalEarnedCents: number;
    trailing30DaysEarnedCents: number;
    currency: string;
  };
  perReferee: Array<{
    refereeUserId: string | null;
    refereeEmail: string | null;
    totalEarnedCents: number;
    lastEarnedAt: string | null;
  }>;
}

interface ReferralRow {
  id: string;
  prospectName: string | null;
  prospectEmail: string | null;
  prospectPhone: string | null;
  status: string;
  referralConfirmedByReferee: boolean;
  referralRejectedByReferee: boolean;
  createdAt: string;
}

export default function ReferralsPage() {
  const [recruitEmail, setRecruitEmail] = useState("");
  const [recruitPhone, setRecruitPhone] = useState("");
  const [recruitMessage, setRecruitMessage] = useState(
    "I'd like to invite you to register your contractor portfolio with Nexus Contractor Connect.",
  );
  const [recruitApplyUrl, setRecruitApplyUrl] = useState<string | null>(null);
  const [recruitStatus, setRecruitStatus] = useState<string | null>(null);
  const [recruitLoading, setRecruitLoading] = useState(false);

  // Referral bank summary
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // "Your referrals" dashboard state
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) return;

    async function load() {
      try {
        setRowsLoading(true);
        setRowsError(null);
        const res = await fetch(`${API_BASE}/referrals/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load referrals (${res.status})`);
        }
        const json = await res.json();
        setRows(json as ReferralRow[]);
      } catch (e: any) {
        setRowsError(e?.message ?? "Failed to load referrals.");
      } finally {
        setRowsLoading(false);
      }
    }

    async function loadSummary() {
      try {
        setSummaryLoading(true);
        setSummaryError(null);
        const res = await fetch(`${API_BASE}/referrals/me/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load referral summary (${res.status})`);
        }
        const json = await res.json();
        setSummary(json as ReferralSummary);
      } catch (e: any) {
        setSummaryError(e?.message ?? "Failed to load referral summary.");
      } finally {
        setSummaryLoading(false);
      }
    }

    void load();
    void loadSummary();
  }, []);

  const totalInvited = useMemo(
    () => rows.filter(r => r.status === "INVITED").length,
    [rows],
  );

  const buildRecruitMessage = () => {
    const base =
      recruitMessage.trim() !== ""
        ? recruitMessage.trim()
        : "I'd like to invite you to register your contractor portfolio with Nexus Contractor Connect.";
    if (recruitApplyUrl) {
      return `${base}\n\nStart here: ${recruitApplyUrl}`;
    }
    return base;
  };

  const handleCreateTrackedReferral = async () => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setRecruitStatus("Missing access token; please log in again.");
      return;
    }

    try {
      setRecruitLoading(true);
      setRecruitStatus(null);

      const payload: any = {
        prospectName: recruitEmail?.trim() || undefined,
        prospectEmail: recruitEmail?.trim() || undefined,
        prospectPhone: recruitPhone?.trim() || undefined,
      };

      const res = await fetch(`${API_BASE}/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Referral create failed (${res.status}) ${text}`);
      }

      const json: any = await res.json();
      const tokenValue: string | undefined = json?.referral?.token ?? json?.token;
      let applyPath: string | undefined = json?.applyPath;

      if (!applyPath && tokenValue) {
        applyPath = `/apply?referralToken=${encodeURIComponent(tokenValue)}`;
      }

      if (applyPath && typeof window !== "undefined") {
        const origin = window.location.origin;
        const fullUrl = `${origin}${applyPath}`;
        setRecruitApplyUrl(fullUrl);
        setRecruitStatus("Tracked referral link created.");
      } else {
        setRecruitStatus("Referral created, but no invite link was returned.");
      }
    } catch (e: any) {
      setRecruitStatus(e?.message ?? "Failed to create referral.");
    } finally {
      setRecruitLoading(false);
    }
  };

  const handleCopyRecruitLink = async () => {
    if (typeof navigator === "undefined" || !recruitApplyUrl) {
      setRecruitStatus("Copy is not available in this browser; you can still share the link manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(recruitApplyUrl);
      setRecruitStatus("Invite link copied.");
      setTimeout(() => setRecruitStatus(null), 3000);
    } catch {
      setRecruitStatus("Could not copy link; you can still share it manually.");
    }
  };

  const handleEmailRecruit = () => {
    if (typeof window === "undefined") return;
    const body = encodeURIComponent(buildRecruitMessage());
    const subject = encodeURIComponent("Nexus Contractor Connect invitation");
    const to = recruitEmail.trim();
    const href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
    window.location.href = href;
  };

  const handleSmsRecruit = () => {
    if (typeof window === "undefined") return;
    const body = encodeURIComponent(buildRecruitMessage());
    const to = recruitPhone.trim();
    const href = `sms:${encodeURIComponent(to)}?&body=${body}`;
    window.location.href = href;
  };

  const totalInvitedFromSummary = summary?.totals.totalInvited ?? rows.length;
  const totalApplied = useMemo(
    () => rows.filter(r => r.status === "APPLIED" || r.status === "HIRED").length,
    [rows],
  );

  const totalEarnedDollars = (summary?.earnings.totalEarnedCents ?? 0) / 100;
  const trailing30EarnedDollars = (summary?.earnings.trailing30DaysEarnedCents ?? 0) / 100;

  return (
    <PageCard>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Refer a Friend</h1>

      {/* Promo/education card for the referral program */}
      <div
        style={{
          marginTop: 8,
          marginBottom: 16,
          maxWidth: 720,
          borderRadius: 16,
          padding: 16,
          backgroundColor: "#ffffff",
          boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🌟 Nexus Connect Referral Program 🌟</h2>
          <p style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>
            Turn great connections into real rewards.
          </p>
        </div>

        <p style={{ fontSize: 14, color: "#111827", marginBottom: 8 }}>
          Invite talented people to join Nexus Connect and earn <strong>1% of every pay period they get paid</strong>
          — automatically.
        </p>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10, marginBottom: 6 }}>
          How it works – straightforward &amp; automatic:
        </h3>
        <ol style={{ paddingLeft: 18, fontSize: 13, color: "#111827" }}>
          <li style={{ marginBottom: 6 }}>
            <strong>Share your unique referral link</strong> with skilled subcontractors, foremen, PMs, or anyone who’d
            be a perfect fit.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Your referral accepts you</strong> as their referrer during signup (they’ll see and confirm your
            name/link — one easy step).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Once they start getting paid</strong> through Nexus Connect payroll:
            <br />→ For <strong>every pay period</strong> they receive payment, you automatically earn
            <strong> 1% of their gross pay</strong> for that period.
            <br />→ Bonuses are calculated and deposited directly to the bank account on your profile — no forms, no
            delays.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Unlimited referrals</strong> — there’s no cap. The more qualified people you bring in, the more you
            earn over time.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Open to everyone</strong> — you <strong>don’t</strong> need to be a current employee or active user
            to participate and receive bonuses.
          </li>
          <li style={{ marginBottom: 0 }}>
            <strong>12-month program window</strong> — bonuses apply to pay periods within the first
            <strong> 12 months</strong> after your referral is accepted.
          </li>
        </ol>

        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>
          Your personal Referral Dashboard
        </h3>
        <ul style={{ paddingLeft: 18, fontSize: 13, color: "#111827", marginTop: 0 }}>
          <li>List of all your referrals + current status</li>
          <li>Accepted, started, and paid referral details</li>
          <li>Bonus earned per person per pay period</li>
          <li>Running total per referral + your grand cumulative referral earnings</li>
        </ul>
      </div>

      <section
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          maxWidth: 720,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Recruit email (optional)</div>
            <input
              value={recruitEmail}
              onChange={e => setRecruitEmail(e.target.value)}
              placeholder="friend@example.com"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Recruit mobile (optional)</div>
            <input
              value={recruitPhone}
              onChange={e => setRecruitPhone(e.target.value)}
              placeholder="(555) 555-5555"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </label>

          <label>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Personal message</div>
            <textarea
              value={recruitMessage}
              onChange={e => setRecruitMessage(e.target.value)}
              rows={3}
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

        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleCreateTrackedReferral}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: recruitLoading ? "#e5e7eb" : "#0f172a",
              color: recruitLoading ? "#4b5563" : "#f9fafb",
              fontSize: 12,
              cursor: recruitLoading ? "default" : "pointer",
            }}
            disabled={recruitLoading}
          >
            {recruitLoading ? "Creating referral…" : "Create tracked referral"}
          </button>
          <button
            type="button"
            onClick={handleCopyRecruitLink}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#f9fafb",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Copy invite link
          </button>
          <button
            type="button"
            onClick={handleEmailRecruit}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "var(--color-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open email draft
          </button>
          <button
            type="button"
            onClick={handleSmsRecruit}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "var(--color-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open text message
          </button>
        </div>

        {recruitApplyUrl && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-muted)" }}>
            Invite link:&nbsp;
            <code style={{ wordBreak: "break-all" }}>{recruitApplyUrl}</code>
          </div>
        )}

        {recruitStatus && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>{recruitStatus}</div>
        )}
      </section>

      {/* Referral bank summary */}
      <section style={{ marginTop: 6, marginBottom: 10 }}>
        {summaryLoading && (
          <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading referral bank…</p>
        )}
        {summaryError && !summaryLoading && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{summaryError}</p>
        )}
        {summary && !summaryLoading && !summaryError && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              maxWidth: 720,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Total earned</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ${totalEarnedDollars.toFixed(2)} {summary.earnings.currency}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Last 30 days</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                ${trailing30EarnedDollars.toFixed(2)} {summary.earnings.currency}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.02 }}>Total invited</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{totalInvitedFromSummary}</div>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Your referrals</h2>
        {rowsLoading && (
          <p style={{ fontSize: 13, color: "var(--color-muted)" }}>Loading your referrals…</p>
        )}
        {rowsError && !rowsLoading && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{rowsError}</p>
        )}

        {!rowsLoading && !rowsError && (
          <>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 8 }}>
              <span style={{ marginRight: 12 }}>
                Total invited: <strong>{rows.length}</strong>
              </span>
              <span>
                Referred who applied/are hired: <strong>{totalApplied}</strong>
              </span>
            </div>

            {rows.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
                You haven&apos;t referred anyone yet. Use the form above to send your first invite.
              </p>
            ) : (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                  maxWidth: 900,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Prospect
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Contact
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          background: "#f9fafb",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const bg = idx % 2 === 0 ? "#ffffff" : "#fcfcfd";
                      let statusLabel = r.status;
                      let statusColor = "#6b7280";
                      if (r.status === "APPLIED" || r.status === "HIRED") {
                        statusLabel = r.status === "HIRED" ? "Hired" : "Applied";
                        statusColor = "#16a34a";
                      } else if (r.referralRejectedByReferee) {
                        statusLabel = "Referee rejected";
                        statusColor = "#b91c1c";
                      } else if (r.referralConfirmedByReferee) {
                        statusLabel = "Confirmed by referee";
                        statusColor = "#2563eb";
                      } else if (r.status === "INVITED") {
                        statusLabel = "Invited";
                      }

                      const created = new Date(r.createdAt);
                      const createdLabel = created.toLocaleDateString();

                      return (
                        <tr key={r.id} style={{ background: bg }}>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                            {r.prospectName || r.prospectEmail || "(No name)"}
                          </td>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb" }}>
                            <div>
                              {r.prospectEmail && (
                                <a
                                  href={`mailto:${r.prospectEmail}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {r.prospectEmail}
                                </a>
                              )}
                            </div>
                            {r.prospectPhone && (
                              <div style={{ fontSize: 12 }}>
                                <a
                                  href={`tel:${r.prospectPhone.replace(/[^\\d+]/g, "")}`}
                                  style={{ color: "#6b7280", textDecoration: "none" }}
                                >
                                  {r.prospectPhone}
                                </a>
                              </div>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "6px 10px",
                              borderTop: "1px solid #e5e7eb",
                              color: statusColor,
                              fontWeight: 500,
                            }}
                          >
                            {statusLabel}
                          </td>
                          <td style={{ padding: "6px 10px", borderTop: "1px solid #e5e7eb", fontSize: 12 }}>
                            {createdLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </PageCard>
  );
}
