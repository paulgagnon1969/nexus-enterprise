#!/usr/bin/env ts-node
/**
 * CAM Manual Compiler
 * 
 * Compiles individual CAM documents into a cohesive handbook organized by
 * "Area of Influence" (chapters). The output is a single comprehensive manual
 * showcasing NEXUS SYSTEM NCC's competitive advantages.
 * 
 * Usage:
 *   npm run compile:cam-manual
 *   ts-node scripts/compile-cam-manual.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

// Area of Influence mapping (chapters)
const AREAS_OF_INFLUENCE = {
  'Pricing & Estimation Excellence': {
    modes: ['EST', 'ESTIMATING'],
    categories: ['AUTO', 'INTG', 'SPD', 'ACC', 'INTL'],
    description: 'Advanced pricing engines, cost book management, and estimating workflows that deliver faster, more accurate quotes.',
    icon: '💰',
  },
  'Financial Operations & Intelligence': {
    modes: ['FIN'],
    categories: ['AUTO', 'INTL', 'VIS', 'ACC'],
    description: 'Automated billing, invoice generation, receipt processing, and real-time financial visibility.',
    icon: '📊',
  },
  'Project Operations & Visibility': {
    modes: ['OPS'],
    categories: ['VIS', 'AUTO', 'COLLAB', 'INTL'],
    description: 'Real-time project tracking, task management, daily logs, and predictive analytics for field operations.',
    icon: '🏗️',
  },
  'Workforce & Time Management': {
    modes: ['HR'],
    categories: ['AUTO', 'ACC', 'VIS'],
    description: 'Geofenced time tracking, payroll automation, and crew assignment optimization.',
    icon: '👷',
  },
  'Client Collaboration & Transparency': {
    modes: ['CLT'],
    categories: ['COLLAB', 'VIS', 'AUTO'],
    description: 'Collaborator portal, real-time project visibility, and approval workflows for owners and adjusters.',
    icon: '🤝',
  },
  'Compliance & Documentation': {
    modes: ['CMP'],
    categories: ['AUTO', 'CMP', 'INTG'],
    description: 'Automated compliance tracking, OSHA integration, and audit-ready documentation.',
    icon: '✅',
  },
  'Technology Infrastructure': {
    modes: ['TECH', 'TECHNOLOGY'],
    categories: ['SPD', 'ACC', 'INTG'],
    description: 'High-performance architecture, graceful degradation, and enterprise-grade integrations.',
    icon: '⚡',
  },
};

type CAMFrontmatter = {
  title: string;
  cam_id: string;
  mode: string;
  category: string;
  status: string;
  competitive_score?: number;
  value_score?: number;
  created: string;
  updated?: string;
  session_ref?: string;
  visibility?: {
    public?: boolean;
    internal?: boolean;
    roles?: string[];
  };
  website?: {
    section?: string;
    priority?: number;
    headline?: string;
    summary?: string;
  };
};

type CAMDocument = {
  frontmatter: CAMFrontmatter;
  content: string;
  filename: string;
};

type AreaOfInfluence = {
  title: string;
  description: string;
  icon: string;
  cams: CAMDocument[];
};

function loadCAMs(camsDir: string): CAMDocument[] {
  const files = fs.readdirSync(camsDir).filter((f) => f.endsWith('.md'));
  const cams: CAMDocument[] = [];

  for (const file of files) {
    const filePath = path.join(camsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);

    cams.push({
      frontmatter: parsed.data as CAMFrontmatter,
      content: parsed.content,
      filename: file,
    });
  }

  return cams;
}

function groupCAMsByArea(cams: CAMDocument[]): Map<string, AreaOfInfluence> {
  const areaMap = new Map<string, AreaOfInfluence>();

  // Initialize areas
  for (const [title, config] of Object.entries(AREAS_OF_INFLUENCE)) {
    areaMap.set(title, {
      title,
      description: config.description,
      icon: config.icon,
      cams: [],
    });
  }

  // Assign CAMs to areas based on mode
  for (const cam of cams) {
    const mode = cam.frontmatter.mode?.toUpperCase();
    let assigned = false;

    for (const [title, config] of Object.entries(AREAS_OF_INFLUENCE)) {
      if (config.modes.includes(mode)) {
        const area = areaMap.get(title);
        if (area) {
          area.cams.push(cam);
          assigned = true;
          break;
        }
      }
    }

    if (!assigned) {
      console.warn(`⚠️  CAM ${cam.frontmatter.cam_id} (mode: ${mode}) not assigned to any area`);
    }
  }

  // Sort CAMs within each area by cam_id
  for (const area of areaMap.values()) {
    area.cams.sort((a, b) => a.frontmatter.cam_id.localeCompare(b.frontmatter.cam_id));
  }

  return areaMap;
}

function generateManual(areas: Map<string, AreaOfInfluence>): string {
  const now = new Date().toISOString().split('T')[0];
  const totalCAMs = Array.from(areas.values()).reduce((sum, area) => sum + area.cams.length, 0);

  let manual = `---
title: "NEXUS SYSTEM NCC — Competitive Advantage Manual (CAM)"
module: cam-manual
revision: "1.0"
tags: [cam, competitive-advantage, handbook, sales, training]
status: published
created: ${now}
updated: ${now}
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [all]
---

# NEXUS SYSTEM NCC
## Competitive Advantage Manual (CAM)

> **${totalCAMs} documented competitive advantages** that differentiate NEXUS Contractor Connect from the competition.

---

## About This Manual

This manual catalogs the competitive advantages built into NEXUS SYSTEM NCC. Each CAM (Competitive Advantage Module) represents a capability that:

1. **Solves a real business problem**
2. **Is not commonly available in competing products**
3. **Provides measurable value** (time saved, errors prevented, revenue enabled)
4. **Can be articulated as a selling point**

### How to Use This Manual

- **Sales Teams**: Reference specific CAMs during competitive positioning
- **Product Demos**: Highlight CAMs aligned with prospect pain points
- **Training**: Educate users on NCC's unique capabilities
- **Roadmap Planning**: Identify gaps in competitive coverage

---

## Manual Structure

This manual is organized into **${areas.size} Areas of Influence**, representing the major functional domains where NCC excels:

`;

  // Table of contents
  let chapterNum = 1;
  for (const [title, area] of areas.entries()) {
    if (area.cams.length === 0) continue;
    manual += `${chapterNum}. **${area.icon} ${title}** — ${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'}\n`;
    chapterNum++;
  }

  manual += `\n---\n\n`;

  // Chapters - use flat structure for cleaner TOC
  chapterNum = 1;
  let sectionNum = 1;
  
  for (const [title, area] of areas.entries()) {
    if (area.cams.length === 0) continue;

    // Area introduction (no TOC entry - using bold text instead of header)
    manual += `**Chapter ${chapterNum}: ${area.icon} ${title}**\n\n`;
    manual += `${area.description}\n\n`;
    manual += `*${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'} in this chapter*\n\n`;
    manual += `---\n\n`;

    for (const cam of area.cams) {
      // Single h2 per CAM - creates clean TOC entry
      manual += `## Section ${sectionNum} - ${cam.frontmatter.cam_id}: ${cam.frontmatter.title}`;
      
      // Add revision info if available (format as date only)
      const revision = cam.frontmatter.updated || cam.frontmatter.created;
      if (revision) {
        const revDate = typeof revision === 'string' ? revision.split('T')[0] : new Date(revision).toISOString().split('T')[0];
        manual += ` (Rev ${revDate})`;
      }
      manual += `\n\n`;
      
      // Scores
      if (cam.frontmatter.competitive_score || cam.frontmatter.value_score) {
        manual += `**Competitive Score**: ${cam.frontmatter.competitive_score ?? 'N/A'}/10 | `;
        manual += `**Value Score**: ${cam.frontmatter.value_score ?? 'N/A'}/10\n\n`;
      }

      // Content (strip frontmatter header if present)
      let content = cam.content.trim();
      // Remove the first h1 if it matches the title
      content = content.replace(/^#\s+.+\n\n?/, '');
      
      manual += content + '\n\n';
      manual += `---\n\n`;
      
      sectionNum++;
    }

    chapterNum++;
  }

  // Appendix
  manual += `## Appendix: CAM Taxonomy\n\n`;
  manual += `### Modes (Functional Areas)\n\n`;
  manual += `| Mode | Code | Description |\n`;
  manual += `|------|------|-------------|\n`;
  manual += `| Financial | \`FIN\` | Invoicing, billing, cost tracking, profitability |\n`;
  manual += `| Operations | \`OPS\` | Project management, scheduling, daily logs |\n`;
  manual += `| Estimating | \`EST\` | PETL, pricing, cost books, Xactimate integration |\n`;
  manual += `| HR/Workforce | \`HR\` | Timecards, payroll, crew management |\n`;
  manual += `| Client Relations | \`CLT\` | Client portal, collaborator access, approvals |\n`;
  manual += `| Compliance | \`CMP\` | Documentation, auditing, regulatory |\n`;
  manual += `| Technology | \`TECH\` | Infrastructure, performance, integrations |\n\n`;

  manual += `### Categories (Advantage Types)\n\n`;
  manual += `| Category | Code | Description |\n`;
  manual += `|----------|------|-------------|\n`;
  manual += `| Automation | \`AUTO\` | Eliminates manual work |\n`;
  manual += `| Intelligence | \`INTL\` | AI/ML-powered insights |\n`;
  manual += `| Integration | \`INTG\` | Connects disparate systems |\n`;
  manual += `| Visibility | \`VIS\` | Provides transparency others lack |\n`;
  manual += `| Speed | \`SPD\` | Faster than alternatives |\n`;
  manual += `| Accuracy | \`ACC\` | Reduces errors |\n`;
  manual += `| Compliance | \`CMP\` | Meets regulatory requirements |\n`;
  manual += `| Collaboration | \`COLLAB\` | Enables multi-party workflows |\n\n`;

  manual += `---\n\n`;
  manual += `*This manual is automatically generated from CAM documents in \`docs/cams/\`.*\n`;
  manual += `*Last compiled: ${new Date().toISOString()}*\n`;

  return manual;
}

// Main execution
const camsDir = path.join(__dirname, '../docs/cams');
const outputPath = path.join(__dirname, '../docs/CAM-MANUAL.md');

console.log('📚 Compiling CAM Manual...\n');

try {
  const cams = loadCAMs(camsDir);
  console.log(`✅ Loaded ${cams.length} CAM documents\n`);

  const areas = groupCAMsByArea(cams);
  
  console.log('📊 CAMs by Area of Influence:\n');
  for (const [title, area] of areas.entries()) {
    if (area.cams.length > 0) {
      console.log(`   ${area.icon} ${title}: ${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'}`);
    }
  }
  console.log('');

  const manual = generateManual(areas);
  fs.writeFileSync(outputPath, manual, 'utf8');

  console.log(`✅ CAM Manual compiled successfully!`);
  console.log(`📄 Output: ${outputPath}\n`);
} catch (error: any) {
  console.error('❌ Error compiling CAM Manual:', error.message);
  process.exit(1);
}
