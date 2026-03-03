import { defineConfig } from "prisma/config";

// Note: For Prisma Client generation (including in Docker/Cloud Build), we don't
// actually need a live database connection. We just need a syntactically valid
// connection string. At runtime, the real DATABASE_URL is consumed via the
// PrismaPg adapter in packages/database/src/client.ts.
const url =
  process.env.DATABASE_URL ??
  "postgresql://nexus_user:nexus_password@localhost:5433/NEXUSDEVv3";

const shadowUrl =
  process.env.SHADOW_DATABASE_URL ??
  "postgresql://nexus_user:nexus_password@localhost:5434/nexus_shadow";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url,
    shadowDatabaseUrl: shadowUrl,
  },
});
