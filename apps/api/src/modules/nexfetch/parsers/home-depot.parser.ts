/**
 * NexFetch — Home Depot e-receipt HTML parser.
 *
 * HD receipts embed a POS-style receipt inside `<pre>` tags within the HTML
 * email body.  Each `<pre>` contains one line of the receipt (monospaced,
 * fixed-width formatting).  The receipt is duplicated (customer + merchant
 * copy) — we parse only the first copy.
 *
 * Key fields extracted:
 *   - Store address, city/state/zip, phone, store #
 *   - Transaction #, date/time, sale type
 *   - Line items (UPC, desc, price, tax cat, discounts, max refund)
 *   - Subtotal, tax, total
 *   - Payment card, auth code, chip/swipe
 *   - Pro Xtra: member phone, PO/Job Name, YTD spend
 *   - Return policy table
 */

import {
  ParsedReceipt,
  ParsedLineItem,
  ParsedPayment,
  ParsedStore,
  ParsedLoyalty,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

function clean(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}

/** Extract all text inside <pre> tags from the HTML. */
function extractPreLines(html: string): string[] {
  const matches = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi) || [];
  return matches.map((m) => {
    const inner = m.replace(/<\/?pre[^>]*>/gi, "");
    return clean(inner);
  }).filter(Boolean);
}

function parseAmount(s: string): number | null {
  const m = s.match(/-?\$?\s*([\d,]+\.\d{2})/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ""));
  return s.includes("-") ? -val : val;
}

function parseDateLine(line: string): { date: string; time: string; storeNum: string; txnNum: string } | null {
  // Format: "  6551  00055  23337    12/21/24  11:37 AM"
  const m = line.match(
    /^\s*(\d{4})\s+(\d{5})\s+(\d{5})\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i,
  );
  if (!m) return null;

  const [, storeNum, , txn, month, day, yearRaw, timeStr] = m;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  // Normalise time to HH:mm
  const tm = timeStr.replace(/\s+/g, " ").trim();
  const tp = tm.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  let time = tm;
  if (tp) {
    let h = parseInt(tp[1], 10);
    const ampm = tp[3].toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    time = `${String(h).padStart(2, "0")}:${tp[2]}`;
  }

  return { date, time, storeNum, txnNum: `${storeNum} ${m[2]} ${txn}` };
}

// ── Line-item regex ──────────────────────────────────────────────────
// HD line items look like:
//   "  885911962940 20V XR LITHI <A>    349.00 "
// Optional continuation line:
//   "     20V XR HAMMER DRILL 8.0 AH KIT"
// Discount line:
//   "  Pro Xtra Preferred Pricing     -0.91"
// Max refund line:
//   "     MAX REFUND VALUE $9.77"

const ITEM_RE = /^\s*(\d{9,14})\s+(.+?)\s+<([A-Z])>\s+([\d,]+\.\d{2})\s*$/;
const DISCOUNT_RE = /^\s*(Pro Xtra Preferred Pricing|Instant Savings|Markdown)\s+(-[\d,]+\.\d{2})\s*$/i;
const REFUND_RE = /^\s*MAX REFUND VALUE\s+\$([\d,]+\.\d{2})\s*$/i;

// ── Main parser ──────────────────────────────────────────────────────

export function parseHomeDepotReceipt(html: string): ParsedReceipt {
  const allLines = extractPreLines(html);

  // HD duplicates the receipt (customer + merchant copy). Take only the first.
  // Find the second occurrence of the store address pattern to detect the dupe.
  let lines = allLines;
  if (allLines.length > 20) {
    const firstAddr = allLines[0];
    const dupeIdx = allLines.indexOf(firstAddr, Math.min(15, allLines.length));
    if (dupeIdx > 0) {
      lines = allLines.slice(0, dupeIdx);
    }
  }

  const rawText = lines.join("\n");

  // ── Store ────────────────────────────────────────────────
  const store: ParsedStore = {
    storeNumber: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
    manager: null,
  };

  // First non-empty line is typically the street address
  if (lines.length > 0) store.address = lines[0];

  // Second line: "SELMA, TX 78154 (210)945-8160"
  if (lines.length > 1) {
    const csz = lines[1].match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*\(?([\d\-().]+)\)?/);
    if (csz) {
      store.city = csz[1].trim();
      store.state = csz[2];
      store.zip = csz[3];
      store.phone = csz[4].replace(/[^0-9]/g, "");
    }
  }

  // ── Transaction metadata ─────────────────────────────────
  let receiptDate: string | null = null;
  let receiptTime: string | null = null;
  let transactionNumber: string | null = null;
  let saleType: string | null = null;

  for (const line of lines) {
    const txn = parseDateLine(line);
    if (txn) {
      receiptDate = txn.date;
      receiptTime = txn.time;
      transactionNumber = txn.txnNum;
      store.storeNumber = txn.storeNum;
      break;
    }
  }

  // Sale type: "SALE SELF CHECKOUT" or "SALE" or "RETURN"
  for (const line of lines) {
    if (/^\s*SALE\b/i.test(line) || /^\s*RETURN\b/i.test(line)) {
      saleType = line.trim();
      break;
    }
  }

  // ── Line items ───────────────────────────────────────────
  const lineItems: ParsedLineItem[] = [];
  let currentItem: ParsedLineItem | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Item line
    const itemMatch = line.match(ITEM_RE);
    if (itemMatch) {
      // Flush previous item
      if (currentItem) lineItems.push(currentItem);

      const price = parseFloat(itemMatch[4].replace(/,/g, ""));
      currentItem = {
        sku: itemMatch[1],
        shortDescription: itemMatch[2].trim(),
        fullDescription: null,
        modelNumber: null,
        quantity: 1,
        uom: "EA",
        unitPrice: price,
        extendedPrice: price,
        taxCategory: itemMatch[3],
        discount: 0,
        discountReason: null,
        maxRefundValue: null,
        returnPolicyId: itemMatch[3], // Maps to return policy table
        returnPolicyDays: null,
        returnPolicyExpires: null,
      };
      continue;
    }

    // Continuation / full description line (indented, no price, follows an item)
    if (currentItem && /^\s{4,}[A-Z0-9]/.test(line) && !DISCOUNT_RE.test(line) && !REFUND_RE.test(line)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("MAX REFUND") && !trimmed.startsWith("Pro Xtra")) {
        if (!currentItem.fullDescription) {
          currentItem.fullDescription = trimmed;
        }
        continue;
      }
    }

    // Discount line
    const discMatch = line.match(DISCOUNT_RE);
    if (discMatch && currentItem) {
      const discAmt = parseFloat(discMatch[2].replace(/,/g, ""));
      currentItem.discount += discAmt;
      currentItem.discountReason = discMatch[1].trim();
      currentItem.extendedPrice += discAmt; // Discount is negative
      continue;
    }

    // Max refund line
    const refundMatch = line.match(REFUND_RE);
    if (refundMatch && currentItem) {
      currentItem.maxRefundValue = parseFloat(refundMatch[1].replace(/,/g, ""));
      continue;
    }
  }
  // Flush last item
  if (currentItem) lineItems.push(currentItem);

  // ── Totals ───────────────────────────────────────────────
  let subtotal: number | null = null;
  let taxAmount: number | null = null;
  let totalAmount: number | null = null;
  let totalSavings: number | null = null;

  for (const line of lines) {
    if (/^\s*SUBTOTAL\b/i.test(line)) subtotal = parseAmount(line);
    if (/^\s*SALES TAX\b/i.test(line)) taxAmount = parseAmount(line);
    if (/^\s*TOTAL\b/i.test(line) && !/SUBTOTAL/i.test(line)) totalAmount = parseAmount(line);
    if (/TOTAL SAVINGS/i.test(line)) totalSavings = parseAmount(line);
  }

  // ── Payment ──────────────────────────────────────────────
  const payments: ParsedPayment[] = [];
  let readMethod: string | null = null;

  for (const line of lines) {
    if (/Chip Read/i.test(line)) readMethod = "Chip Read";
    if (/Contactless/i.test(line)) readMethod = "Contactless";
    if (/Swiped/i.test(line)) readMethod = "Swiped";

    // "XXXXXXXXXXXX1326 MASTERCARD"
    const cardMatch = line.match(/X{4,}(\d{4})\s+(\w+)/);
    if (cardMatch) {
      payments.push({
        cardType: cardMatch[2],
        cardLast4: cardMatch[1],
        amount: totalAmount ?? 0,
        authCode: null,
        readMethod: null, // Filled below
      });
    }

    // "AUTH CODE 78275Z/1553072"
    const authMatch = line.match(/AUTH CODE\s+(\S+)/i);
    if (authMatch && payments.length > 0) {
      payments[payments.length - 1].authCode = authMatch[1];
    }
  }

  // Apply read method to all payments
  for (const p of payments) p.readMethod = readMethod;

  // ── Pro Xtra / Loyalty ───────────────────────────────────
  let loyalty: ParsedLoyalty | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // "PRO XTRA ###-###-0654 SUMMARY"
    const proMatch = line.match(/PRO XTRA\s+([\d#\-]+)\s+SUMMARY/i);
    if (proMatch) {
      loyalty = loyalty || { memberPhone: null, poJobName: null, ytdSpend: null, programName: "PRO XTRA" };
      loyalty.memberPhone = proMatch[1];
    }

    // "THIS RECEIPT PO/JOB NAME: personal"
    const poMatch = line.match(/PO\/JOB NAME:\s*(.+)/i);
    if (poMatch) {
      loyalty = loyalty || { memberPhone: null, poJobName: null, ytdSpend: null, programName: "PRO XTRA" };
      loyalty.poJobName = poMatch[1].trim();
    }

    // "2024 PRO XTRA SPEND 12/20:    $41,268.82"
    const spendMatch = line.match(/PRO XTRA SPEND[^:]*:\s*\$([\d,]+\.\d{2})/i);
    if (spendMatch) {
      loyalty = loyalty || { memberPhone: null, poJobName: null, ytdSpend: null, programName: "PRO XTRA" };
      loyalty.ytdSpend = parseFloat(spendMatch[1].replace(/,/g, ""));
    }
  }

  // ── Return policies ──────────────────────────────────────
  const returnPolicies: ParsedReceipt["returnPolicies"] = [];
  let inReturnSection = false;

  for (const line of lines) {
    if (/RETURN POLICY DEFINITIONS/i.test(line)) {
      inReturnSection = true;
      continue;
    }
    if (inReturnSection) {
      // "A      1       90        03/21/2025"
      const polMatch = line.match(/^\s*([A-Z])\s+\d+\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})/);
      if (polMatch) {
        returnPolicies.push({
          policyId: polMatch[1],
          days: parseInt(polMatch[2], 10),
          expiresOn: polMatch[3],
        });
      }
    }
  }

  // Map return policies back to line items
  for (const item of lineItems) {
    if (item.returnPolicyId) {
      const pol = returnPolicies.find((p) => p.policyId === item.returnPolicyId);
      if (pol) {
        item.returnPolicyDays = pol.days;
        item.returnPolicyExpires = pol.expiresOn;
      }
    }
  }

  return {
    vendor: "HOME_DEPOT",
    vendorName: store.storeNumber ? `The Home Depot #${store.storeNumber}` : "The Home Depot",
    store,
    transactionNumber,
    receiptDate,
    receiptTime,
    saleType,
    invoiceNumber: null,
    orderNumber: null,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    totalSavings,
    shippingAmount: null,
    currency: "USD",
    payments,
    loyalty,
    returnPolicies,
    rawText,
  };
}
