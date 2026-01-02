"use client";

import * as React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface PayrollWeekRow {
  companyId: string;
  projectId: string | null;
  projectCode: string | null;
  employeeId: string | null;
  firstName: string | null;
  lastName: string | null;
  classCode: string | null;
  weekEndDate: string; // ISO string from API
  weekCode?: string | null;
  totalPay: number;
  totalHoursSt: number;
  totalHoursOt: number;
  totalHoursDt: number;
}

export default function ProjectPayrollDetailsPage({
  params,
}: {
  params: Promise<{ id: string; employeeId: string }>;
}) {
  const { id, employeeId } = React.use(params);

  const [rows, setRows] = React.useState<PayrollWeekRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined"
      ? window.localStorage.getItem("accessToken")
      : null;

    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${API_BASE}/projects/${id}/employees/${encodeURIComponent(employeeId)}/payroll`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to load payroll details (${res.status}) ${text}`);
        }
        const json: any = await res.json();
        if (cancelled) return;
        const list: PayrollWeekRow[] = Array.isArray(json) ? json : [];
        setRows(list);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load payroll details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, employeeId]);

  const workerName = React.useMemo(() => {
    if (!rows || rows.length === 0) return "Payroll Details";
    const first = rows[0];
    const name = [first.firstName ?? "", first.lastName ?? ""]
      .map(s => s.trim())
      .filter(Boolean)
      .join(" ");
    return name || "Payroll Details";
  }, [rows]);

  const classCode = rows && rows[0]?.classCode;

  let totalHours = 0;
  let totalPay = 0;
  if (rows) {
    for (const r of rows) {
      totalHours += (r.totalHoursSt || 0) + (r.totalHoursOt || 0) + (r.totalHoursDt || 0);
      totalPay += r.totalPay || 0;
    }
  }

  return (
    <div className="app-card">
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <h1 style={{ marginTop: 0, fontSize: 18 }}>{workerName}</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            Project payroll details
            {classCode && (
              <>
                {" "}· Class: {classCode}
              </>
            )}
          </p>
        </div>
        <div>
          <a
            href={`/projects/${id}?tab=FINANCIAL`}
            style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}
          >
            ← Back to project financials
          </a>
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading payroll details…</p>
      )}

      {error && !loading && (
        <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
      )}

      {!loading && !error && rows && rows.length === 0 && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          No payroll records found for this worker on this project.
        </p>
      )}

      {!loading && !error && rows && rows.length > 0 && (
        <>
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 12,
              color: "#374151",
            }}
          >
            <div>
              <strong>Total hours on this project:</strong>{" "}
              {totalHours.toFixed(2)}
            </div>
            <div>
              <strong>Total gross pay (Certified Payroll basis):</strong>{" "}
              ${totalPay.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div style={{ marginTop: 4, color: "#6b7280" }}>
              Future enhancements will include expense reimbursements, per diem,
              and lodging lines associated with each week.
            </div>
          </div>

          <div style={{ maxHeight: "70vh", overflow: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>WW</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Week End</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>ST Hrs</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>OT Hrs</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>DT Hrs</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Total Hrs</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Gross Pay</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const weekEnd = new Date(r.weekEndDate).toLocaleDateString();
                  const totalHrs =
                    (r.totalHoursSt || 0) + (r.totalHoursOt || 0) + (r.totalHoursDt || 0);
                  const ww = (r.weekCode ?? "").trim();
                  return (
                    <tr key={`${r.weekEndDate}-${idx}`}>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          fontWeight: 600,
                        }}
                      >
                        {ww || "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                        }}
                      >
                        {weekEnd}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        {r.totalHoursSt.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        {r.totalHoursOt.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        {r.totalHoursDt.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        {totalHrs.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          textAlign: "right",
                        }}
                      >
                        ${r.totalPay.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderTop: "1px solid #e5e7eb",
                          color: "#6b7280",
                        }}
                      >
                        {/* Placeholder for future reimbursements / per diem / lodging */}
                        —
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
