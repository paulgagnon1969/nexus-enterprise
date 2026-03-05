#!/usr/bin/env npx ts-node
/**
 * Vision Model A/B Evaluation Harness
 *
 * Extracts frames from a drone/handheld video using FFmpeg, sends the same
 * frames + prompt to multiple vision models (GPT-4o, Grok Vision, etc.),
 * and produces a side-by-side comparison report.
 *
 * Usage:
 *   npx ts-node scripts/eval-vision-models.ts <video-path> [options]
 *
 * Options:
 *   --type EXTERIOR|INTERIOR|DRONE_ROOF|TARGETED   (default: DRONE_ROOF)
 *   --frames 8                                      (default: 8)
 *   --interval 10                                   (default: 10 seconds)
 *
 * Required env vars:
 *   OPENAI_API_KEY   — OpenAI API key (for GPT-4o)
 *   XAI_API_KEY      — xAI API key (for Grok Vision) — optional, skips if absent
 *
 * Output:
 *   /Volumes/4T Data/WARP TMP/reports/vision-eval-<timestamp>.md
 */

import OpenAI from 'openai';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Import prompts from API source ──────────────────────────────────────────
// We use require() with a relative path so ts-node resolves it without
// needing the full monorepo build.
const PROMPTS_PATH = path.resolve(__dirname, '../apps/api/src/modules/video-assessment/prompts.ts');

// Dynamic import won't work cleanly with ts-node across workspaces, so we'll
// inline-evaluate the exported constants. For simplicity, just re-export the
// prompt map keys and let the user pick.
let ASSESSMENT_PROMPTS: Record<string, string>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prompts = require(PROMPTS_PATH);
  ASSESSMENT_PROMPTS = prompts.ASSESSMENT_PROMPTS;
} catch {
  console.error('⚠️  Could not load prompts from API source. Using fallback.');
  ASSESSMENT_PROMPTS = {
    DRONE_ROOF: 'Analyze this drone roof imagery and return a JSON damage assessment.',
    EXTERIOR: 'Analyze this exterior property imagery and return a JSON damage assessment.',
    INTERIOR: 'Analyze this interior property imagery and return a JSON damage assessment.',
    TARGETED: 'Analyze this close-up damage imagery and return a JSON damage assessment.',
  };
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ModelConfig {
  name: string;
  provider: string;
  model: string;
  baseURL?: string;
  apiKeyEnv: string;
  supportsJsonMode: boolean;
}

interface Finding {
  zone: string;
  category: string;
  severity: string;
  causation: string;
  description: string;
  frameIndex: number;
  confidence: number;
  boundingBox?: any;
  costbookItemCode?: string | null;
  estimatedQuantity?: number | null;
  estimatedUnit?: string | null;
}

interface AssessmentResult {
  summary: {
    narrative: string;
    overallCondition: number;
    confidence: number;
    materialIdentified: string[];
    zonesAssessed: string[];
    primaryCausation: string;
    estimatedAge?: string;
  };
  findings: Finding[];
}

interface ModelResult {
  config: ModelConfig;
  assessment: AssessmentResult | null;
  rawResponse: string;
  latencyMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  error: string | null;
}

// ── Model registry ──────────────────────────────────────────────────────────

const MODELS: ModelConfig[] = [
  {
    name: 'GPT-4o',
    provider: 'OpenAI',
    model: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsJsonMode: true,
  },
  {
    name: 'Grok 4.1 Fast',
    provider: 'xAI',
    model: 'grok-4-1-fast-non-reasoning',
    baseURL: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    supportsJsonMode: true,
  },
  // Uncomment to add more:
  // {
  //   name: 'Gemini 2.0 Flash',
  //   provider: 'Google AI Studio',
  //   model: 'gemini-2.0-flash',
  //   baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  //   apiKeyEnv: 'GOOGLE_AI_API_KEY',
  //   supportsJsonMode: true,
  // },
];

// ── FFmpeg frame extraction ─────────────────────────────────────────────────

function findFFmpeg(): string {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function extractFrames(videoPath: string, intervalSecs: number, maxFrames: number): {
  frames: Array<{ base64: string; mimeType: string; index: number }>;
  tempDir: string;
  metadata: { fileName: string; durationSecs: number };
} {
  const ffmpeg = findFFmpeg();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-eval-'));
  const outputPattern = path.join(tempDir, 'frame_%04d.jpg');

  // Get duration
  const probeJson = execSync(
    `${ffmpeg.replace('ffmpeg', 'ffprobe')} -v quiet -print_format json -show_format "${videoPath}"`,
    { encoding: 'utf-8' },
  );
  const probe = JSON.parse(probeJson);
  const durationSecs = parseFloat(probe.format?.duration || '0');
  const fileName = path.basename(videoPath);

  console.log(`📹 Video: ${fileName} (${Math.round(durationSecs)}s)`);
  console.log(`🎞️  Extracting frames every ${intervalSecs}s (max ${maxFrames})…`);

  // Extract frames
  const vf = `fps=1/${intervalSecs},scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2`;
  execSync(`${ffmpeg} -i "${videoPath}" -vf "${vf}" -fps_mode vfr -q:v 2 "${outputPattern}" 2>/dev/null`, {
    encoding: 'utf-8',
  });

  // Read and base64-encode frames
  let framePaths = fs.readdirSync(tempDir)
    .filter(f => f.endsWith('.jpg'))
    .sort()
    .map(f => path.join(tempDir, f));

  // Downsample if too many
  if (framePaths.length > maxFrames) {
    const step = framePaths.length / maxFrames;
    framePaths = Array.from({ length: maxFrames }, (_, i) =>
      framePaths[Math.floor(i * step)]!,
    );
  }

  const frames = framePaths.map((fp, i) => ({
    base64: fs.readFileSync(fp).toString('base64'),
    mimeType: 'image/jpeg',
    index: i,
  }));

  console.log(`✅ Extracted ${frames.length} frames\n`);
  return { frames, tempDir, metadata: { fileName, durationSecs } };
}

// ── Run a single model ──────────────────────────────────────────────────────

async function runModel(
  config: ModelConfig,
  frames: Array<{ base64: string; mimeType: string }>,
  prompt: string,
): Promise<ModelResult> {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    return {
      config,
      assessment: null,
      rawResponse: '',
      latencyMs: 0,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      error: `Missing env var: ${config.apiKeyEnv}`,
    };
  }

  const client = new OpenAI({
    apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });

  // Build content parts
  const contentParts: OpenAI.ChatCompletionContentPart[] = [
    { type: 'text', text: prompt },
  ];
  for (const frame of frames) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${frame.mimeType};base64,${frame.base64}`,
        detail: 'high',
      },
    });
  }

  console.log(`  🤖 Running ${config.name} (${config.model})…`);
  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: contentParts }],
      max_tokens: 8192,
      temperature: 0.1,
      ...(config.supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    // Parse JSON from response
    let assessment: AssessmentResult | null = null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        assessment = JSON.parse(jsonMatch[0]) as AssessmentResult;
      } catch {
        // JSON parse failed
      }
    }

    console.log(`  ✅ ${config.name}: ${latencyMs}ms, ${assessment?.findings?.length ?? 0} findings`);

    return {
      config,
      assessment,
      rawResponse: content,
      latencyMs,
      tokenUsage: {
        prompt: usage?.prompt_tokens ?? 0,
        completion: usage?.completion_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
      },
      error: null,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    console.log(`  ❌ ${config.name}: error after ${latencyMs}ms — ${err?.message}`);
    return {
      config,
      assessment: null,
      rawResponse: '',
      latencyMs,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      error: err?.message || String(err),
    };
  }
}

// ── Report generation ───────────────────────────────────────────────────────

function generateReport(
  results: ModelResult[],
  metadata: { fileName: string; durationSecs: number },
  assessmentType: string,
  frameCount: number,
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const lines: string[] = [];

  lines.push(`# Vision Model Evaluation Report`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Video:** ${metadata.fileName} (${Math.round(metadata.durationSecs)}s)`);
  lines.push(`**Assessment Type:** ${assessmentType}`);
  lines.push(`**Frames Sent:** ${frameCount}`);
  lines.push('');

  // ── Summary comparison table ──
  lines.push('## Performance Summary');
  lines.push('');
  for (const r of results) {
    if (r.error) {
      lines.push(`### ${r.config.name} — ❌ SKIPPED`);
      lines.push(`- **Reason:** ${r.error}`);
      lines.push('');
      continue;
    }
    const a = r.assessment;
    lines.push(`### ${r.config.name} (${r.config.model})`);
    lines.push(`- **Latency:** ${(r.latencyMs / 1000).toFixed(1)}s`);
    lines.push(`- **Tokens:** ${r.tokenUsage.prompt} prompt + ${r.tokenUsage.completion} completion = ${r.tokenUsage.total} total`);
    lines.push(`- **Findings:** ${a?.findings?.length ?? 0}`);
    lines.push(`- **Overall Condition:** ${a?.summary?.overallCondition ?? 'N/A'}/5`);
    lines.push(`- **Confidence:** ${a?.summary?.confidence ?? 'N/A'}`);
    lines.push(`- **Materials Identified:** ${a?.summary?.materialIdentified?.join(', ') ?? 'N/A'}`);
    lines.push(`- **Primary Causation:** ${a?.summary?.primaryCausation ?? 'N/A'}`);
    lines.push(`- **Zones Assessed:** ${a?.summary?.zonesAssessed?.join(', ') ?? 'N/A'}`);
    lines.push(`- **Estimated Age:** ${a?.summary?.estimatedAge ?? 'N/A'}`);
    lines.push('');
  }

  // ── Narrative comparison ──
  const successResults = results.filter(r => r.assessment);
  if (successResults.length > 1) {
    lines.push('## Narrative Comparison');
    lines.push('');
    for (const r of successResults) {
      lines.push(`### ${r.config.name}`);
      lines.push(r.assessment!.summary.narrative);
      lines.push('');
    }

    // ── Material identification comparison ──
    lines.push('## Material Identification Comparison');
    lines.push('');
    lines.push('This is the #1 source of errors in property assessment. Compare carefully.');
    lines.push('');
    for (const r of successResults) {
      const mats = r.assessment!.summary.materialIdentified;
      lines.push(`**${r.config.name}:** ${mats?.join(', ') || 'none identified'}`);
    }
    lines.push('');

    // ── Finding-by-finding comparison ──
    lines.push('## Findings Comparison');
    lines.push('');

    // Group findings by zone for easier comparison
    const allZones = new Set<string>();
    for (const r of successResults) {
      for (const f of r.assessment!.findings) {
        allZones.add(f.zone);
      }
    }

    for (const zone of [...allZones].sort()) {
      lines.push(`### Zone: ${zone}`);
      lines.push('');
      for (const r of successResults) {
        const zoneFindings = r.assessment!.findings.filter(f => f.zone === zone);
        if (zoneFindings.length === 0) {
          lines.push(`**${r.config.name}:** _No findings for this zone_`);
          lines.push('');
          continue;
        }
        lines.push(`**${r.config.name}** (${zoneFindings.length} findings):`);
        for (const f of zoneFindings) {
          lines.push(`- **${f.category}** [${f.severity}] (confidence: ${f.confidence}) — ${f.description?.substring(0, 200)}`);
          lines.push(`  Causation: ${f.causation} | Frame: ${f.frameIndex}${f.estimatedQuantity ? ` | Est: ${f.estimatedQuantity} ${f.estimatedUnit}` : ''}`);
        }
        lines.push('');
      }
    }

    // ── Severity distribution ──
    lines.push('## Severity Distribution');
    lines.push('');
    for (const r of successResults) {
      const findings = r.assessment!.findings;
      const counts = { LOW: 0, MODERATE: 0, SEVERE: 0, CRITICAL: 0 };
      for (const f of findings) {
        if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
      }
      lines.push(`**${r.config.name}:** LOW=${counts.LOW} MODERATE=${counts.MODERATE} SEVERE=${counts.SEVERE} CRITICAL=${counts.CRITICAL}`);
    }
    lines.push('');

    // ── Causation comparison ──
    lines.push('## Causation Analysis');
    lines.push('');
    for (const r of successResults) {
      const findings = r.assessment!.findings;
      const causationCounts: Record<string, number> = {};
      for (const f of findings) {
        causationCounts[f.causation] = (causationCounts[f.causation] || 0) + 1;
      }
      const causationStr = Object.entries(causationCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}(${v})`)
        .join(', ');
      lines.push(`**${r.config.name}:** ${causationStr || 'none'}`);
    }
    lines.push('');
  }

  // ── JSON schema compliance ──
  lines.push('## JSON Schema Compliance');
  lines.push('');
  for (const r of results) {
    if (r.error) continue;
    const a = r.assessment;
    const checks: string[] = [];
    checks.push(a ? '✅ Valid JSON parsed' : '❌ JSON parse failed');
    checks.push(a?.summary ? '✅ summary object present' : '❌ summary missing');
    checks.push(a?.summary?.narrative ? '✅ narrative present' : '❌ narrative missing');
    checks.push(a?.summary?.materialIdentified?.length ? '✅ materials listed' : '⚠️ no materials');
    checks.push(a?.findings?.length ? `✅ findings array (${a.findings.length})` : '⚠️ no findings');
    if (a?.findings?.length) {
      const hasZones = a.findings.every(f => f.zone);
      const hasSeverity = a.findings.every(f => f.severity);
      const hasConfidence = a.findings.every(f => typeof f.confidence === 'number');
      checks.push(hasZones ? '✅ all findings have zone' : '❌ some findings missing zone');
      checks.push(hasSeverity ? '✅ all findings have severity' : '❌ some findings missing severity');
      checks.push(hasConfidence ? '✅ all findings have confidence' : '⚠️ some findings missing confidence');
    }
    lines.push(`### ${r.config.name}`);
    for (const c of checks) lines.push(`- ${c}`);
    lines.push('');
  }

  // ── Scoring guidance ──
  lines.push('## Manual Scoring Guide');
  lines.push('');
  lines.push("Review each model's output and score 1-10 for each criterion:");
  lines.push('');
  lines.push('- **Material Accuracy**: Did it correctly identify roofing/siding/etc. materials?');
  lines.push('- **Severity Calibration**: Are severity ratings appropriate for the visible damage?');
  lines.push('- **Causation Accuracy**: Did it correctly identify hail vs wind vs age vs other?');
  lines.push('- **Completeness**: Did it find all visible damage areas?');
  lines.push("- **False Positives**: Did it fabricate damage that isn't there?");
  lines.push('- **Description Quality**: Are descriptions specific and forensically useful?');
  lines.push('- **Schema Compliance**: Did it follow the exact JSON output format?');
  lines.push('');
  lines.push('| Criterion | GPT-4o | Grok Vision | Notes |');
  lines.push('|-----------|--------|-------------|-------|');
  lines.push('| Material Accuracy | /10 | /10 | |');
  lines.push('| Severity Calibration | /10 | /10 | |');
  lines.push('| Causation Accuracy | /10 | /10 | |');
  lines.push('| Completeness | /10 | /10 | |');
  lines.push('| False Positives | /10 | /10 | |');
  lines.push('| Description Quality | /10 | /10 | |');
  lines.push('| Schema Compliance | /10 | /10 | |');
  lines.push('| **TOTAL** | **/70** | **/70** | |');
  lines.push('');

  // ── Raw responses (truncated) ──
  lines.push('## Raw Responses (truncated to 2000 chars)');
  lines.push('');
  for (const r of results) {
    if (r.error) continue;
    lines.push(`### ${r.config.name}`);
    lines.push('```json');
    lines.push(r.rawResponse.substring(0, 2000));
    if (r.rawResponse.length > 2000) lines.push('… [truncated]');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse args
  const videoPath = args.find(a => !a.startsWith('--'));
  if (!videoPath) {
    console.error('Usage: npx ts-node scripts/eval-vision-models.ts <video-path> [--type DRONE_ROOF] [--frames 8] [--interval 10]');
    process.exit(1);
  }

  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video file not found: ${videoPath}`);
    process.exit(1);
  }

  const typeIdx = args.indexOf('--type');
  const assessmentType = typeIdx >= 0 ? (args[typeIdx + 1] || 'DRONE_ROOF') : 'DRONE_ROOF';

  const framesIdx = args.indexOf('--frames');
  const maxFrames = framesIdx >= 0 ? parseInt(args[framesIdx + 1] || '8', 10) : 8;

  const intervalIdx = args.indexOf('--interval');
  const intervalSecs = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1] || '10', 10) : 10;

  const prompt = ASSESSMENT_PROMPTS[assessmentType];
  if (!prompt) {
    console.error(`❌ Unknown assessment type: ${assessmentType}. Use: ${Object.keys(ASSESSMENT_PROMPTS).join(', ')}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Vision Model A/B Evaluation');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Extract frames
  const { frames, tempDir, metadata } = extractFrames(videoPath, intervalSecs, maxFrames);

  // Step 2: Run each model
  const activeModels = MODELS.filter(m => {
    const key = process.env[m.apiKeyEnv];
    if (!key) {
      console.log(`⏭️  Skipping ${m.name} — ${m.apiKeyEnv} not set`);
      return false;
    }
    return true;
  });

  if (activeModels.length === 0) {
    console.error('\n❌ No models available. Set at least OPENAI_API_KEY in your environment.');
    cleanup(tempDir);
    process.exit(1);
  }

  console.log(`\n🏁 Running ${activeModels.length} model(s) with ${frames.length} frames (${assessmentType})…\n`);

  // Run models sequentially to avoid rate limit issues
  const results: ModelResult[] = [];
  for (const model of activeModels) {
    const result = await runModel(model, frames, prompt);
    results.push(result);
  }

  // Also add skipped models to the report
  for (const model of MODELS) {
    if (!activeModels.includes(model)) {
      results.push({
        config: model,
        assessment: null,
        rawResponse: '',
        latencyMs: 0,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        error: `Skipped — ${model.apiKeyEnv} not set`,
      });
    }
  }

  // Step 3: Generate report
  console.log('\n📊 Generating comparison report…');
  const report = generateReport(results, metadata, assessmentType, frames.length);

  // Write report
  const outputDir = '/Volumes/4T Data/WARP TMP/reports';
  let outputPath: string;
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    outputPath = path.join(outputDir, `vision-eval-${ts}.md`);
  } catch {
    // Fallback to Desktop if 4T volume not mounted
    const fallbackDir = path.join(os.homedir(), 'Desktop');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    outputPath = path.join(fallbackDir, `vision-eval-${ts}.md`);
    console.log('⚠️  4T volume not mounted, writing to Desktop');
  }

  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`\n✅ Report saved: ${outputPath}`);

  // Summary to console
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Quick Summary');
  console.log('═══════════════════════════════════════════════════════════\n');
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.config.name}: ⏭️ ${r.error}`);
      continue;
    }
    const a = r.assessment!;
    console.log(`  ${r.config.name}:`);
    console.log(`    Latency:    ${(r.latencyMs / 1000).toFixed(1)}s`);
    console.log(`    Findings:   ${a.findings?.length ?? 0}`);
    console.log(`    Confidence: ${a.summary?.confidence ?? 'N/A'}`);
    console.log(`    Materials:  ${a.summary?.materialIdentified?.join(', ') ?? 'N/A'}`);
    console.log(`    Causation:  ${a.summary?.primaryCausation ?? 'N/A'}`);
    console.log(`    Tokens:     ${r.tokenUsage.total}`);
    console.log('');
  }

  cleanup(tempDir);
}

function cleanup(tempDir: string) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// Load env from .env file if present
try {
  const envPath = path.resolve(__dirname, '../apps/api/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/);
      if (match && !process.env[match[1]!]) {
        process.env[match[1]!] = match[2]!;
      }
    }
  }
  // Also load .env.shadow for OPENAI_API_KEY if not already set
  const shadowEnvPath = path.resolve(__dirname, '../.env.shadow');
  if (fs.existsSync(shadowEnvPath)) {
    const envContent = fs.readFileSync(shadowEnvPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?$/);
      if (match && !process.env[match[1]!]) {
        process.env[match[1]!] = match[2]!;
      }
    }
  }
} catch {
  // No env file — rely on environment
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
