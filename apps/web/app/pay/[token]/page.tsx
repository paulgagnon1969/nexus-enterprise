"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { usePlaidLink } from "react-plaid-link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ── Types ──────────────────────────────────────────────────────────

interface TokenInvoice {
  id: string;
  invoiceNo?: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  issuedAt?: string;
  dueAt?: string;
  memo?: string;
  billToName?: string;
  billToEmail?: string;
  project: { id: string; name: string; addressLine1: string; city: string; state: string; postalCode?: string };
  company: { id: string; name: string };
  lineItems: { id: string; description: string; qty?: number; unitPrice?: number; amount: number; unitCode?: string; sortOrder: number }[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const formatMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};

// ── Card Payment Form ───────────────────────────────────────────────

function CardForm({
  token,
  amount,
  balanceDue,
  onSuccess,
}: {
  token: string;
  amount: string;
  balanceDue: number;
  onSuccess: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [feeInfo, setFeeInfo] = useState<{ formattedFee: string; formattedAmount: string } | null>(null);

  const ccFee = Math.round(balanceDue * 0.035 * 100) / 100;
  const ccTotal = balanceDue + ccFee;

  useEffect(() => {
    fetch(`${API_BASE}/invoices/pay/${token}/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d) => {
        setClientSecret(d.clientSecret);
        if (d.formattedFee) setFeeInfo({ formattedFee: d.formattedFee, formattedAmount: d.formattedAmount });
      })
      .catch(() => setError("Failed to initialize payment"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    setLoading(true);
    setError(null);
    const card = elements.getElement(CardElement);
    if (!card) { setLoading(false); return; }
    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    });
    if (stripeError) {
      setError(stripeError.message || "Payment failed");
      setLoading(false);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess("Payment successful! Your invoice will be updated shortly.");
    } else {
      onSuccess("Payment is being processed. Your invoice will be updated once confirmed.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Fee breakdown */}
      <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#6b7280" }}>Invoice amount</span>
          <span style={{ color: "#0f172a" }}>{amount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#92400e" }}>Processing fee (3.5%)</span>
          <span style={{ color: "#92400e" }}>{feeInfo?.formattedFee ?? formatMoney(ccFee)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #fde68a", paddingTop: 6, marginTop: 4 }}>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Total charge</span>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>{feeInfo?.formattedAmount ?? formatMoney(ccTotal)}</span>
        </div>
      </div>

      <div style={{ padding: "12px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", marginBottom: 16 }}>
        <CardElement options={{ style: { base: { fontSize: "16px", color: "#0f172a" } } }} />
      </div>
      {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="submit"
        disabled={!stripe || !clientSecret || loading}
        style={{
          width: "100%", padding: "14px", borderRadius: 8, border: "none",
          background: loading ? "#9ca3af" : "#16a34a", color: "#fff",
          fontSize: 16, fontWeight: 700, cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Processing\u2026" : `Pay ${feeInfo?.formattedAmount ?? formatMoney(ccTotal)}`}
      </button>
    </form>
  );
}

// ── Plaid ACH Button ────────────────────────────────────────────────

function PlaidButton({
  token,
  amount,
  balanceDue,
  onSuccess,
}: {
  token: string;
  amount: string;
  balanceDue: number;
  onSuccess: (msg: string) => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const achFee = Math.round(balanceDue * 0.01 * 100) / 100;
  const achTotal = balanceDue + achFee;

  useEffect(() => {
    fetch(`${API_BASE}/invoices/pay/${token}/plaid-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.linkToken))
      .catch(() => setError("Failed to initialize bank connection"));
  }, [token]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      setLoading(true);
      setStatus("Connecting your bank account\u2026");
      try {
        const res = await fetch(`${API_BASE}/invoices/pay/${token}/plaid-exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken, accountId: metadata.accounts[0]?.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Payment failed");
        onSuccess(data.message || "ACH payment initiated successfully!");
      } catch (err: any) {
        setError(err.message || "Payment failed");
        setLoading(false);
      }
    },
    onExit: () => { /* User closed Plaid Link */ },
  });

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, margin: 0 }}>
        Connect your bank account to pay via ACH transfer. Funds typically settle in 1{"\u2013"}3 business days.
      </p>

      {/* Fee breakdown */}
      <div style={{ margin: "12px 0 16px", padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#6b7280" }}>Invoice amount</span>
          <span style={{ color: "#0f172a" }}>{amount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#1e40af" }}>ACH fee (1%)</span>
          <span style={{ color: "#1e40af" }}>{formatMoney(achFee)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #bfdbfe", paddingTop: 6, marginTop: 4 }}>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>Total charge</span>
          <span style={{ color: "#0f172a", fontWeight: 700 }}>{formatMoney(achTotal)}</span>
        </div>
      </div>

      {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12, marginTop: 8 }}>{error}</div>}
      {status && <p style={{ fontSize: 13, color: "#2563eb", marginBottom: 12, marginTop: 8 }}>{status}</p>}
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken || loading}
        style={{
          width: "100%", padding: "14px", borderRadius: 8, border: "none", marginTop: 8,
          background: (!ready || !linkToken || loading) ? "#9ca3af" : "#2563eb", color: "#fff",
          fontSize: 16, fontWeight: 700, cursor: (!ready || !linkToken || loading) ? "default" : "pointer",
        }}
      >
        {loading ? "Processing\u2026" : `Pay ${formatMoney(achTotal)} via Bank Transfer`}
      </button>
    </div>
  );
}

// ── Page Component ──────────────────────────────────────────────────

export default function PublicPaymentPage() {
  const params = useParams();
  const token = params?.token as string;

  const [invoice, setInvoice] = useState<TokenInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payTab, setPayTab] = useState<"card" | "ach">("card");
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/invoices/pay/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || "This payment link is invalid or has expired.");
        return;
      }
      const data = await res.json();
      setInvoice(data);
    } catch {
      setError("Unable to load invoice. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  const PAGE: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  // ── Loading / Error ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Loading invoice{"\u2026"}</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Payment Link Unavailable</h1>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>{error || "Invoice not found."}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === "PAID";
  const canPay = invoice.balanceDue > 0 && !isPaid && invoice.status !== "VOID" && invoice.status !== "DRAFT";

  return (
    <div style={PAGE}>
      {/* Header */}
      <header style={{
        maxWidth: 600, margin: "0 auto", padding: "24px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <img src="/nexconnect-logo.png" alt="Nexus" style={{ height: 28, width: "auto" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Invoice Payment</span>
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px 60px" }}>
        {/* Invoice Summary Card */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          overflow: "hidden", marginBottom: 24,
        }}>
          {/* Status banner */}
          {(() => {
            let bg = "rgba(59,130,246,0.1)";
            let border = "#3b82f6";
            let text = `Invoice ${invoice.invoiceNo ?? ""}`;
            if (isPaid) {
              bg = "rgba(34,197,94,0.1)"; border = "#22c55e";
              text = `PAID \u2014 ${invoice.invoiceNo ?? "Invoice"}`;
            } else if (invoice.status === "PARTIALLY_PAID") {
              bg = "rgba(234,179,8,0.1)"; border = "#eab308";
              text = `Partially Paid (${formatMoney(invoice.paidAmount)} of ${formatMoney(invoice.totalAmount)})`;
            } else if (invoice.dueAt && new Date(invoice.dueAt) < new Date()) {
              bg = "rgba(239,68,68,0.1)"; border = "#ef4444";
              text = `OVERDUE \u2014 Due ${formatDate(invoice.dueAt)}`;
            } else if (invoice.dueAt) {
              text = `Due ${formatDate(invoice.dueAt)}`;
            }
            return (
              <div style={{
                padding: "12px 20px", background: bg,
                borderBottom: `1px solid ${border}`,
                fontSize: 14, fontWeight: 600,
              }}>
                {text}
              </div>
            );
          })()}

          <div style={{ padding: "24px 20px" }}>
            {/* Company + meta */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{invoice.company.name}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {invoice.project.addressLine1}, {invoice.project.city}, {invoice.project.state}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{invoice.invoiceNo ?? "Invoice"}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Issued: {formatDate(invoice.issuedAt)}</div>
              </div>
            </div>

            {/* Bill To */}
            {invoice.billToName && (
              <div style={{ marginBottom: 20, padding: "10px 14px", background: "#f1f5f9", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Bill To</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{invoice.billToName}</div>
                {invoice.billToEmail && <div style={{ fontSize: 12, color: "#6b7280" }}>{invoice.billToEmail}</div>}
              </div>
            )}

            {/* Line items */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #334155" }}>
                  <th style={{ textAlign: "left", padding: "8px 6px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Description</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "8px 6px", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li) => (
                  <tr key={li.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 6px", color: "#374151" }}>{li.description}</td>
                    <td style={{ padding: "8px 6px", color: "#4b5563", textAlign: "right" }}>
                      {li.qty != null ? `${li.qty}${li.unitCode ? ` ${li.unitCode}` : ""}` : ""}
                    </td>
                    <td style={{ padding: "8px 6px", color: "#0f172a", fontWeight: 600, textAlign: "right" }}>
                      {formatMoney(li.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <div style={{ display: "flex", gap: 20, fontSize: 14 }}>
                <span style={{ color: "#6b7280" }}>Total</span>
                <span style={{ color: "#0f172a", fontWeight: 700, minWidth: 90, textAlign: "right" }}>{formatMoney(invoice.totalAmount)}</span>
              </div>
              {invoice.paidAmount > 0 && (
                <div style={{ display: "flex", gap: 20, fontSize: 14 }}>
                  <span style={{ color: "#16a34a" }}>Paid</span>
                  <span style={{ color: "#16a34a", fontWeight: 600, minWidth: 90, textAlign: "right" }}>{"\u2212"}{formatMoney(invoice.paidAmount)}</span>
                </div>
              )}
              {invoice.balanceDue > 0 && (
                <div style={{ display: "flex", gap: 20, fontSize: 18, marginTop: 4 }}>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>Balance Due</span>
                  <span style={{ color: "#0f172a", fontWeight: 700, minWidth: 90, textAlign: "right" }}>{formatMoney(invoice.balanceDue)}</span>
                </div>
              )}
            </div>

            {invoice.balanceDue > 0 && invoice.status !== "PAID" && invoice.status !== "VOID" && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
                A 3.5% processing fee applies to card payments. ACH transfers incur a 1% fee.
              </div>
            )}

            {invoice.memo && (
              <div style={{ marginTop: 16, padding: "10px 14px", background: "#f1f5f9", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>
                <strong style={{ color: "#4b5563" }}>Memo:</strong> {invoice.memo}
              </div>
            )}
          </div>
        </div>

        {/* Payment success */}
        {paymentSuccess && (
          <div style={{
            padding: "24px", borderRadius: 12,
            background: "rgba(34,197,94,0.1)", border: "1px solid #22c55e",
            textAlign: "center", marginBottom: 24,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\u2705"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>{paymentSuccess}</div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>You can close this page. No further action is needed.</div>
          </div>
        )}

        {/* Already paid */}
        {isPaid && !paymentSuccess && (
          <div style={{
            padding: "24px", borderRadius: 12,
            background: "rgba(34,197,94,0.1)", border: "1px solid #22c55e",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\u2705"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>This invoice has been paid in full.</div>
          </div>
        )}

        {/* Payment form */}
        {canPay && !paymentSuccess && (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
              <button
                onClick={() => setPayTab("card")}
                style={{
                  flex: 1, padding: "14px", border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 600, background: "transparent",
                  color: payTab === "card" ? "#16a34a" : "#6b7280",
                  borderBottom: payTab === "card" ? "2px solid #16a34a" : "2px solid transparent",
                }}
              >
                💳 Credit / Debit Card
              </button>
              <button
                onClick={() => setPayTab("ach")}
                style={{
                  flex: 1, padding: "14px", border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 600, background: "transparent",
                  color: payTab === "ach" ? "#2563eb" : "#6b7280",
                  borderBottom: payTab === "ach" ? "2px solid #2563eb" : "2px solid transparent",
                }}
              >
                🏦 Bank Transfer (ACH)
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {payTab === "card" && stripePromise && (
                <Elements stripe={stripePromise}>
                  <CardForm
                    token={token}
                    amount={formatMoney(invoice.balanceDue)}
                    balanceDue={invoice.balanceDue}
                    onSuccess={setPaymentSuccess}
                  />
                </Elements>
              )}
              {payTab === "card" && !stripePromise && (
                <div style={{ color: "#dc2626", fontSize: 13 }}>Card payments are not configured. Please contact the sender.</div>
              )}
              {payTab === "ach" && (
                <PlaidButton
                  token={token}
                  amount={formatMoney(invoice.balanceDue)}
                  balanceDue={invoice.balanceDue}
                  onSuccess={setPaymentSuccess}
                />
              )}
            </div>

            <div style={{
              padding: "12px 24px 20px", borderTop: "1px solid #f1f5f9",
              fontSize: 11, color: "#9ca3af", textAlign: "center",
            }}>
              🔒 Payments are processed securely by Stripe. Your payment details are never stored on our servers.
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", padding: "24px", maxWidth: 600, margin: "0 auto" }}>
        <p style={{ fontSize: 12, color: "#6b7280", margin: 0, textAlign: "center" }}>
          © {new Date().getFullYear()} Nexus Contractor Connect
        </p>
      </footer>
    </div>
  );
}
