/**
 * Generate an HTML label sized for 24mm Brother TZe tape (PT-P710BT).
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │  ┌──────┐  NP-000123               │
 * │  │ QR   │  Dri-Eaz LGR 3500i       │
 * │  │ code │  nexus • nex-plac         │
 * │  └──────┘                           │
 * └─────────────────────────────────────┘
 *
 * Height: ~24mm (tape width). Width: auto-sized by printer.
 */
export function generateLabelHtml(params: {
  qrDataUrl: string;
  placardCode: string;
  assetName: string;
  manufacturer?: string | null;
  model?: string | null;
}): string {
  const { qrDataUrl, placardCode, assetName, manufacturer, model } = params;
  const subtitle =
    [manufacturer, model].filter(Boolean).join(" ") || assetName;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page {
      size: 68mm 24mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 68mm;
      height: 24mm;
      font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      padding: 1mm 2mm;
    }
    .qr {
      width: 20mm;
      height: 20mm;
      flex-shrink: 0;
      margin-right: 2mm;
    }
    .qr img {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
    .info {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .code {
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 0.5pt;
      line-height: 1.2;
    }
    .name {
      font-size: 6.5pt;
      color: #333;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brand {
      font-size: 5pt;
      color: #888;
      margin-top: 1mm;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
  </style>
</head>
<body>
  <div class="qr">
    <img src="${qrDataUrl}" alt="QR" />
  </div>
  <div class="info">
    <div class="code">${escapeHtml(placardCode)}</div>
    <div class="name">${escapeHtml(subtitle)}</div>
    <div class="brand">NEXUS • NEX-PLAC</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
