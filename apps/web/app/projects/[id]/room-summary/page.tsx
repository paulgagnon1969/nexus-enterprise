"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Project {
  id: string;
  name: string;
  status: string;
  city: string;
  state: string;
  addressLine1: string;
  addressLine2: string | null;
  createdAt: string;
}

interface PetlItem {
  id: string;
  lineNo: number;
  description: string | null;
  qty: number | null;
  unit: string | null;
  itemAmount: number | null;
  rcvAmount: number | null;
  percentComplete: number;
  payerType: string;
  categoryCode: string | null;
  selectionCode: string | null;
  projectParticle?: {
    id: string;
    name: string;
    fullLabel: string;
  } | null;
}

export default function RoomSummaryPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [petlItemCount, setPetlItemCount] = useState<number | null>(null);
  const [petlTotalAmount, setPetlTotalAmount] = useState<number | null>(null);

  const [petlItems, setPetlItems] = useState<PetlItem[]>([]);
  const [petlLoading, setPetlLoading] = useState(false);

  const [groupLoading, setGroupLoading] = useState(false);
  const [groups, setGroups] = useState<{
    id: number;
    roomName: string;
    itemsCount: number;
    totalAmount: number;
    completedAmount: number;
    percentComplete: number;
  }[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        // Basic project info
        const res = await fetch(`${API_BASE}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Failed to load project (${res.status})`);
        }
        const data: Project[] = await res.json();
        const found = data.find((p) => p.id === id) ?? null;
        if (!found) {
          setError("Project not found for this account.");
          return;
        }

        setProject(found);

        // Estimate summary
        try {
          const summaryRes = await fetch(`${API_BASE}/projects/${id}/estimate-summary`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (summaryRes.ok) {
            const summary: any = await summaryRes.json();
            setPetlItemCount(
              typeof summary.itemCount === "number" ? summary.itemCount : null,
            );
            setPetlTotalAmount(
              typeof summary.totalAmount === "number" ? summary.totalAmount : null,
            );
          }
        } catch {
          // ignore
        }

        // Full PETL items
        try {
          setPetlLoading(true);
          const petlRes = await fetch(`${API_BASE}/projects/${id}/petl`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (petlRes.ok) {
            const petl: any = await petlRes.json();
            const items: PetlItem[] = Array.isArray(petl.items) ? petl.items : [];
            setPetlItems(items);
          }
        } catch {
          // ignore
        } finally {
          setPetlLoading(false);
        }

        // Room/zone group summary
        try {
          setGroupLoading(true);
          const groupsRes = await fetch(`${API_BASE}/projects/${id}/petl-groups`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (groupsRes.ok) {
            const json: any = await groupsRes.json();
            setGroups(Array.isArray(json.groups) ? json.groups : []);
          }
        } catch {
          // ignore
        } finally {
          setGroupLoading(false);
        }
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading project…</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Room Summary</h1>
        <p style={{ color: "#b91c1c" }}>{error ?? "Project not found."}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Room Summary – {project.name}</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Status: {project.status}
      </p>
      <p style={{ fontSize: 13, marginTop: 8 }}>
        {project.addressLine1}
        {project.addressLine2 ? `, ${project.addressLine2}` : ""}
        <br />
        {project.city}, {project.state}
      </p>
      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
        Created: {new Date(project.createdAt).toLocaleString()}
      </p>

      {petlItemCount !== null && (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          Latest estimate: {petlItemCount} items,
          {" "}
          {petlTotalAmount !== null
            ? `$${petlTotalAmount.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}`
            : "total N/A"}
        </p>
      )}

      <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

      {/* Rooms / Zones summary */}
      {!groupLoading && groups.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Rooms / Zones</h2>
          <div
            style={{
              borderRadius: 8,
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Room</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Tasks</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Completed</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>% Complete</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td style={{ padding: "6px 12px", borderTop: "1px solid #e5e7eb" }}>
                      {g.roomName}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {g.itemsCount}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {g.totalAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {g.completedAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {g.percentComplete.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groupLoading && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading room summary…</p>
      )}

      {!petlLoading && petlItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Estimate items</h2>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Line</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Room</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Task</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Unit</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>RCV</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>%</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Cat</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Sel</th>
                </tr>
              </thead>
              <tbody>
                {petlItems.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.lineNo}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.projectParticle?.fullLabel ?? item.projectParticle?.name ?? ""}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.description}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.qty ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.unit ?? ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.itemAmount != null
                        ? item.itemAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.rcvAmount != null
                        ? item.rcvAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : ""}
                    </td>
                    <td
                      style={{
                        padding: "4px 8px",
                        borderTop: "1px solid #e5e7eb",
                        textAlign: "right",
                      }}
                    >
                      {item.percentComplete.toFixed(0)}%
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.categoryCode ?? ""}
                    </td>
                    <td style={{ padding: "4px 8px", borderTop: "1px solid #e5e7eb" }}>
                      {item.selectionCode ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {petlLoading && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Loading PETL items…</p>
      )}

      {!petlLoading && petlItems.length === 0 && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          No PETL items found for this estimate.
        </p>
      )}
    </div>
  );
}
