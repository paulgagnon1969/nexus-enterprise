"use client";

import { useEffect, useState } from "react";
import { PageCard } from "../../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const TABS = [
  "Prospects",
  "Referrals",
  "Recruitment",
  "Onboarding",
  "Payroll & Incentives",
  "Learning",
  "Policies & Procedures",
] as const;

type TabKey = (typeof TABS)[number];

interface NexNetCandidateRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  createdAt?: string | null;
  referrerEmail?: string | null;

  // Optional assignment metadata from the API: which tenants already
  // "own" this candidate as a worker. The current UI does not depend on
  // these fields but they are available for future tabs/filters.
  assignedTenantCount?: number;
  assignedTenants?: {
    companyId: string;
    companyName: string;
    companyRole: string | null;
    interestStatus: string;
    isCurrentTenant: boolean;
  }[];
}

interface ReferralRow {
  id: string;
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  status?: string | null;
  createdAt?: string | null;
  referrerEmail?: string | null;
  referralConfirmedByReferee?: boolean;
  referralRejectedByReferee?: boolean;
}

interface GamingAlertRow {
  referrerId: string;
  referrerEmail?: string | null;
  referrerName?: string | null;
  totalReferrals: number;
  rejectedByReferee: number;
  confirmedByReferee: number;
  pending: number;
  rejectionRate: number;
  lastReferralAt?: string | null;
  lastRejectedAt?: string | null;
}

export default function NexNetSystemPage() {
  const [tab, setTab] = useState<TabKey>("Prospects");
  const [prospects, setProspects] = useState<NexNetCandidateRow[] | null>(null);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsError, setProspectsError] = useState<string | null>(null);

  const [referrals, setReferrals] = useState<ReferralRow[] | null>(null);
  const [referralsBase, setReferralsBase] = useState<ReferralRow[] | null>(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [referralsError, setReferralsError] = useState<string | null>(null);

  const [gamingAlerts, setGamingAlerts] = useState<GamingAlertRow[] | null>(null);
  const [gamingLoading, setGamingLoading] = useState(false);
  const [gamingError, setGamingError] = useState<string | null>(null);
  const [showOnlySuspicious, setShowOnlySuspicious] = useState(false);
  const [activeReferrerFilter, setActiveReferrerFilter] = useState<string | null>(null);

  // Load prospects when Prospects tab is active
  useEffect(() => {
    if (tab !== "Prospects") return;
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setProspectsError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setProspectsLoading(true);
        setProspectsError(null);
        const res = await fetch(`${API_BASE}/referrals/system/candidates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load prospects (${res.status})`);
        }
        const json: any[] = await res.json();
        if (cancelled) return;
        const mapped: NexNetCandidateRow[] = (json || []).map((c: any) => {
          const latestReferral = (c.referralsAsReferee || [])[0];
          return {
            id: c.id,
            firstName: c.firstName ?? null,
            lastName: c.lastName ?? null,
            email: c.email ?? c.user?.email ?? null,
            phone: c.phone ?? null,
            source: c.source ?? null,
            status: c.status ?? null,
            createdAt: c.createdAt ?? null,
            referrerEmail: latestReferral?.referrer?.email ?? null,
          };
        });
        setProspects(mapped);
      } catch (e: any) {
        if (!cancelled) {
          setProspectsError(e?.message ?? "Failed to load prospects.");
        }
      } finally {
        if (!cancelled) {
          setProspectsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Load referrals when Referrals tab is active
  useEffect(() => {
    if (tab !== "Referrals") return;
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setReferralsError("Missing access token; please log in again.");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setReferralsLoading(true);
        setReferralsError(null);
        setGamingLoading(true);
        setGamingError(null);

        const [referralsRes, gamingRes] = await Promise.all([
          fetch(`${API_BASE}/referrals/system`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/referrals/system/gaming-alerts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!referralsRes.ok) {
          throw new Error(`Failed to load referrals (${referralsRes.status})`);
        }
        if (!gamingRes.ok) {
          throw new Error(`Failed to load gaming alerts (${gamingRes.status})`);
        }

        const referralsJson: any[] = await referralsRes.json();
        const gamingJson: any[] = await gamingRes.json();
        if (cancelled) return;

        const mapped: ReferralRow[] = (referralsJson || []).map((r: any) => ({
          id: r.id,
          prospectName: r.prospectName ?? null,
          prospectEmail: r.prospectEmail ?? null,
          prospectPhone: r.prospectPhone ?? null,
          status: r.status ?? null,
          createdAt: r.createdAt ?? null,
          referrerEmail: r.referrer?.email ?? null,
          referralConfirmedByReferee: !!r.referralConfirmedByReferee,
          referralRejectedByReferee: !!r.referralRejectedByReferee,
        }));
        setReferrals(mapped);
        setReferralsBase(mapped);
        setActiveReferrerFilter(null);

        const mappedGaming: GamingAlertRow[] = (gamingJson || []).map((g: any) => ({
          referrerId: g.referrerId,
          referrerEmail: g.referrerEmail ?? null,
          referrerName: g.referrerName ?? null,
          totalReferrals: g.totalReferrals ?? 0,
          rejectedByReferee: g.rejectedByReferee ?? 0,
          confirmedByReferee: g.confirmedByReferee ?? 0,
          pending: g.pending ?? 0,
          rejectionRate: g.rejectionRate ?? 0,
          lastReferralAt: g.lastReferralAt ?? null,
          lastRejectedAt: g.lastRejectedAt ?? null,
        }));
        setGamingAlerts(mappedGaming);
      } catch (e: any) {
        if (!cancelled) {
          setReferralsError(e?.message ?? "Failed to load referrals.");
          setGamingError(e?.message ?? "Failed to load gaming alerts.");
        }
      } finally {
        if (!cancelled) {
          setReferralsLoading(false);
          setGamingLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <PageCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header>
          <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 18 }}>Nex-Net — Nexus Contractor Network</h2>
          <p style={{ marginTop: 0, fontSize: 13, color: "#6b7280" }}>
            System-wide talent network for Nexus Contractor Connect: prospects, referrals, onboarding, incentives,
            and learning. This workspace is visible only to Nexus System roles.
          </p>
        </header>

        {/* Tab strip */}
        <nav
          aria-label="Nex-Net sections"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 4,
          }}
        >
          {TABS.map(label => {
            const active = tab === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setTab(label)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: active ? "1px solid #0f172a" : "1px solid #e5e7eb",
                  backgroundColor: active ? "#0f172a" : "#ffffff",
                  color: active ? "#f9fafb" : "#111827",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <section
          style={{
            marginTop: 4,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            fontSize: 13,
            minHeight: 260,
          }}
        >
          {tab === "Prospects" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Prospects (Nex-Net pool)</h3>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
                This view lists Nex-Net candidates, including referral pre-profiles. Data currently focuses on basic
                contact info, source, status, and primary referrer.
              </p>
              {prospectsLoading && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>Loading prospects…</p>
              )}
              {prospectsError && !prospectsLoading && (
                <p style={{ fontSize: 12, color: "#b91c1c" }}>{prospectsError}</p>
              )}
              {!prospectsLoading && !prospectsError && (!prospects || prospects.length === 0) && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>No prospects found yet.</p>
              )}
              {!prospectsLoading && !prospectsError && prospects && prospects.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Name
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Email
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Phone
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Source
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Status
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Referrer
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospects.map(p => {
                        const name = (p.firstName || p.lastName)
                          ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()
                          : "—";
                        return (
                          <tr key={p.id}>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>{name}</td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {p.email ? (
                                <a
                                  href={`mailto:${p.email}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {p.email}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {p.phone ? (
                                <a
                                  href={`tel:${p.phone.replace(/[^\\d+]/g, "")}`}
                                  style={{ color: "#6b7280", textDecoration: "none" }}
                                >
                                  {p.phone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {p.source || "—"}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {p.status || "—"}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {p.referrerEmail ? (
                                <a
                                  href={`mailto:${p.referrerEmail}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {p.referrerEmail}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "Referrals" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Referrals</h3>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
                This view tracks which Nex-Net referrers have invited which prospects and the current referral status.
              </p>
              {referralsLoading && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>Loading referrals…</p>
              )}
              {referralsError && !referralsLoading && (
                <p style={{ fontSize: 12, color: "#b91c1c" }}>{referralsError}</p>
              )}
              {!referralsLoading && !referralsError && (!referrals || referrals.length === 0) && (
                <p style={{ fontSize: 12, color: "#6b7280" }}>No referrals found yet.</p>
              )}
              {!referralsLoading && !referralsError && referrals && referrals.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Prospect
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Email
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Phone
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Status
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Referrer
                        </th>
                        <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                          Referee decision
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map(r => {
                        const name = r.prospectName || "—";
                        const decisionLabel = r.referralRejectedByReferee
                          ? "Rejected by referee"
                          : r.referralConfirmedByReferee
                          ? "Confirmed by referee"
                          : "Pending";
                        const decisionColor = r.referralRejectedByReferee
                          ? "#b91c1c"
                          : r.referralConfirmedByReferee
                          ? "#16a34a"
                          : "#6b7280";
                        return (
                          <tr key={r.id}>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>{name}</td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {r.prospectEmail ? (
                                <a
                                  href={`mailto:${r.prospectEmail}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {r.prospectEmail}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {r.prospectPhone ? (
                                <a
                                  href={`tel:${r.prospectPhone.replace(/[^\\d+]/g, "")}`}
                                  style={{ color: "#6b7280", textDecoration: "none" }}
                                >
                                  {r.prospectPhone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {r.status || "—"}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                              {r.referrerEmail ? (
                                <a
                                  href={`mailto:${r.referrerEmail}`}
                                  style={{ color: "#2563eb", textDecoration: "none" }}
                                >
                                  {r.referrerEmail}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6", color: decisionColor }}>
                              {decisionLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Gaming Alerts sub-panel */}
              <section
                style={{
                  marginTop: 16,
                  paddingTop: 10,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: 4, fontSize: 14 }}>Gaming alerts (by referrer)</h4>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  Aggregated view of how often each referrer has been rejected by referees. High rejection counts or
                  rates may indicate gaming behavior.
                </p>
                {activeReferrerFilter && (
                  <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 4 }}>
                    Referrals table filtered by referrer: <strong>{activeReferrerFilter}</strong>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      color: "#4b5563",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showOnlySuspicious}
                      onChange={e => setShowOnlySuspicious(e.target.checked)}
                      style={{ margin: 0 }}
                    />
                    <span>Show only suspicious referrers (≥3 rejections and ≥50% rejection rate)</span>
                  </label>
                  {activeReferrerFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setReferrals(referralsBase);
                        setActiveReferrerFilter(null);
                      }}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        backgroundColor: "#ffffff",
                        fontSize: 11,
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      Reset referrer filter
                    </button>
                  )}
                </div>
                {gamingLoading && (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>Loading gaming alerts…</p>
                )}
                {gamingError && !gamingLoading && (
                  <p style={{ fontSize: 12, color: "#b91c1c" }}>{gamingError}</p>
                )}
                {!gamingLoading && !gamingError && (!gamingAlerts || gamingAlerts.length === 0) && (
                  <p style={{ fontSize: 12, color: "#6b7280" }}>No referrer activity yet.</p>
                )}
                {!gamingLoading && !gamingError && gamingAlerts && gamingAlerts.length > 0 && (
                  <div style={{ overflowX: "auto", marginTop: 4 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 12,
                      }}
                    >
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Referrer
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Total
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Rejected
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Confirmed
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Pending
                          </th>
                          <th style={{ textAlign: "right", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Rejection rate
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #e5e7eb" }}>
                            Last rejected
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {gamingAlerts
                          .filter(alert => {
                            const highlight = alert.rejectedByReferee >= 3 && alert.rejectionRate >= 0.5;
                            return showOnlySuspicious ? highlight : true;
                          })
                          .map(alert => {
                            const name = alert.referrerName || alert.referrerEmail || alert.referrerId;
                          const ratePct = `${Math.round((alert.rejectionRate || 0) * 100)}%`;
                          const highlight = alert.rejectedByReferee >= 3 && alert.rejectionRate >= 0.5;
                          return (
                            <tr
                              key={alert.referrerId}
                              style={{ backgroundColor: highlight ? "#fef2f2" : "transparent", cursor: "pointer" }}
                              title="Click to filter referrals table by this referrer"
                              onClick={() => {
                                // Simple drill-down: filter main referrals list by this referrer email if present
                                if (!alert.referrerEmail) return;
                                const email = alert.referrerEmail;
                                setReferrals(prev =>
                                  prev && referralsBase
                                    ? referralsBase.filter(r => r.referrerEmail === email)
                                    : prev,
                                );
                                setActiveReferrerFilter(email);
                              }}
                            >
                              <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>{name}</td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                }}
                              >
                                {alert.totalReferrals}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                  color: alert.rejectedByReferee > 0 ? "#b91c1c" : undefined,
                                }}
                              >
                                {alert.rejectedByReferee}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                  color: alert.confirmedByReferee > 0 ? "#16a34a" : undefined,
                                }}
                              >
                                {alert.confirmedByReferee}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                }}
                              >
                                {alert.pending}
                              </td>
                              <td
                                style={{
                                  padding: "4px 6px",
                                  borderBottom: "1px solid #f3f4f6",
                                  textAlign: "right",
                                  color: alert.rejectionRate >= 0.5 ? "#b91c1c" : "#6b7280",
                                }}
                              >
                                {ratePct}
                              </td>
                              <td style={{ padding: "4px 6px", borderBottom: "1px solid #f3f4f6" }}>
                                {alert.lastRejectedAt
                                  ? new Date(alert.lastRejectedAt).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "Recruitment" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Recruitment</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This view will summarize recruitment channels (QR codes, landing pages, agencies, events) and how
                many Nex-Net prospects and hires each channel produces.
              </p>
            </div>
          )}

          {tab === "Onboarding" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Onboarding</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This view will provide a system-wide dashboard over all Nexis onboarding sessions (from /apply),
                including profile completion checklists, documents, and skills. Managers will be able to see
                incomplete profiles and nudge candidates as needed.
              </p>
            </div>
          )}

          {tab === "Payroll & Incentives" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Payroll & Incentives</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This view will connect confirmed referrals to downstream payroll logic, enforcing the Nex-Net
                incentive rules (for example, 1% of pay to the referrer for 12 months after the referee starts
                work).
              </p>
            </div>
          )}

          {tab === "Learning" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Learning</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This view will surface learning modules, certifications, and recommended training for Nex-Net
                candidates, helping Nexus System manage readiness across the pool.
              </p>
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  display: "inline-flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>Certification templates (System)</div>
                <div style={{ color: "#6b7280" }}>
                  Use the System Certifications admin page to edit the HTML certificate templates used when issuing
                  Nex-Net certifications.
                </div>
                <a
                  href="/system/certifications"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 4,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #0f172a",
                    backgroundColor: "#0f172a",
                    color: "#f9fafb",
                    fontSize: 11,
                    textDecoration: "none",
                  }}
                >
                  Open System Certifications
                </a>
              </div>
            </div>
          )}

          {tab === "Policies & Procedures" && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Policies & Procedures (PnP)</h3>
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This placeholder will evolve into the authoritative home for Nex-Net policies, referral rules,
                operating procedures, and program documentation. For now, refer to internal Nex-Net policy docs
                maintained by Nexus System.
              </p>
            </div>
          )}
        </section>
      </div>
    </PageCard>
  );
}
