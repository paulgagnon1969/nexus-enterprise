"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface BidItem {
  id: string;
  catSel?: string;
  divisionCode?: string;
  description: string;
  quantity: number;
  unit?: string;
  costType: string;
}

interface PortalInfo {
  supplierName: string;
  companyName: string;
  bidRequest: {
    title: string;
    description?: string;
    dueDate?: string;
    status: string;
    project?: { addressLine1?: string; city?: string; state?: string };
  };
  status: string;
  hasResponded: boolean;
}

interface BidRequestData {
  recipientId: string;
  supplier: { id: string; name: string };
  bidRequest: {
    id: string;
    title: string;
    description?: string;
    dueDate?: string;
    status: string;
    company: { name: string };
    project: { addressLine1?: string; city?: string; state?: string };
    items: BidItem[];
  };
  existingResponse: any;
  status: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

export default function BidPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);

  // PIN entry state
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // After PIN verification
  const [bidData, setBidData] = useState<BidRequestData | null>(null);

  // Response form state
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [responseNotes, setResponseNotes] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch initial portal info
  useEffect(() => {
    async function loadPortalInfo() {
      try {
        const res = await fetch(`${API_BASE}/bid-portal/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Invalid access link");
        }
        const data = await res.json();
        setPortalInfo(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadPortalInfo();
  }, [token]);

  const handleVerifyPin = async () => {
    if (!pin || pin.length !== 6) {
      setPinError("Please enter a 6-digit PIN");
      return;
    }

    setVerifying(true);
    setPinError(null);

    try {
      const res = await fetch(`${API_BASE}/bid-portal/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "PIN verification failed");
      }

      const data = await res.json();
      setBidData(data);

      // Pre-fill prices from existing response
      if (data.existingResponse?.items) {
        const existingPrices: Record<string, string> = {};
        const existingNotes: Record<string, string> = {};
        for (const item of data.existingResponse.items) {
          existingPrices[item.bidRequestItemId] = item.unitPrice?.toString() || "";
          if (item.notes) existingNotes[item.bidRequestItemId] = item.notes;
        }
        setPrices(existingPrices);
        setItemNotes(existingNotes);
        if (data.existingResponse.notes) setResponseNotes(data.existingResponse.notes);
        if (data.existingResponse.submittedByName) setSubmitterName(data.existingResponse.submittedByName);
        if (data.existingResponse.submittedByEmail) setSubmitterEmail(data.existingResponse.submittedByEmail);
      }
    } catch (err: any) {
      setPinError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    // Validate all prices are filled
    const items = bidData?.bidRequest.items || [];
    const missingPrices = items.filter((item) => !prices[item.id] || isNaN(parseFloat(prices[item.id])));

    if (missingPrices.length > 0) {
      setError(`Please enter prices for all ${missingPrices.length} items`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/bid-portal/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          items: items.map((item) => ({
            bidRequestItemId: item.id,
            unitPrice: parseFloat(prices[item.id]),
            notes: itemNotes[item.id] || undefined,
          })),
          notes: responseNotes || undefined,
          submittedByName: submitterName || undefined,
          submittedByEmail: submitterEmail || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit response");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!confirm("Are you sure you want to decline this bid request?")) return;

    try {
      const res = await fetch(`${API_BASE}/bid-portal/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to decline");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const calculateTotal = () => {
    const items = bidData?.bidRequest.items || [];
    return items.reduce((sum, item) => {
      const price = parseFloat(prices[item.id]) || 0;
      return sum + price * (item.quantity || 1);
    }, 0);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  // Error state (invalid token)
  if (error && !portalInfo) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 12, maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Access Error</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 12, maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Response Submitted</h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Thank you for your response to {portalInfo?.companyName}'s bid request.
          </p>
        </div>
      </div>
    );
  }

  // PIN entry screen
  if (!bidData) {
    return (
      <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: 24 }}>
        <div style={{ maxWidth: 440, margin: "0 auto", paddingTop: 40 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Supplier Bid Portal</h1>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                {portalInfo?.companyName}
              </p>
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                {portalInfo?.bidRequest.title}
              </div>
              {portalInfo?.bidRequest.project && (
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  📍 {portalInfo.bidRequest.project.addressLine1}, {portalInfo.bidRequest.project.city}, {portalInfo.bidRequest.project.state}
                </div>
              )}
              {portalInfo?.bidRequest.dueDate && (
                <div style={{ fontSize: 12, color: "#dc2626" }}>
                  ⏰ Due: {new Date(portalInfo.bidRequest.dueDate).toLocaleDateString()}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 8, textAlign: "center" }}>
                Enter your 6-digit PIN to continue
              </label>
              <input
                type="text"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="• • • • • •"
                style={{
                  width: "100%",
                  padding: "16px",
                  fontSize: 24,
                  textAlign: "center",
                  letterSpacing: 12,
                  border: "2px solid #e5e7eb",
                  borderRadius: 8,
                  outline: "none",
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyPin()}
              />
              {pinError && (
                <p style={{ color: "#dc2626", fontSize: 12, marginTop: 8, textAlign: "center" }}>
                  {pinError}
                </p>
              )}
            </div>

            <button
              onClick={handleVerifyPin}
              disabled={verifying || pin.length !== 6}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: 14,
                fontWeight: 600,
                background: verifying || pin.length !== 6 ? "#9ca3af" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: verifying || pin.length !== 6 ? "not-allowed" : "pointer",
              }}
            >
              {verifying ? "Verifying..." : "Continue"}
            </button>

            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 16 }}>
              Your PIN was included in the email you received.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main bid response form
  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: 24 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {bidData.bidRequest.title}
              </h1>
              <p style={{ color: "#6b7280", fontSize: 13 }}>
                From: {bidData.bidRequest.company.name}
              </p>
              {bidData.bidRequest.project && (
                <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                  📍 {bidData.bidRequest.project.addressLine1}, {bidData.bidRequest.project.city}, {bidData.bidRequest.project.state}
                </p>
              )}
            </div>
            {bidData.bidRequest.dueDate && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>Due Date</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#dc2626" }}>
                  {new Date(bidData.bidRequest.dueDate).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
          {bidData.bidRequest.description && (
            <p style={{ fontSize: 13, color: "#374151", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
              {bidData.bidRequest.description}
            </p>
          )}
        </div>

        {error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Items table */}
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>
              Line Items ({bidData.bidRequest.items.length})
            </h2>
          </div>
          <div style={{ maxHeight: 500, overflow: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", position: "sticky", top: 0 }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Description</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, width: 80 }}>Qty</th>
                  <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, width: 60 }}>Unit</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, width: 120 }}>Unit Price</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, width: 100 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {bidData.bidRequest.items.map((item, idx) => (
                  <tr key={item.id} style={{ borderTop: idx > 0 ? "1px solid #e5e7eb" : undefined }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 500 }}>{item.description}</div>
                      {item.catSel && (
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{item.catSel}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {item.quantity?.toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center", color: "#6b7280" }}>
                      {item.unit || "EA"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <span style={{ marginRight: 4 }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={prices[item.id] || ""}
                          onChange={(e) => setPrices({ ...prices, [item.id]: e.target.value })}
                          placeholder="0.00"
                          style={{
                            width: 80,
                            padding: "6px 8px",
                            border: "1px solid #d1d5db",
                            borderRadius: 4,
                            textAlign: "right",
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 500 }}>
                      ${((parseFloat(prices[item.id]) || 0) * (item.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f9fafb" }}>
                  <td colSpan={4} style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                    Total
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontSize: 16 }}>
                    ${calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Contact info & notes */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Your Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Name</label>
              <input
                type="text"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                placeholder="Your name"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={submitterEmail}
                onChange={(e) => setSubmitterEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Notes (optional)</label>
            <textarea
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              placeholder="Any additional notes, lead times, or conditions..."
              rows={3}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <button
            onClick={handleDecline}
            style={{
              padding: "12px 24px",
              fontSize: 13,
              background: "#fff",
              color: "#6b7280",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Decline to Bid
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "12px 32px",
              fontSize: 14,
              fontWeight: 600,
              background: submitting ? "#9ca3af" : "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting..." : "Submit Response"}
          </button>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 24 }}>
          Powered by NEXUS • {bidData.supplier.name}
        </p>
      </div>
    </div>
  );
}
