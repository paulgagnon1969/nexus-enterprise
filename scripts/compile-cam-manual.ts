#!/usr/bin/env ts-node
/**
 * CAM Handbook Compiler
 *
 * Compiles individual CAM documents into handbooks with flexible selection,
 * format variants, and saved profiles.
 *
 * Usage:
 *   # Full manual (backward-compatible)
 *   npm run compile:cam-manual
 *
 *   # Flexible CLI
 *   npm run compile:cam -- --modes EST,FIN
 *   npm run compile:cam -- --cams FIN-ACC-0001,EST-SPD-0001
 *   npm run compile:cam -- --modes EST --format marketing
 *   npm run compile:cam -- --profile estimating-sales
 *   npm run compile:cam -- --list
 *   npm run compile:cam -- --modes OPS --exclude OPS-ACC-0001 --format overview
 *   npm run compile:cam -- --min-score 30 --format marketing
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

// ─── Types ───────────────────────────────────────────────────────────────────

type Format = 'full' | 'overview' | 'marketing';

type HandbookProfile = {
  name: string;
  description?: string;
  format: Format;
  modes?: string[];
  cams?: string[];
  exclude?: string[];
  minScore?: number;
  title?: string;
  subtitle?: string;
  includeScores?: boolean;
  includeTechnical?: boolean;
  includeDemoScript?: boolean;
  includeCompetitiveLandscape?: boolean;
};

type CAMFrontmatter = {
  title: string;
  cam_id?: string;
  mode?: string;
  category?: string;
  module_code?: string;
  status?: string;
  revision?: string;
  created?: string;
  updated?: string;
  author?: string;
  tags?: string[];
  website?: boolean;
  visibility?: {
    public?: boolean;
    internal?: boolean;
    roles?: string[];
  };
  scores?: { uniqueness?: number; value?: number; demonstrable?: number; defensible?: number; total?: number };
  score?: { uniqueness?: number; value?: number; demonstrable?: number; defensible?: number; total?: number } | string;
  cam_score?: { uniqueness?: number; value?: number; demonstrable?: number; defensible?: number; total?: number };
  competitive_score?: number;
  value_score?: number;
};

type CAMDocument = {
  frontmatter: CAMFrontmatter;
  content: string;
  filename: string;
  totalScore: number;
};

type AreaOfInfluence = {
  title: string;
  description: string;
  icon: string;
  cams: CAMDocument[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const AREAS_OF_INFLUENCE: Record<string, { modes: string[]; description: string; icon: string }> = {
  'Pricing & Estimation Excellence': {
    modes: ['EST', 'ESTIMATING'],
    description: 'Advanced pricing engines, cost book management, and estimating workflows that deliver faster, more accurate quotes.',
    icon: '💰',
  },
  'Financial Operations & Intelligence': {
    modes: ['FIN', 'FINANCIALS'],
    description: 'Automated billing, invoice generation, receipt processing, and real-time financial visibility.',
    icon: '📊',
  },
  'Project Operations & Visibility': {
    modes: ['OPS'],
    description: 'Real-time project tracking, task management, daily logs, and predictive analytics for field operations.',
    icon: '🏗️',
  },
  'Workforce & Time Management': {
    modes: ['HR'],
    description: 'Geofenced time tracking, payroll automation, and crew assignment optimization.',
    icon: '👷',
  },
  'Client Collaboration & Transparency': {
    modes: ['CLT'],
    description: 'Collaborator portal, real-time project visibility, and approval workflows for owners and adjusters.',
    icon: '🤝',
  },
  'Compliance & Documentation': {
    modes: ['CMP', 'COMPLIANCE'],
    description: 'Automated compliance tracking, OSHA integration, and audit-ready documentation.',
    icon: '✅',
  },
  'Technology Infrastructure': {
    modes: ['TECH', 'TECHNOLOGY'],
    description: 'High-performance architecture, graceful degradation, and enterprise-grade integrations.',
    icon: '⚡',
  },
};

const WARP_TMP = '/Volumes/4T Data/WARP TMP/reports';
const PROFILES_DIR = path.join(__dirname, '../docs/handbooks/profiles');
const CAMS_DIR = path.join(__dirname, '../docs/cams');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTotalScore(fm: CAMFrontmatter): number {
  const scoreObj =
    fm.scores ??
    (typeof fm.score === 'object' ? fm.score : null) ??
    fm.cam_score ??
    null;

  if (scoreObj && typeof scoreObj === 'object') {
    if (scoreObj.total) return scoreObj.total;
    const u = scoreObj.uniqueness ?? 0;
    const v = scoreObj.value ?? 0;
    const d = scoreObj.demonstrable ?? 0;
    const def = scoreObj.defensible ?? 0;
    return u + v + d + def;
  }

  if (fm.competitive_score && fm.value_score) {
    return fm.competitive_score + fm.value_score;
  }

  return 0;
}

function extractScoreComponents(fm: CAMFrontmatter): { uniqueness: number; value: number; demonstrable: number; defensible: number } | null {
  const scoreObj =
    fm.scores ??
    (typeof fm.score === 'object' ? fm.score : null) ??
    fm.cam_score ??
    null;

  if (scoreObj && typeof scoreObj === 'object') {
    return {
      uniqueness: scoreObj.uniqueness ?? 0,
      value: scoreObj.value ?? 0,
      demonstrable: scoreObj.demonstrable ?? 0,
      defensible: scoreObj.defensible ?? 0,
    };
  }
  return null;
}

function loadCAMs(camsDir: string): CAMDocument[] {
  const files = fs.readdirSync(camsDir).filter((f) => f.endsWith('.md'));
  const cams: CAMDocument[] = [];

  for (const file of files) {
    const filePath = path.join(camsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const fm = parsed.data as CAMFrontmatter;

    cams.push({
      frontmatter: fm,
      content: parsed.content,
      filename: file,
      totalScore: extractTotalScore(fm),
    });
  }

  return cams;
}

function filterCAMs(
  cams: CAMDocument[],
  opts: { modes?: string[]; camIds?: string[]; exclude?: string[]; minScore?: number }
): CAMDocument[] {
  let result = cams;

  if (opts.modes && opts.modes.length > 0) {
    const modesUpper = opts.modes.map((m) => m.toUpperCase());
    result = result.filter((c) => {
      const mode = c.frontmatter.mode?.toUpperCase() ?? '';
      return modesUpper.includes(mode);
    });
  }

  if (opts.camIds && opts.camIds.length > 0) {
    const idsUpper = opts.camIds.map((id) => id.toUpperCase());
    result = result.filter((c) => {
      const camId = (c.frontmatter.cam_id ?? '').toUpperCase().replace(/"/g, '');
      return idsUpper.includes(camId);
    });
  }

  if (opts.exclude && opts.exclude.length > 0) {
    const excludeUpper = opts.exclude.map((id) => id.toUpperCase());
    result = result.filter((c) => {
      const camId = (c.frontmatter.cam_id ?? '').toUpperCase().replace(/"/g, '');
      return !excludeUpper.includes(camId);
    });
  }

  if (opts.minScore && opts.minScore > 0) {
    result = result.filter((c) => c.totalScore >= opts.minScore!);
  }

  return result;
}

function groupCAMsByArea(cams: CAMDocument[]): Map<string, AreaOfInfluence> {
  const areaMap = new Map<string, AreaOfInfluence>();

  for (const [title, config] of Object.entries(AREAS_OF_INFLUENCE)) {
    areaMap.set(title, { title, description: config.description, icon: config.icon, cams: [] });
  }

  for (const cam of cams) {
    const mode = cam.frontmatter.mode?.toUpperCase() ?? '';
    let assigned = false;

    for (const [title, config] of Object.entries(AREAS_OF_INFLUENCE)) {
      if (config.modes.includes(mode)) {
        areaMap.get(title)!.cams.push(cam);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      console.warn(`⚠️  CAM ${cam.frontmatter.cam_id ?? cam.filename} (mode: ${mode}) not assigned to any area`);
    }
  }

  for (const area of areaMap.values()) {
    area.cams.sort((a, b) => (a.frontmatter.cam_id ?? '').localeCompare(b.frontmatter.cam_id ?? ''));
  }

  return areaMap;
}

// ─── Format-Aware Content Stripping ──────────────────────────────────────────

const SECTIONS_STRIP_OVERVIEW = [
  'Technical Implementation',
  'Technical Summary',
  'Technical Architecture',
  'Technical Foundation',
  'Technical Differentiators',
  'Technical Dependencies',
  'Session Origin',
  'Related Features',
  'Related Modules',
  'Revision History',
  'Files',
  'Data Architecture',
];

const SECTIONS_KEEP_MARKETING = [
  'Elevator Pitch',
  'The Problem',
  'Problem',
  'What It Does',
  'How It Works',
  'Why It Matters',
  'The NCC Advantage',
  'NCC Advantage',
  'Solution',
  'Business Value',
  'Key Features',
  'Key Metrics',
  'Competitive Advantage',
  'Competitive Differentiation',
  'Competitive Landscape',
  'Demo Script',
];

function stripContentByFormat(content: string, format: Format, profile?: HandbookProfile): string {
  if (format === 'full') return content;

  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let skipSection = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (format === 'overview' && inCodeBlock) {
        skipSection = true;
        continue;
      }
      if (format === 'overview' && !inCodeBlock && skipSection) {
        skipSection = false;
        continue;
      }
    }

    if (inCodeBlock && format === 'overview' && skipSection) {
      continue;
    }

    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      const currentSection = sectionMatch[1].trim();

      if (format === 'overview') {
        skipSection = SECTIONS_STRIP_OVERVIEW.some((s) => currentSection.startsWith(s));
      } else if (format === 'marketing') {
        skipSection = !SECTIONS_KEEP_MARKETING.some((s) => currentSection.startsWith(s));

        if (profile) {
          if (!profile.includeDemoScript && currentSection.startsWith('Demo Script')) skipSection = true;
          if (!profile.includeCompetitiveLandscape && currentSection.startsWith('Competitive')) skipSection = true;
        }
      }
    }

    if (!skipSection) {
      result.push(line);
    }
  }

  return result.join('\n');
}

// ─── Handbook Generation ─────────────────────────────────────────────────────

function generateScoreGuide(): string {
  return `## Score Guide

Each CAM is evaluated on four criteria, scored 1–10:

| Criterion | What It Measures | 1 (Low) | 10 (High) |
|-----------|------------------|---------|----------|
| **Uniqueness** | Do competitors have this? | Common feature | No competitor has it |
| **Value** | How much does this help users? | Minor convenience | Critical business impact |
| **Demonstrable** | Can we show this in a demo? | Hard to demonstrate | Instantly compelling |
| **Defensible** | Is this hard to copy? | Easy to replicate | Deep technical moat |

**CAM Threshold**: Combined score ≥ 24 (out of 40) qualifies as a documented competitive advantage.

**Score Tiers**:
- 🏆 **Elite** (35–40): Unique market differentiator — lead with these in demos
- ⭐ **Strong** (30–34): Clear competitive edge — core selling points
- ✅ **Qualified** (24–29): Meaningful advantage — supporting proof points

---

## Module Groups (Areas of Influence)

`;
}

function generateModuleGroupSummary(areas: Map<string, AreaOfInfluence>): string {
  let summary = '';
  for (const [, area] of areas.entries()) {
    if (area.cams.length === 0) continue;
    const avgScore = area.cams.length > 0
      ? (area.cams.reduce((sum, c) => sum + c.totalScore, 0) / area.cams.length).toFixed(1)
      : '0';
    summary += `${area.icon} **${area.title}** — ${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'} · avg score ${avgScore}/40\n`;
  }
  return summary + '\n---\n\n';
}

function generateHandbook(
  areas: Map<string, AreaOfInfluence>,
  format: Format,
  options: { title?: string; subtitle?: string; profile?: HandbookProfile }
): string {
  const now = new Date().toISOString().split('T')[0];
  const totalCAMs = Array.from(areas.values()).reduce((sum, area) => sum + area.cams.length, 0);
  const activeAreas = Array.from(areas.values()).filter((a) => a.cams.length > 0);

  const handbookTitle = options.title ?? 'NEXUS SYSTEM NCC — Competitive Advantage Manual (CAM)';
  const handbookSubtitle = options.subtitle ?? '';
  const formatLabel = format === 'full' ? 'Full Technical' : format === 'overview' ? 'Executive Overview' : 'Marketing';

  let manual = `---
title: "${handbookTitle}"
module: cam-handbook
revision: "1.0"
format: ${format}
tags: [cam, competitive-advantage, handbook, ${format}]
status: published
created: ${now}
updated: ${now}
author: NEXUS SYSTEM
cam_count: ${totalCAMs}
module_groups: ${activeAreas.length}
visibility:
  public: false
  internal: true
  roles: [all]
---

# ${handbookTitle}
`;

  if (handbookSubtitle) {
    manual += `### ${handbookSubtitle}\n`;
  }

  manual += `\n> **${totalCAMs} competitive advantage${totalCAMs === 1 ? '' : 's'}** across **${activeAreas.length} module group${activeAreas.length === 1 ? '' : 's'}** · Format: ${formatLabel}\n\n---\n\n`;

  // ── Score Guide (at the top) ──
  manual += generateScoreGuide();

  // ── Module Group Summary ──
  manual += generateModuleGroupSummary(areas);

  // ── Chapters ──
  let chapterNum = 1;
  let sectionNum = 1;

  for (const [, area] of areas.entries()) {
    if (area.cams.length === 0) continue;

    manual += `**Chapter ${chapterNum}: ${area.icon} ${area.title}**\n\n`;
    manual += `${area.description}\n\n`;
    manual += `*${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'} in this chapter*\n\n`;
    manual += `---\n\n`;

    for (const cam of area.cams) {
      const camId = cam.frontmatter.cam_id ?? cam.filename.replace('.md', '');

      const revision = cam.frontmatter.updated || cam.frontmatter.created;
      let revStr = '';
      if (revision) {
        const revDate = typeof revision === 'string' ? revision.split('T')[0] : new Date(revision).toISOString().split('T')[0];
        revStr = ` (Rev ${revDate})`;
      }
      manual += `## Section ${sectionNum} — ${camId}: ${cam.frontmatter.title}${revStr}\n\n`;

      // Scores (skip in marketing format)
      if (format !== 'marketing') {
        const scores = extractScoreComponents(cam.frontmatter);
        if (scores) {
          const total = cam.totalScore;
          const tier = total >= 35 ? '🏆 Elite' : total >= 30 ? '⭐ Strong' : '✅ Qualified';
          manual += `**Score**: ${total}/40 ${tier} — `;
          manual += `U:${scores.uniqueness} · V:${scores.value} · D:${scores.demonstrable} · Def:${scores.defensible}\n\n`;
        }
      }

      // Content (strip frontmatter header, apply format stripping)
      let content = cam.content.trim();
      content = content.replace(/^#\s+.+\n\n?/, '');
      content = content.replace(/^## CAM ID\n`[^`]+`\n\n?/, '');

      content = stripContentByFormat(content, format, options.profile);
      manual += content.trim() + '\n\n';
      manual += `---\n\n`;

      sectionNum++;
    }

    chapterNum++;
  }

  // ── Appendix (full format only) ──
  if (format === 'full') {
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
  }

  manual += `---\n\n`;
  manual += `*Compiled from \`docs/cams/\` · ${totalCAMs} CAMs · Format: ${formatLabel} · ${new Date().toISOString()}*\n`;

  return manual;
}

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  modes?: string[];
  cams?: string[];
  exclude?: string[];
  minScore?: number;
  format: Format;
  output?: string;
  title?: string;
  profile?: string;
  list: boolean;
  publish: boolean;
} {
  const args: ReturnType<typeof parseArgs> = { format: 'full', list: false, publish: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--modes':
        args.modes = next?.split(',').map((s) => s.trim().toUpperCase());
        i++;
        break;
      case '--cams':
        args.cams = next?.split(',').map((s) => s.trim().toUpperCase());
        i++;
        break;
      case '--exclude':
        args.exclude = next?.split(',').map((s) => s.trim().toUpperCase());
        i++;
        break;
      case '--min-score':
        args.minScore = parseInt(next, 10);
        i++;
        break;
      case '--format':
        if (['full', 'overview', 'marketing'].includes(next)) {
          args.format = next as Format;
        } else {
          console.error(`❌ Unknown format: ${next}. Use: full, overview, marketing`);
          process.exit(1);
        }
        i++;
        break;
      case '--output':
        args.output = next;
        i++;
        break;
      case '--title':
        args.title = next;
        i++;
        break;
      case '--profile':
        args.profile = next;
        i++;
        break;
      case '--list':
        args.list = true;
        break;
      case '--publish':
        args.publish = true;
        break;
    }
  }

  return args;
}

function loadProfile(profileName: string): HandbookProfile | null {
  const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    console.error(`❌ Profile not found: ${profilePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf8')) as HandbookProfile;
}

// ─── List Mode ───────────────────────────────────────────────────────────────

function listCAMs(cams: CAMDocument[]): void {
  const areas = groupCAMsByArea(cams);

  console.log(`\n📋 CAM Inventory — ${cams.length} documents\n`);

  for (const [, area] of areas.entries()) {
    if (area.cams.length === 0) continue;
    const avgScore = (area.cams.reduce((s, c) => s + c.totalScore, 0) / area.cams.length).toFixed(1);
    console.log(`${area.icon} ${area.title} (${area.cams.length} CAMs · avg ${avgScore}/40)`);

    for (const cam of area.cams) {
      const id = cam.frontmatter.cam_id ?? cam.filename;
      const score = cam.totalScore;
      const tier = score >= 35 ? '🏆' : score >= 30 ? '⭐' : score >= 24 ? '✅' : '⚪';
      const status = cam.frontmatter.status ?? 'draft';
      const lines = cam.content.split('\n').length;
      const thin = lines < 100 ? ' ⚠️ THIN' : '';
      console.log(`   ${tier} ${id.toString().padEnd(22)} ${String(score).padStart(2)}/40  ${status.padEnd(10)} ${String(lines).padStart(3)} lines${thin}`);
    }
    console.log('');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

// Load profile if specified (profile settings are defaults, CLI args override)
let profile: HandbookProfile | undefined;
if (args.profile) {
  const loaded = loadProfile(args.profile);
  if (!loaded) process.exit(1);
  profile = loaded;

  if (!args.modes && profile.modes) args.modes = profile.modes;
  if (!args.cams && profile.cams) args.cams = profile.cams;
  if (!args.exclude && profile.exclude) args.exclude = profile.exclude;
  if (!args.minScore && profile.minScore) args.minScore = profile.minScore;
  if (args.format === 'full' && profile.format) args.format = profile.format;
  if (!args.title && profile.title) args.title = profile.title;
}

console.log('📚 CAM Handbook Compiler\n');

const allCAMs = loadCAMs(CAMS_DIR);
console.log(`   Loaded ${allCAMs.length} CAM documents from docs/cams/\n`);

const filtered = filterCAMs(allCAMs, {
  modes: args.modes,
  camIds: args.cams,
  exclude: args.exclude,
  minScore: args.minScore,
});

if (filtered.length === 0) {
  console.error('❌ No CAMs matched the selection criteria.');
  process.exit(1);
}

// List mode — print and exit
if (args.list) {
  listCAMs(filtered);
  process.exit(0);
}

console.log(`   Selected ${filtered.length} CAMs (format: ${args.format})`);
if (args.modes) console.log(`   Modes: ${args.modes.join(', ')}`);
if (args.cams) console.log(`   CAM IDs: ${args.cams.join(', ')}`);
if (args.exclude) console.log(`   Excluded: ${args.exclude.join(', ')}`);
if (args.minScore) console.log(`   Min score: ${args.minScore}`);
console.log('');

const areas = groupCAMsByArea(filtered);

for (const [, area] of areas.entries()) {
  if (area.cams.length > 0) {
    console.log(`   ${area.icon} ${area.title}: ${area.cams.length} CAM${area.cams.length === 1 ? '' : 's'}`);
  }
}
console.log('');

const handbook = generateHandbook(areas, args.format, {
  title: args.title,
  subtitle: profile?.subtitle,
  profile,
});

// Determine output path
let outputPath: string;
if (args.output) {
  outputPath = args.output;
} else if (args.modes || args.cams || args.profile) {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const label = args.profile
    ? args.profile
    : args.modes
      ? args.modes.join('-')
      : 'custom';
  const filename = `cam-handbook-${label}-${args.format}-${dateStr}.md`;

  if (fs.existsSync('/Volumes/4T Data/WARP TMP')) {
    if (!fs.existsSync(WARP_TMP)) fs.mkdirSync(WARP_TMP, { recursive: true });
    outputPath = path.join(WARP_TMP, filename);
  } else {
    outputPath = path.join(process.env.HOME ?? '.', 'Desktop', filename);
    console.log(`⚠️  4T volume not mounted, saving to Desktop`);
  }
} else {
  // No filters = full manual → default location
  outputPath = path.join(__dirname, '../docs/sops-staging/CAM-MANUAL.md');
}

fs.writeFileSync(outputPath, handbook, 'utf8');
console.log(`✅ Handbook compiled: ${outputPath}`);
console.log(`   ${filtered.length} CAMs · ${args.format} format · ${handbook.length.toLocaleString()} bytes\n`);

if (args.publish) {
  const publishPath = path.join(__dirname, '../docs/sops-staging/CAM-MANUAL.md');
  fs.writeFileSync(publishPath, handbook, 'utf8');
  console.log(`📤 Published to ${publishPath}\n`);
}
