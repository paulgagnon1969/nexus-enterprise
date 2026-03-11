#!/usr/bin/env python3
"""
Insert Work ↔ Signal blocks from individual CAM files into the consolidated CAM Manual.

For each Section in the manual, this script:
1. Extracts the CAM ID from the section header
2. Finds the matching CAM file in docs/cams/
3. Extracts its Work ↔ Signal block
4. Inserts it after the Score line (and optional blockquote), before the first ## content heading
"""

import os
import re
import glob

CAMS_DIR = "/Users/pg/nexus-enterprise/docs/cams"
MANUAL_PATH = "/Users/pg/nexus-enterprise/docs/sops-staging/CAM-MANUAL.md"

# Build Work ↔ Signal map from CAM files
def extract_work_signal(filepath):
    """Extract the Work ↔ Signal block from a CAM file."""
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    in_block = False
    block_lines = []
    for line in lines:
        if line.strip() == '## Work ↔ Signal':
            in_block = True
            continue
        if in_block:
            # Stop at next ## heading or --- separator
            if line.startswith('## ') or line.strip() == '---':
                break
            block_lines.append(line)
    
    # Clean up: remove leading/trailing blank lines
    while block_lines and block_lines[0].strip() == '':
        block_lines.pop(0)
    while block_lines and block_lines[-1].strip() == '':
        block_lines.pop()
    
    return ''.join(block_lines) if block_lines else None


def build_ws_map():
    """Build a map of (cam_id, disambiguator) -> work_signal_text."""
    ws_map = {}
    
    for filepath in glob.glob(os.path.join(CAMS_DIR, "*.md")):
        basename = os.path.basename(filepath)
        # Skip non-CAM files
        if basename in ('CAM-LIBRARY.md', 'CAM-PORTFOLIO-IMPACT.md'):
            continue
        
        ws_text = extract_work_signal(filepath)
        if ws_text:
            # Use the full filename (minus .md) as the key
            key = basename.replace('.md', '')
            ws_map[key] = ws_text
    
    return ws_map


def match_section_to_cam_file(section_header, ws_map):
    """Match a section header to the right CAM file key in ws_map."""
    
    # Special-case mappings for disambiguation
    special_mappings = {
        'Field Qty Discrepancy': 'OPS-VIS-0001-field-qty-discrepancy-pipeline',
        'Intelligent Feature Discovery': 'OPS-VIS-0001-intelligent-feature-discovery',
        'NexBRIDGE Modular Subscription': 'TECH-INTG-0001-nexbridge-modular-subscription',
        'NexCAD': 'TECH-INTG-0001-nexcad-precision-scan-cad-pipeline',
        'NexEXTRACT': 'TECH-INTL-0001-nexextract-adaptive-intelligence',
        'TUCKS': 'TECH-INTL-0001-tucks-telemetry-kpi-system',
        'NexDupE': 'EST-ACC-NexDupE',
        'NexBRIDGE Remote': 'TECH-COLLAB-0001-nexbridge-remote-support-control',
        'NexDocs': 'OPS-VIS-0004-nexus-edocs-integrated-document-management',
    }
    
    for keyword, cam_key in special_mappings.items():
        if keyword in section_header:
            if cam_key in ws_map:
                return ws_map[cam_key]
    
    # Generic matching: extract CAM ID and try to find it
    # Pattern: "Section N — CAM-ID: Title"
    m = re.search(r'— ([A-Z]+-[A-Z]+-\d+[a-z]?)', section_header)
    if m:
        cam_id = m.group(1)
        # Find any key that starts with this CAM ID
        matches = [k for k in ws_map if k.startswith(cam_id)]
        if len(matches) == 1:
            return ws_map[matches[0]]
        elif len(matches) > 1:
            # Multiple matches — need disambiguation (handled by special_mappings above)
            # Fall through to title-based matching
            for mk in matches:
                # Check if any part of the key appears in the section header
                parts = mk.replace(cam_id + '-', '').split('-')
                for part in parts:
                    if len(part) > 3 and part.lower() in section_header.lower():
                        return ws_map[mk]
    
    return None


def insert_work_signal_blocks():
    """Insert Work ↔ Signal blocks into the manual."""
    ws_map = build_ws_map()
    print(f"Loaded {len(ws_map)} Work ↔ Signal blocks from CAM files")
    
    with open(MANUAL_PATH, 'r') as f:
        lines = f.readlines()
    
    output = []
    i = 0
    insertions = 0
    
    while i < len(lines):
        line = lines[i]
        output.append(line)
        
        # Detect section headers
        if line.startswith('## Section ') and '—' in line:
            section_header = line.strip()
            ws_text = match_section_to_cam_file(section_header, ws_map)
            
            if ws_text:
                # Find the insertion point: after Score line + optional blockquote,
                # before first ## content heading
                # Look ahead to find the right spot
                j = i + 1
                insert_pos = None
                
                while j < len(lines):
                    stripped = lines[j].strip()
                    
                    # If we hit a ## heading (content section), insert before it
                    if stripped.startswith('## '):
                        insert_pos = j
                        break
                    j += 1
                
                if insert_pos:
                    # Copy lines up to (but not including) the insertion point
                    while i + 1 < insert_pos:
                        i += 1
                        output.append(lines[i])
                    
                    # Insert Work ↔ Signal block
                    output.append('\n')
                    output.append('### Work ↔ Signal\n')
                    output.append(ws_text)
                    output.append('\n')
                    insertions += 1
            else:
                print(f"  WARNING: No Work ↔ Signal match for: {section_header[:80]}")
        
        i += 1
    
    with open(MANUAL_PATH, 'w') as f:
        f.writelines(output)
    
    print(f"Inserted {insertions} Work ↔ Signal blocks")
    print(f"Total lines: {len(output)}")


if __name__ == '__main__':
    insert_work_signal_blocks()
