import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import prisma from "../client";
import {
  buildCertifiedPayrollRows,
  buildSourcesForProjectWeek,
  type CertifiedPayrollRow,
} from "../certified-payroll";

/**
 * Validate our generated Certified Payroll CSV for CBS/CCT against the
 * original LCPUpload Template WW51 CSV.
 *
 * Usage (from repo root):
 *   DATABASE_URL=... ts-node packages/database/src/scripts/validate-lcp-ww51.ts
 */
async function main() {
  const companyId = process.env.BIA_COMPANY_ID ?? "cmjqzic0v0003vtkv7s2jmylo"; // Nexus Fortified Structures

  const CBS_PROJECT_ID = process.env.CBS_PROJECT_ID ?? "cmjwr51ve00119ekvetnc9fri";
  const CCT_PROJECT_ID = process.env.CCT_PROJECT_ID ?? "cmjwr58sx00159ekvo6vjsbo9";

  // Use the same string form that was present in the source CSV (MM/DD/YY)
  // so the Date instance matches what import-bia-lcp-payroll.ts used.
  const weekEndDate = new Date("12/18/25");

  const root = path.resolve(__dirname, "../../../.." );
  const ww51Path = path.join(
    root,
    "docs/data/20251231 - BIA Time sheerts split to CSV/Revised LCP - TG/LCPUpload Template WW51.csv",
  );

  if (!fs.existsSync(ww51Path)) {
    throw new Error(`WW51 template not found at ${ww51Path}`);
  }

  const raw = fs.readFileSync(ww51Path, "utf8");
  const originalRows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as any[];

  type Key = string;
  type SimpleRow = {
    projectCode: string;
    firstName: string;
    lastName: string;
    gross: number;
    st: number[];
    ot: number[];
    dt: number[];
  };

  function makeKey(projectCode: string, first: string, last: string): Key {
    return [
      projectCode.trim().toUpperCase(),
      first.trim().toUpperCase(),
      last.trim().toUpperCase(),
    ].join("|");
  }

  function parseNumber(v: any): number {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  const origByKey = new Map<Key, SimpleRow>();

  for (const row of originalRows) {
    const projectCode = (row["project_code"] || "").trim();
    if (!projectCode) continue;

    const gross = parseNumber(row["gross_employee_pay"]);
    if (!gross) continue; // skip empty template rows or zero-pay lines

    const first = (row["first_name"] || "").trim();
    const last = (row["last_name"] || "").trim();
    if (!first && !last) continue;

    const st: number[] = [];
    const ot: number[] = [];
    const dt: number[] = [];
    for (let i = 1; i <= 7; i++) {
      st.push(parseNumber(row[`st_hrs_date${i}`]));
      ot.push(parseNumber(row[`ov_hrs_date${i}`]));
      dt.push(parseNumber(row[`ov_hrsx2_date${i}`]));
    }

    origByKey.set(makeKey(projectCode, first, last), {
      projectCode,
      firstName: first,
      lastName: last,
      gross,
      st,
      ot,
      dt,
    });
  }

  async function loadGeneratedForProject(
    projectId: string,
  ): Promise<{ rows: CertifiedPayrollRow[]; byKey: Map<Key, SimpleRow> }> {
    const sources = await buildSourcesForProjectWeek({
      companyId,
      projectId,
      weekEndDate,
    });

    const rows = await buildCertifiedPayrollRows(sources);

    const byKey = new Map<Key, SimpleRow>();
    for (const r of rows) {
      const projectCode = (r.project_code ?? "").trim();
      const first = (r.first_name ?? "").trim();
      const last = (r.last_name ?? "").trim();
      if (!projectCode || (!first && !last)) continue;

      const st: number[] = [];
      const ot: number[] = [];
      const dt: number[] = [];
      for (let i = 1; i <= 7; i++) {
        st.push(r[`st_hrs_date${i}`] as number);
        ot.push(r[`ov_hrs_date${i}`] as number);
        dt.push(r[`ov_hrsx2_date${i}`] as number);
      }

      byKey.set(makeKey(projectCode, first, last), {
        projectCode,
        firstName: first,
        lastName: last,
        gross: r.gross_employee_pay,
        st,
        ot,
        dt,
      });
    }

    return { rows, byKey };
  }

  async function validateLabel(label: string, projectId: string, expectedProjectCode: string) {
    console.log(`\n=== Validating ${label} (${expectedProjectCode}) ===`);

    const { byKey } = await loadGeneratedForProject(projectId);

    const keysForProject = Array.from(origByKey.entries())
      .filter(([k, v]) => v.projectCode.toUpperCase() === expectedProjectCode.toUpperCase())
      .map(([k]) => k);

    let matched = 0;
    let missing = 0;
    let mismatched = 0;

    for (const key of keysForProject) {
      const orig = origByKey.get(key)!;
      const gen = byKey.get(key);

      if (!gen) {
        missing++;
        console.log(`MISSING in generated: ${orig.projectCode} ${orig.firstName} ${orig.lastName}`);
        continue;
      }

      const diffs: string[] = [];

      if (Math.abs(orig.gross - gen.gross) > 0.01) {
        diffs.push(`gross ${orig.gross} vs ${gen.gross}`);
      }

      function cmpArr(name: string, a: number[], b: number[]) {
        for (let i = 0; i < 7; i++) {
          if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 0.001) {
            diffs.push(
              `${name}[${i + 1}] ${a[i] ?? 0} vs ${b[i] ?? 0}`,
            );
          }
        }
      }

      cmpArr("st", orig.st, gen.st);
      cmpArr("ot", orig.ot, gen.ot);
      cmpArr("dt", orig.dt, gen.dt);

      if (diffs.length) {
        mismatched++;
        console.log(
          `DIFF for ${orig.projectCode} ${orig.firstName} ${orig.lastName}: ${diffs.join(", ")}`,
        );
      } else {
        matched++;
      }
    }

    console.log(`Summary for ${label}: matched=${matched}, mismatched=${mismatched}, missing=${missing}`);
  }

  await validateLabel("CBS", CBS_PROJECT_ID, "CBS");
  await validateLabel("CCT", CCT_PROJECT_ID, "CCT");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
