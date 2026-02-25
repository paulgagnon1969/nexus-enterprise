#!/usr/bin/env bash
# ============================================================
# process-plan-sheets.sh
# Convert a construction plan PDF into per-sheet HTML files
# with high-fidelity WebP images and extracted metadata.
#
# Usage: bash scripts/process-plan-sheets.sh <input.pdf> [output-dir]
# ============================================================

set -euo pipefail

PDF_INPUT="${1:?Usage: $0 <input.pdf> [output-dir]}"
OUTPUT_DIR="${2:-docs/plan-sheets}"
PROJECT_NAME="46x36 The Lean Cottage"

# Three-tier resolution model
# Thumb:    fast browsing, index cards
# Standard: default viewer render, readable dimensions
# Master:   zoomed detail, print-ready, field reference
TIERS=(
  "thumb|72|60"
  "standard|150|85"
  "master|400|92"
)

# Sheet metadata: page_number|sheet_id|sheet_title|section
# Page numbers are 1-indexed matching the PDF
SHEET_MAP=(
  "1|A0|Cover Page|Architectural Plans"
  "2|A1|General Notes|Architectural Plans"
  "3|A2|Floor Plan|Architectural Plans"
  "4|A3|Roof Plan|Architectural Plans"
  "5|A4|Building Elevations (South/West)|Architectural Plans"
  "6|A5|Building Elevations (North/East)|Architectural Plans"
  "7|A6|Building Sections|Architectural Plans"
  "8|E1|First Floor Electrical Plan|Electrical Plans"
  "9|S0|Framing Notes|Structural Plans"
  "10|S1|Foundation Plan|Structural Plans"
  "11|S2|Foundation Plan - Slab|Structural Plans"
  "12|S3|Floor Framing Plan|Structural Plans"
  "13|S4|Roof Framing Plan|Structural Plans"
  "14|SD1|Framing Detail|Structural Plans"
  "15|A2.0|Floor Plans - Opt. Basement|Basement Option"
  "16|E2|First Floor Electrical Plan - Basement Opt.|Basement Option"
  "17|E3|Basement Electrical Plan|Basement Option"
)

echo "=========================================="
echo "  Plan Sheet Processor (Multi-Resolution)"
echo "  PDF:    $PDF_INPUT"
echo "  Output: $OUTPUT_DIR"
echo "  Tiers:  thumb@72dpi, standard@150dpi, master@400dpi"
echo "=========================================="

# Verify tools
for cmd in pdftoppm cwebp; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found. Install with: brew install poppler webp"
    exit 1
  fi
done

# Create output dirs
mkdir -p "$OUTPUT_DIR"/{images/thumb,images/standard,images/master,sheets,css,js}

# ──────────────────────────────────────────────
# Step 1: Extract pages as high-DPI PNG images
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 1: Extracting pages at multiple resolutions..."

for entry in "${SHEET_MAP[@]}"; do
  IFS='|' read -r page_num sheet_id sheet_title section <<< "$entry"
  safe_id=$(echo "$sheet_id" | tr '.' '-')

  echo "  ▸ Page $page_num → $sheet_id ($sheet_title)"

  for tier_entry in "${TIERS[@]}"; do
    IFS='|' read -r tier_name tier_dpi tier_quality <<< "$tier_entry"
    webp_file="$OUTPUT_DIR/images/${tier_name}/${safe_id}.webp"

    if [[ -f "$webp_file" ]]; then
      echo "    ✓ ${tier_name}@${tier_dpi}dpi — exists, skipping"
      continue
    fi

    # Extract page as PNG at this tier's DPI
    pdftoppm -png -r "$tier_dpi" -f "$page_num" -l "$page_num" \
      "$PDF_INPUT" "$OUTPUT_DIR/images/${tier_name}/tmp_${safe_id}"

    tmp_png=$(ls "$OUTPUT_DIR/images/${tier_name}/tmp_${safe_id}"*.png 2>/dev/null | head -1)
    if [[ -z "$tmp_png" ]]; then
      echo "    ✗ ${tier_name} — failed to extract"
      continue
    fi

    # Convert to WebP at tier-specific quality
    cwebp -q "$tier_quality" -quiet "$tmp_png" -o "$webp_file"
    rm -f "$tmp_png"

    webp_size=$(stat -f%z "$webp_file" 2>/dev/null || stat -c%s "$webp_file")
    webp_kb=$(echo "scale=0; $webp_size / 1024" | bc)
    echo "    ✓ ${tier_name}@${tier_dpi}dpi → ${webp_kb} KB"
  done
done

echo "  ✓ All tiers extracted"

# ──────────────────────────────────────────────
# Step 2: Generate per-sheet HTML files
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 2: Generating per-sheet HTML..."

for i in "${!SHEET_MAP[@]}"; do
  IFS='|' read -r page_num sheet_id sheet_title section <<< "${SHEET_MAP[$i]}"
  safe_id=$(echo "$sheet_id" | tr '.' '-')
  html_file="$OUTPUT_DIR/sheets/${safe_id}.html"
  
  # Determine prev/next for navigation
  prev_id=""
  prev_title=""
  next_id=""
  next_title=""
  
  if [[ $i -gt 0 ]]; then
    IFS='|' read -r _ prev_sheet prev_title _ <<< "${SHEET_MAP[$((i-1))]}"
    prev_id=$(echo "$prev_sheet" | tr '.' '-')
  fi
  
  if [[ $((i+1)) -lt ${#SHEET_MAP[@]} ]]; then
    IFS='|' read -r _ next_sheet next_title _ <<< "${SHEET_MAP[$((i+1))]}"
    next_id=$(echo "$next_sheet" | tr '.' '-')
  fi
  
  cat > "$html_file" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>${sheet_id} — ${sheet_title} | ${PROJECT_NAME}</title>
  <link rel="stylesheet" href="../css/viewer.css">
  <meta name="sheet-id" content="${sheet_id}">
  <meta name="sheet-section" content="${section}">
  <meta name="project" content="${PROJECT_NAME}">
</head>
<body>
  <header class="sheet-header">
    <div class="sheet-info">
      <span class="sheet-badge">${sheet_id}</span>
      <div>
        <h1>${sheet_title}</h1>
        <p class="sheet-section">${section} — ${PROJECT_NAME}</p>
      </div>
    </div>
    <div class="sheet-controls">
      <button id="btn-zoom-in" title="Zoom In">+</button>
      <button id="btn-zoom-reset" title="Reset Zoom">⊙</button>
      <button id="btn-zoom-out" title="Zoom Out">−</button>
      <button id="btn-fullscreen" title="Full Screen">⛶</button>
      <a href="../index.html" class="btn-index" title="Sheet Index">☰</a>
    </div>
  </header>

  <main class="drawing-viewport" id="viewport">
    <div class="drawing-container" id="container">
      <img 
        src="../images/standard/${safe_id}.webp" 
        data-thumb="../images/thumb/${safe_id}.webp"
        data-standard="../images/standard/${safe_id}.webp"
        data-master="../images/master/${safe_id}.webp"
        alt="${sheet_id} — ${sheet_title}"
        id="drawing"
        draggable="false"
        loading="eager"
      />
    </div>
  </main>

  <nav class="sheet-nav">
HTMLEOF

  # Add prev link
  if [[ -n "$prev_id" ]]; then
    echo "    <a href=\"${prev_id}.html\" class=\"nav-prev\">← ${prev_sheet} ${prev_title}</a>" >> "$html_file"
  else
    echo "    <span class=\"nav-prev disabled\"></span>" >> "$html_file"
  fi

  # Add next link  
  if [[ -n "$next_id" ]]; then
    echo "    <a href=\"${next_id}.html\" class=\"nav-next\">${next_sheet} ${next_title} →</a>" >> "$html_file"
  else
    echo "    <span class=\"nav-next disabled\"></span>" >> "$html_file"
  fi

  cat >> "$html_file" << 'HTMLEOF'
  </nav>

  <script src="../js/viewer.js"></script>
</body>
</html>
HTMLEOF

  echo "  ✓ ${sheet_id} → sheets/${safe_id}.html"
done

# ──────────────────────────────────────────────
# Step 3: Generate manifest JSON
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 3: Generating manifest..."

manifest_file="$OUTPUT_DIR/manifest.json"
echo '{' > "$manifest_file"
echo '  "project": "'"$PROJECT_NAME"'",' >> "$manifest_file"
echo '  "source_pdf": "'"$(basename "$PDF_INPUT")"'",' >> "$manifest_file"
echo '  "tiers": ["thumb@72dpi", "standard@150dpi", "master@400dpi"],' >> "$manifest_file"
echo '  "generated": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",' >> "$manifest_file"
echo '  "sheets": [' >> "$manifest_file"

for i in "${!SHEET_MAP[@]}"; do
  IFS='|' read -r page_num sheet_id sheet_title section <<< "${SHEET_MAP[$i]}"
  safe_id=$(echo "$sheet_id" | tr '.' '-')
  
  # Collect sizes for each tier
  thumb_bytes=0; std_bytes=0; master_bytes=0
  for tier_entry in "${TIERS[@]}"; do
    IFS='|' read -r tn _ _ <<< "$tier_entry"
    tf="$OUTPUT_DIR/images/${tn}/${safe_id}.webp"
    if [[ -f "$tf" ]]; then
      sz=$(stat -f%z "$tf" 2>/dev/null || stat -c%s "$tf")
      case "$tn" in
        thumb) thumb_bytes=$sz ;;
        standard) std_bytes=$sz ;;
        master) master_bytes=$sz ;;
      esac
    fi
  done
  
  comma=""
  if [[ $((i+1)) -lt ${#SHEET_MAP[@]} ]]; then
    comma=","
  fi
  
  cat >> "$manifest_file" << JSONEOF
    {
      "page": ${page_num},
      "sheet_id": "${sheet_id}",
      "safe_id": "${safe_id}",
      "title": "${sheet_title}",
      "section": "${section}",
      "html": "sheets/${safe_id}.html",
      "images": {
        "thumb":    { "path": "images/thumb/${safe_id}.webp",    "bytes": ${thumb_bytes},  "dpi": 72  },
        "standard": { "path": "images/standard/${safe_id}.webp", "bytes": ${std_bytes},    "dpi": 150 },
        "master":   { "path": "images/master/${safe_id}.webp",   "bytes": ${master_bytes}, "dpi": 400 }
      }
    }${comma}
JSONEOF
done

echo '  ]' >> "$manifest_file"
echo '}' >> "$manifest_file"

echo "  ✓ manifest.json"

# ──────────────────────────────────────────────
# Step 4: Generate index.html
# ──────────────────────────────────────────────
echo ""
echo "▸ Step 4: Generating index page..."

index_file="$OUTPUT_DIR/index.html"
cat > "$index_file" << 'INDEXEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sheet Index — 46x36 The Lean Cottage</title>
  <link rel="stylesheet" href="css/viewer.css">
</head>
<body class="index-page">
  <header class="index-header">
    <h1>46x36 The Lean Cottage</h1>
    <p class="subtitle">Construction Plan Sheets — Interactive Viewer</p>
  </header>

  <main class="sheet-index">
INDEXEOF

current_section=""
for entry in "${SHEET_MAP[@]}"; do
  IFS='|' read -r page_num sheet_id sheet_title section <<< "$entry"
  safe_id=$(echo "$sheet_id" | tr '.' '-')
  
  std_file="$OUTPUT_DIR/images/standard/${safe_id}.webp"
  master_file="$OUTPUT_DIR/images/master/${safe_id}.webp"
  file_size="—"
  if [[ -f "$std_file" ]]; then
    bytes=$(stat -f%z "$std_file" 2>/dev/null || stat -c%s "$std_file")
    file_size=$(echo "scale=0; $bytes / 1024" | bc)KB
  fi
  master_size=""
  if [[ -f "$master_file" ]]; then
    mbytes=$(stat -f%z "$master_file" 2>/dev/null || stat -c%s "$master_file")
    master_size=" · HD $(echo "scale=1; $mbytes / 1048576" | bc)MB"
  fi
  
  # Section header
  if [[ "$section" != "$current_section" ]]; then
    if [[ -n "$current_section" ]]; then
      echo '    </div>' >> "$index_file"
    fi
    echo "    <div class=\"section-group\">" >> "$index_file"
    echo "      <h2 class=\"section-title\">${section}</h2>" >> "$index_file"
    current_section="$section"
  fi
  
  cat >> "$index_file" << CARDEOF
      <a href="sheets/${safe_id}.html" class="sheet-card">
        <div class="sheet-card-badge">${sheet_id}</div>
        <div class="sheet-card-info">
          <span class="sheet-card-title">${sheet_title}</span>
          <span class="sheet-card-size">${file_size}${master_size}</span>
        </div>
        <img src="images/thumb/${safe_id}.webp" alt="${sheet_id}" class="sheet-card-thumb" loading="lazy" />
      </a>
CARDEOF
done

# Close last section
echo '    </div>' >> "$index_file"

cat >> "$index_file" << 'INDEXEOF'
  </main>

  <footer class="index-footer">
    <p>Generated from <code>34x46 Lean w Garage_Editable.pdf</code></p>
    <p>17 sheets · 3 resolution tiers (72 / 150 / 400 DPI)</p>
  </footer>
</body>
</html>
INDEXEOF

echo "  ✓ index.html"

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  ✓ Processing complete!"
echo ""
thumb_total=$(du -sh "$OUTPUT_DIR/images/thumb" 2>/dev/null | awk '{print $1}')
std_total=$(du -sh "$OUTPUT_DIR/images/standard" 2>/dev/null | awk '{print $1}')
master_total=$(du -sh "$OUTPUT_DIR/images/master" 2>/dev/null | awk '{print $1}')
all_total=$(du -sh "$OUTPUT_DIR/images" 2>/dev/null | awk '{print $1}')
echo "  Images ($all_total total):"
echo "    Thumb:    $OUTPUT_DIR/images/thumb/    ($thumb_total)"
echo "    Standard: $OUTPUT_DIR/images/standard/ ($std_total)"
echo "    Master:   $OUTPUT_DIR/images/master/   ($master_total)"
echo "  Sheets: $OUTPUT_DIR/sheets/ (17 HTML files)"
echo "  Index:  $OUTPUT_DIR/index.html"
echo "  Manifest: $OUTPUT_DIR/manifest.json"
echo ""
echo "  Open in browser:"
echo "    open $OUTPUT_DIR/index.html"
echo "=========================================="
