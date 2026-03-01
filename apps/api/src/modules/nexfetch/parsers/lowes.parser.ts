/**
 * NexFetch — Lowe's e-receipt HTML parser.
 *
 * Lowe's has two receipt formats:
 *
 * **Old (2021–2024): "Your Lowe's Purchase Receipt"**
 *   POS-style text with `Item #:`, `@ unit price`, store # at bottom.
 *
 * **New (2025+): "Your Sales Receipt"**
 *   Structured HTML table with Item #, Description, Model #, Qty, UoM,
 *   Unit Price, Ext Price.  Store location as "Location:" field.
 *
 * Both formats are detected automatically and parsed into the shared
 * `ParsedReceipt` interface.
 */

import {
  ParsedReceipt,
  ParsedLineItem,
  ParsedPayment,
  ParsedStore,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let text = html;
  // Remove style/script blocks
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Convert structural tags to newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(tr|div|p|td|th|table|tbody|thead|li)[^>]*>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  // Collapse whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

function parseAmount(s: string): number | null {
  const m = s.match(/-?\$?\s*([\d,]+\.\d{2})/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ""));
  return s.trim().startsWith("-") ? -val : val;
}

function isNewFormat(html: string): boolean {
  // New format has structured table headers
  return /Item\s+Description\s.*Model\s*#/i.test(html) || /Sold\s+From/i.test(html);
}

// ── Old Format Parser (2021–2024) ────────────────────────────────────

function parseOldFormat(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rawText = lines.join("\n");

  const store: ParsedStore = {
    storeNumber: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
    manager: null,
  };

  // Store info: "LOWE'S HOME CENTERS, LLC" then address, then city/state/zip
  const storeAddrIdx = lines.findIndex((l) => /LOWE.*HOME CENTER/i.test(l));
  if (storeAddrIdx >= 0 && storeAddrIdx + 2 < lines.length) {
    store.address = lines[storeAddrIdx + 1];
    const csz = lines[storeAddrIdx + 2].match(
      /^(.+?)\s*,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/,
    );
    if (csz) {
      store.city = csz[1].trim();
      store.state = csz[2];
      store.zip = csz[3];
    }
  }

  // Phone: "(XXXXXXXXXX" or just digits
  for (const line of lines) {
    const phoneMatch = line.match(/^\(?\*{0,10}(\d{10})\)?$/);
    if (phoneMatch) {
      store.phone = phoneMatch[1];
      break;
    }
  }

  // Transaction # and date
  let transactionNumber: string | null = null;
  let receiptDate: string | null = null;
  let receiptTime: string | null = null;

  for (const line of lines) {
    // "Transaction # : 88931639"
    const txnMatch = line.match(/Transaction\s*#\s*:\s*(\d+)/i);
    if (txnMatch) transactionNumber = txnMatch[1];

    // "Order Date : 05/07/22 08:58:00"
    const dateMatch = line.match(/Order\s+Date\s*:\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}:\d{2})/i);
    if (dateMatch) {
      const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
      receiptDate = `${year}-${dateMatch[1]}-${dateMatch[2]}`;
      receiptTime = dateMatch[4];
    }
  }

  // Store #: "Store # 2596" or "Store # \n 2596"
  for (let i = 0; i < lines.length; i++) {
    const storeMatch = lines[i].match(/Store\s*#\s*(\d+)/i);
    if (storeMatch) {
      store.storeNumber = storeMatch[1];
      break;
    }
    // Also check if "Store #" is on one line and number on next
    if (/Store\s*#\s*$/i.test(lines[i]) && i + 1 < lines.length) {
      const num = lines[i + 1].match(/^\s*(\d+)\s*$/);
      if (num) { store.storeNumber = num[1]; break; }
    }
  }

  // Manager
  for (const line of lines) {
    const mgr = line.match(/Store Manager\s+(.*)/i);
    if (mgr) store.manager = mgr[1].trim();
  }

  // ── Line items ───────────────────────────────────────────
  // Old format pattern:
  //   "GAL DENATURED ALCOHOL (206564)"  ← description + (internal code)
  //   "$ 65.94"                          ← price
  //   "Item #: 622052"                   ← Lowe's item number
  //   "3 @ 21.98"                        ← quantity breakdown
  const lineItems: ParsedLineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for price line "$ XX.XX" preceded by description
    const priceMatch = line.match(/^\$\s*([\d,]+\.\d{2})$/);
    if (priceMatch && i > 0) {
      const desc = lines[i - 1];
      // Skip if desc is a subtotal/tax/total label
      if (/Subtotal|Total Tax|^Total$/i.test(desc)) continue;

      const extPrice = parseFloat(priceMatch[1].replace(/,/g, ""));

      // Look ahead for Item # and quantity
      let sku: string | null = null;
      let qty = 1;
      let unitPrice = extPrice;

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const itemMatch = lines[j].match(/Item\s*#:\s*(\d+)/i);
        if (itemMatch) sku = itemMatch[1];

        const qtyMatch = lines[j].match(/^(\d+)\s+@\s+([\d.]+)$/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10);
          unitPrice = parseFloat(qtyMatch[2]);
        }
      }

      // Extract internal code from description if present
      const codeMatch = desc.match(/\((\d+)\)\s*$/);
      const cleanDesc = desc.replace(/\s*\(\d+\)\s*$/, "").trim();

      lineItems.push({
        sku,
        shortDescription: cleanDesc,
        fullDescription: null,
        modelNumber: null,
        quantity: qty,
        uom: "EA",
        unitPrice,
        extendedPrice: extPrice,
        taxCategory: null,
        discount: 0,
        discountReason: null,
        maxRefundValue: null,
        returnPolicyId: null,
        returnPolicyDays: null,
        returnPolicyExpires: null,
      });
    }
  }

  // ── Totals ───────────────────────────────────────────────
  let subtotal: number | null = null;
  let taxAmount: number | null = null;
  let totalAmount: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (/^Subtotal$/i.test(lines[i]) && i + 1 < lines.length) {
      subtotal = parseAmount(lines[i + 1]);
    }
    if (/^Total Tax$/i.test(lines[i]) && i + 1 < lines.length) {
      taxAmount = parseAmount(lines[i + 1]);
    }
    if (/^Total$/i.test(lines[i]) && i + 1 < lines.length && !/Tax/i.test(lines[i])) {
      const amt = parseAmount(lines[i + 1]);
      if (amt !== null && amt > (subtotal ?? 0)) totalAmount = amt;
    }
  }

  // ── Payment ──────────────────────────────────────────────
  const payments: ParsedPayment[] = [];

  for (const line of lines) {
    // "Payment: M/C ending in 3024  $ 226.57"
    const payMatch = line.match(
      /Payment:\s+(\S+)\s+ending\s+in\s+(\d{4})/i,
    );
    if (payMatch) {
      const cardTypeMap: Record<string, string> = {
        "M/C": "MASTERCARD",
        "VISA": "VISA",
        "AMEX": "AMEX",
        "DISC": "DISCOVER",
      };
      payments.push({
        cardType: cardTypeMap[payMatch[1].toUpperCase()] || payMatch[1],
        cardLast4: payMatch[2],
        amount: totalAmount ?? 0,
        authCode: null,
        readMethod: null,
      });
    }
  }

  // Auth code
  for (const line of lines) {
    const auth = line.match(/AuthCD\s+(\S+)/i);
    if (auth && payments.length > 0) {
      payments[payments.length - 1].authCode = auth[1];
    }
  }

  return {
    vendor: "LOWES",
    vendorName: store.storeNumber ? `Lowe's #${store.storeNumber}` : "Lowe's",
    store,
    transactionNumber,
    receiptDate,
    receiptTime,
    saleType: null,
    invoiceNumber: null,
    orderNumber: null,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    totalSavings: null,
    shippingAmount: null,
    currency: "USD",
    payments,
    loyalty: null,
    returnPolicies: [],
    rawText,
  };
}

// ── New Format Parser (2025+) ────────────────────────────────────────

function parseNewFormat(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rawText = lines.join("\n");

  const store: ParsedStore = {
    storeNumber: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    phone: null,
    manager: null,
  };

  // Location number
  for (const line of lines) {
    const loc = line.match(/Location:\s*(\d+)/i);
    if (loc) { store.storeNumber = loc[1]; break; }
  }

  // Address: after "Sold From" section, pattern: "NNN Street Name"
  // then "CITY, ST ZIPCODE"
  let foundSoldFrom = false;
  for (let i = 0; i < lines.length; i++) {
    if (/Sold\s+From/i.test(lines[i])) foundSoldFrom = true;
    if (foundSoldFrom) {
      // Street address pattern
      const addrMatch = lines[i].match(/^(\d+\s+.+(?:ST|RD|AVE|BLVD|DR|LN|WAY|PKWY|HWY)\s*.*)$/i);
      if (addrMatch && !store.address) {
        store.address = addrMatch[1].trim();
        continue;
      }
      // City, state zip
      const csz = lines[i].match(/^([A-Z][A-Z\s]+?),\s*([A-Z]{2})\s+(\d{5})/);
      if (csz && store.address) {
        store.city = csz[1].trim();
        store.state = csz[2];
        store.zip = csz[3];
        break;
      }
    }
  }

  // Phone
  for (const line of lines) {
    const ph = line.match(/(\d{10})/);
    if (ph && foundSoldFrom) { store.phone = ph[1]; break; }
  }

  // Transaction metadata
  let transactionNumber: string | null = null;
  let receiptDate: string | null = null;
  let invoiceNumber: string | null = null;
  let orderNumber: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // "Order Date: 07/15/2025"
    const dateMatch = line.match(/Order\s*Date:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dateMatch) {
      receiptDate = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
    }
    // "Sales Date: 07/16/2025"
    const salesDate = line.match(/Sales\s*Date:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (salesDate) {
      receiptDate = receiptDate || `${salesDate[3]}-${salesDate[1]}-${salesDate[2]}`;
    }

    // "Invoice #: 77886"
    const inv = line.match(/Invoice\s*#:\s*(\d+)/i);
    if (inv) invoiceNumber = inv[1];

    // "Order #: 200604190250970076"
    const ord = line.match(/Order\s*#:\s*(\d+)/i);
    if (ord) orderNumber = ord[1];

    // "Fulfillment #: 79583"
    const ful = line.match(/Fulfillment\s*#:\s*(\d+)/i);
    if (ful) transactionNumber = ful[1];
  }

  // ── Line items (new format) ──────────────────────────────
  // Item # | Description | Model # | Qty | UoM | Unit Price | Ext Price
  // "5682938" then desc and model on subsequent lines, prices nearby
  const lineItems: ParsedLineItem[] = [];

  // Find item blocks — each starts with a Lowe's item number (typically 7 digits)
  // followed by description, model, price info
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match item number line (standalone number or at start)
    const itemNumMatch = line.match(/^(\d{5,8})$/);
    if (!itemNumMatch) continue;

    const sku = itemNumMatch[1];
    let description = "";
    let modelNumber: string | null = null;
    let qty = 1;
    let uom = "EA";
    let unitPrice = 0;
    let extPrice = 0;
    let discount = 0;
    let discountReason: string | null = null;
    let origPrice: number | null = null;

    // Scan ahead for item details
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const detail = lines[j];

      // Skip if we hit the next item number
      if (/^\d{5,8}$/.test(detail)) break;

      // Description (first long text after item #)
      if (!description && detail.length > 10 && !/^\$/.test(detail) && !/^Original/i.test(detail)) {
        description = detail;
        continue;
      }

      // "Original Price" line
      if (/Original Price/i.test(detail)) {
        // Next line has the original price
        if (j + 1 < lines.length) {
          origPrice = parseAmount(lines[j + 1]);
        }
        continue;
      }

      // Promo/discount description (starts with MLR/MLPR or long description)
      if (/^ML[PR]/i.test(detail) || (detail.length > 30 && /Save|Discount/i.test(detail))) {
        discountReason = detail;
        continue;
      }

      // Model number line
      if (/^[A-Z0-9]{5,}[A-Z]/.test(detail) && !description.includes(detail)) {
        // Check if it looks like a model number followed by qty
        const modelQty = detail.match(/^(\S+)\s+(\d+)\s*(LD|EA)?$/);
        if (modelQty) {
          modelNumber = modelQty[1];
          qty = parseInt(modelQty[2], 10);
          if (modelQty[3]) uom = modelQty[3];
          continue;
        }
        // Just model number
        if (detail.length < 30) {
          modelNumber = detail;
          continue;
        }
      }

      // Quantity line: just a number (sometimes on its own line)
      if (/^\d+$/.test(detail) && parseInt(detail, 10) < 100) {
        qty = parseInt(detail, 10);
        continue;
      }

      // Price line: "$1,898.00"
      const priceLine = detail.match(/^\$([\d,]+\.\d{2})$/);
      if (priceLine) {
        const p = parseFloat(priceLine[1].replace(/,/g, ""));
        if (!extPrice || p < extPrice) {
          extPrice = p; // Take the lower (discounted) price
        }
        if (!unitPrice) unitPrice = p;
        continue;
      }
    }

    if (description && extPrice > 0) {
      if (origPrice && origPrice > extPrice) {
        discount = -(origPrice - extPrice);
      }
      unitPrice = extPrice / (qty || 1);

      lineItems.push({
        sku,
        shortDescription: description,
        fullDescription: null,
        modelNumber,
        quantity: qty,
        uom,
        unitPrice,
        extendedPrice: extPrice,
        taxCategory: null,
        discount,
        discountReason,
        maxRefundValue: null,
        returnPolicyId: null,
        returnPolicyDays: null,
        returnPolicyExpires: null,
      });
    }
  }

  // ── Totals ───────────────────────────────────────────────
  let subtotal: number | null = null;
  let taxAmount: number | null = null;
  let totalAmount: number | null = null;
  let totalSavings: number | null = null;
  let shippingAmount: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^Subtotal:/i.test(line)) subtotal = parseAmount(line);
    if (/^Total Tax:/i.test(line)) taxAmount = parseAmount(line);
    if (/^Total:/i.test(line) && !/Tax/i.test(line) && !/Fee/i.test(line)) {
      totalAmount = parseAmount(line);
    }
    if (/Shipping.*Delivery:/i.test(line)) shippingAmount = parseAmount(line);
    if (/Total Savings/i.test(line)) totalSavings = parseAmount(line);
  }

  // ── Payment ──────────────────────────────────────────────
  const payments: ParsedPayment[] = [];

  for (const line of lines) {
    // "VISA 2445 : $2,059.86"
    const payMatch = line.match(/(VISA|MASTERCARD|M\/C|AMEX|DISCOVER|DISC)\s+(\d{4})\s*:\s*\$([\d,]+\.\d{2})/i);
    if (payMatch) {
      const cardTypeMap: Record<string, string> = {
        "M/C": "MASTERCARD",
        "DISC": "DISCOVER",
      };
      payments.push({
        cardType: cardTypeMap[payMatch[1].toUpperCase()] || payMatch[1].toUpperCase(),
        cardLast4: payMatch[2],
        amount: parseFloat(payMatch[3].replace(/,/g, "")),
        authCode: null,
        readMethod: null,
      });
    }
  }

  return {
    vendor: "LOWES",
    vendorName: store.storeNumber ? `Lowe's #${store.storeNumber}` : "Lowe's",
    store,
    transactionNumber,
    receiptDate,
    receiptTime: null,
    saleType: null,
    invoiceNumber,
    orderNumber,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    totalSavings,
    shippingAmount,
    currency: "USD",
    payments,
    loyalty: null,
    returnPolicies: [],
    rawText,
  };
}

// ── Main entry point ─────────────────────────────────────────────────

export function parseLowesReceipt(html: string): ParsedReceipt {
  const text = stripHtml(html);

  if (isNewFormat(html)) {
    return parseNewFormat(text);
  }
  return parseOldFormat(text);
}
