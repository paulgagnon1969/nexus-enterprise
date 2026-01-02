import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import prisma from "../client";

/**
 * Backfill PayrollWeekRecord rows from the BIA/Tapout LCPUpload Template
 * CSVs in the Revised LCP - TG directory.
 *
 * Usage (from repo root):
 *   BIA_COMPANY_ID=<company-id> ts-node packages/database/src/scripts/import-bia-lcp-payroll.ts
 */
async function main() {
  const companyId = process.env.BIA_COMPANY_ID;
  if (!companyId) {
    throw new Error("BIA_COMPANY_ID env var is required");
  }

  const root = path.resolve(__dirname, "../../../.." );
  const baseDir = path.join(
    root,
    "docs/data/20251231 - BIA Time sheerts split to CSV/Revised LCP - TG",
  );

  const files = fs
    .readdirSync(baseDir)
    .filter((f) => /^LCPUpload Template WW\d+\.csv$/i.test(f));

  console.log("Found LCPUpload templates:", files);

  for (const file of files) {
    const fullPath = path.join(baseDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as any[];

    // Derive week code from filename, e.g. "LCPUpload Template WW51.csv" -> "WW51".
    const weekMatch = file.match(/WW(\d+)/i);
    const weekCode = weekMatch ? `WW${weekMatch[1]}` : null;

    console.log(`Processing ${file} (${records.length} rows)`);

    for (const row of records) {
      const projectCode = (row["project_code"] || "").trim();
      const weekEndRaw = (row["week_end_date"] || "").trim();
      const employeeId = (row["employee_ID"] || "").trim() || null;
      const firstName = (row["first_name"] || row["first_name "] || "").trim() || null;
      const lastName = (row["last_name"] || row["last_name "] || "").trim() || null;
      const ssn = (row["ssn"] || "").trim() || null;
      const classCode = (row["class_code"] || "").trim() || null;

      if (!projectCode && !employeeId) {
        continue;
      }

      if (!weekEndRaw) {
        continue;
      }

      const weekEndDate = new Date(weekEndRaw);
      if (Number.isNaN(weekEndDate.getTime())) {
        console.warn("Skipping row with invalid week_end_date", weekEndRaw);
        continue;
      }

      const grossStr = (row["gross_employee_pay"] || "").trim();
      const totalPay = grossStr ? Number(grossStr) : 0;
      if (!totalPay) {
        // Skip rows without pay; they may be empty template rows.
        continue;
      }

      const st: number[] = [];
      const ot: number[] = [];
      const dt: number[] = [];

      for (let i = 1; i <= 7; i++) {
        const stStr = (row[`st_hrs_date${i}`] || "").trim();
        const otStr = (row[`ov_hrs_date${i}`] || "").trim();
        const dtStr = (row[`ov_hrsx2_date${i}`] || "").trim();
        st.push(stStr ? Number(stStr) : 0);
        ot.push(otStr ? Number(otStr) : 0);
        dt.push(dtStr ? Number(dtStr) : 0);
      }

      const totalHoursSt = st.reduce((a, b) => a + b, 0);
      const totalHoursOt = ot.reduce((a, b) => a + b, 0);
      const totalHoursDt = dt.reduce((a, b) => a + b, 0);

      const dailyHoursJson = JSON.stringify(
        st.map((v, idx) => ({ st: v, ot: ot[idx], dt: dt[idx] })),
      );

      try {
        if (!employeeId) {
          // For legacy rows without an explicit employee_ID, just create
          // a record; duplicates are unlikely in this dataset.
          await prisma.payrollWeekRecord.create({
            data: {
              companyId,
              projectId: null,
              projectCode,
              workerId: null,
              employeeId: null,
              firstName,
              lastName,
              ssn,
              classCode,
              weekCode,
              weekEndDate,
              employmentType: "CONTRACTOR_1099",
              baseHourlyRate: null,
              dayRate: null,
              dayRateBaseHours: null,
              totalPay,
              totalHoursSt,
              totalHoursOt,
              totalHoursDt,
              dailyHoursJson: dailyHoursJson as any,
            },
          });
        } else {
          await prisma.payrollWeekRecord.upsert({
            where: {
              PayrollWeek_company_proj_week_emp_key: {
                companyId,
                projectCode,
                weekEndDate,
                employeeId,
              },
            },
            update: {
              firstName,
              lastName,
              ssn,
              classCode,
              weekCode,
              totalPay,
              totalHoursSt,
              totalHoursOt,
              totalHoursDt,
              dailyHoursJson: dailyHoursJson as any,
            },
            create: {
              companyId,
              projectId: null,
              projectCode,
              workerId: null,
              employeeId,
              firstName,
              lastName,
              ssn,
              classCode,
              weekCode,
              weekEndDate,
              employmentType: "CONTRACTOR_1099",
              baseHourlyRate: null,
              dayRate: null,
              dayRateBaseHours: null,
              totalPay,
              totalHoursSt,
              totalHoursOt,
              totalHoursDt,
              dailyHoursJson: dailyHoursJson as any,
            },
          });
        }
      } catch (err) {
        console.error("Error upserting PayrollWeekRecord", { file, employeeId, weekEndRaw, projectCode, err });
        throw err;
      }
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
