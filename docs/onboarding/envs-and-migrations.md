# Nexus Environments & Migrations: Mental Model

This doc explains **which database you are talking to** during development, and how to safely move changes from **dev → (optional test) → prod**.

The key is to separate:

- **Code changes** (TypeScript/React/Nest) → live only in your local repo until deployed.
- **Database changes** (Prisma migrations / data updates) → affect whichever Cloud SQL instance your `DATABASE_URL` points to.

---

## 1. Current environment wiring (as used in dev-stack)

Right now, your default "golden path" stack is:

- Cloud SQL proxy:
  
  ```bash
  cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusprod-v2
  ```

- API dev server:
  
  ```bash
  export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
  bash ./scripts/dev-api-cloud-db.sh
  ```

This means:

- **All Prisma queries and writes from the API** go to the **prod Cloud SQL instance**.
- Any scripts you run with the same `DATABASE_URL` (e.g. `npx prisma migrate deploy`) will also hit prod.

You have a **dev** Cloud SQL instance (`nexusdev-v2`) that we can and should use for day-to-day schema work and more experimental testing.

---

## 2. Target model: dev → test → prod

Logical environments:

1. **Dev DB** (`nexusdev-v2`)
   - Safe place to:
     - Create and test new Prisma models/migrations
     - Run import scripts (Xact CSV, Simple PETL, price lists)
     - Try destructive changes
   - Can be reset/reseeded more aggressively.

2. **(Optional) Test / Staging DB**
   - Could be a separate Cloud SQL instance or schema.
   - Mirrors prod structure with sanitized or copied data.
   - Used for final verification before prod.
   - Not strictly required yet; you can treat **dev DB** as your non-prod environment for now.

3. **Prod DB** (`nexusprod-v2`)
   - Real / canonical data.
   - Only receive changes that have:
     - Been applied and verified on dev DB first.
     - Been reviewed from a migration / backup standpoint.

---

## 3. How to point local dev at **dev DB** vs **prod DB**

### 3.1 Using the dev DB (recommended for everyday work)

1. Start proxy to **dev** instance:
   
   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusdev-v2
   ```

2. In another terminal, start API with `DATABASE_URL` pointing at dev:
   
   ```bash
   cd /Users/pg/nexus-enterprise
   export DATABASE_URL="postgresql://postgres:<DEV_PASSWORD>@127.0.0.1:5433/nexus_db"
   bash ./scripts/dev-api-cloud-db.sh
   ```

3. Start web dev as usual:
   
   ```bash
   cd /Users/pg/nexus-enterprise/apps/web
   npm run dev
   ```

All reads/writes now go to **nexusdev-v2**, not prod.

### 3.2 Using the prod DB (only when you really intend to)

1. Start proxy to **prod** instance:
   
   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusprod-v2
   ```

2. Use the prod `DATABASE_URL`:
   
   ```bash
   export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
   bash ./scripts/dev-api-cloud-db.sh
   ```

Only use this when you explicitly want to:

- Inspect prod data behavior
- Debug issues that only appear with real data

For schema changes, **never start on prod**; always go Dev → Prod.

---

## 4. Prisma migration workflow (Dev → Prod)

Prisma migrations live under:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/*`

### 4.1 Create & apply a new migration on **dev DB**

1. Ensure your stack is pointed at **dev DB** (see section 3.1) and the proxy is running to `nexusdev-v2`.

2. From `packages/database`:
   
   ```bash
   cd /Users/pg/nexus-enterprise/packages/database

   # Point Prisma CLI at dev DB
   export DATABASE_URL="postgresql://postgres:<DEV_PASSWORD>@127.0.0.1:5433/nexus_db"

   # Edit prisma/schema.prisma as needed
   # Then create + apply a new migration on dev:
   npx prisma migrate dev --name add_some_feature --schema ./prisma/schema.prisma
   ```

This will:

- Update the dev DB schema.
- Create a new folder under `prisma/migrations/*` tracked in git.

3. Verify behavior via API + web pointed at dev DB.

### 4.2 Apply the same migrations to **prod DB**

Once you’re happy with the migration on dev:

1. Start proxy to **prod** instance:
   
   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusprod-v2
   ```

2. From `packages/database`:
   
   ```bash
   cd /Users/pg/nexus-enterprise/packages/database

   export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"

   # Apply all existing migrations to prod (no new ones created)
   npx prisma migrate deploy --schema ./prisma/schema.prisma
   ```

This will:

- Look at the migrations already in git.
- Apply any pending ones to the prod DB.

**Important:** Do **not** run `prisma migrate dev` against prod. Always use `migrate dev` on dev DB and `migrate deploy` on prod DB.

---

## 5. Data-manipulation scripts (imports, password resets, etc.)

Any Node / ts-node script or ad-hoc Node snippet that uses `PrismaClient` or `@repo/database` will talk to **whatever DB `DATABASE_URL` is set to**.

Examples:

- Importing an Xactimate CSV into PETL
- Importing a price list into `ComponentCatalog` / `ComponentPrice`
- Manual password resets using a Node script

### Safe practice

1. For **experiments** or new scripts:
   - Run them only against **dev DB**.

2. Once a script is trustworthy and idempotent:
   - Re-run it against prod only when needed, with `DATABASE_URL` pointed at prod and the Cloud SQL proxy targeting `nexusprod-v2`.

Always double-check `DATABASE_URL` before running anything that writes.

You can quickly echo it:

```bash
echo "$DATABASE_URL"
```

Or see what the running API process is using (look for `DATABASE_URL=` in `ps eww <PID>` for the API PID).

---

## 6. Recommended day-to-day flow

### Normal development (UI + API + schema work)

1. Start proxy to **dev DB** (`nexusdev-v2`).
2. Start API with `DATABASE_URL` pointing at dev.
3. Run Prisma migrations with `prisma migrate dev` against dev DB.
4. Start web dev server; build and test features.

### Before pushing schema changes to prod

1. Commit migration files under `packages/database/prisma/migrations`.
2. Start proxy to **prod DB** (`nexusprod-v2`).
3. Run `prisma migrate deploy` with prod `DATABASE_URL`.
4. Optionally restart any long-running prod services (if/when you have a deployed API hitting prod).

### When in doubt

- If something looks scary, point everything at **dev DB** first.
- Use `lsof -ti:5433,8000,3000` and `/health` to confirm what’s actually running.
- Confirm `DATABASE_URL` before running migrations or scripts.

This model keeps day-to-day development safe on dev DB while still letting you intentionally propagate known-good changes to prod when you’re ready.