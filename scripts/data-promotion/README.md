# Data promotion and seeded data

This folder contains **non-committed** helpers for moving specific slices of
Postgres data between environments. The goal is:

- Everything structural / fake lives in git (seeds + fixtures).
- Real data that you tested with in dev is promoted **manually** via export →
  review → import scripts, and the raw files never go into git.

## Layers

We follow a 3-layer model:

1. **Seed data (Layer A)** – structural / reference data
   - Example: roles, statuses, tag categories, minimal templates.
   - Lives in version control (e.g. `scripts/seed-reference-data.ts` or
     `prisma/seed.ts`).
   - Safe to run in every environment.

2. **Test fixtures (Layer B)** – realistic but fake data for dev
   - Example: 5–10 fake projects, fake clients, fake logs.
   - Lives in git under a `fixtures/` folder and is clearly synthetic.
   - Loaded by a script like `scripts/load-test-fixtures.ts`.

3. **Selective promotion (Layer C)** – real data you tested with
   - Example: a specific project and its logs that you want to copy from dev →
     staging → prod.
   - Exported to files locally, manually reviewed, then imported.
   - Files live under `promotion/` and are **gitignored**.

This `scripts/data-promotion` folder is for **Layer C** helper scripts.

## Quick-start workflow (dev → prod)

1. **Export** from the source environment (usually dev):

   - Ensure `DATABASE_URL` points at the source DB.
   - Run `export-selected.ts` with the IDs you care about:

   ```bash
   # from repo root
   cd scripts/data-promotion
   npx tsx export-selected.ts --projects cm123,cm456 --output-dir ../../promotion/2026-01-02
   ```

   This writes JSON files (e.g. `projects.json`, `daily-logs.json`) into a
   dated folder under `promotion/`.

2. **Review & sanitize** the exported files:

   - Open them in an editor.
   - Remove anything you do **not** want in the target environment.
   - Optionally scrub fields like emails, phone numbers, or notes if needed.

3. **Import** into the target environment (e.g. prod):

   - Point `DATABASE_URL` at the target DB.
   - Run `import-to-env.ts` against the reviewed files:

   ```bash
   cd scripts/data-promotion
   npx tsx import-to-env.ts --input-dir ../../promotion/2026-01-02
   ```

   The script will insert the selected rows into the target DB. You can extend
   the logic to perform deletes/updates if you want a full "replace".

## Safety

- The `promotion/` directory and JSON/CSV outputs from these scripts are
  **ignored by git** (see root `.gitignore`).
- Scripts are small and explicit so you can easily see what tables and fields
  are touched.
- Prefer running these from a bastion / admin environment where `DATABASE_URL`
  is carefully set, not from random laptops.

Extend `export-selected.ts` / `import-to-env.ts` as your domain grows (e.g.
include onboarding sessions, Nexis profiles, reputation ratings, etc.).
