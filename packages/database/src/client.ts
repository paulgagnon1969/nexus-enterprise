// NOTE: We intentionally avoid importing PrismaClient as a typed symbol here
// because frontend-only builds (e.g. Vercel web) may run TypeScript before
// `prisma generate` has executed, leaving @prisma/client in its stub state
// without a PrismaClient type. To keep builds green in those environments
// while still working at runtime on the API side, we treat the client as `any`.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require("@prisma/client") as any;
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Soft type alias so the rest of this file can annotate variables without
// requiring generated Prisma types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClientType = any;

// Central PrismaClient instance for the shared database package.
//
// Prisma 7 defaults the client engine to "client". In this mode, an
// adapter (or accelerateUrl) is required. We use the official Postgres
// driver adapter so all consumers of @repo/database share the same
// configuration.

let client: PrismaClientType | null = null;

function createClient(): PrismaClientType {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL env var is required for @repo/database. Set it before using PrismaClient.",
    );
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    // Keep logging minimal by default; callers can override via $extends
    // if they need query logging.
    log: [],
  });
}

function getClient(): PrismaClientType {
  if (!client) {
    client = createClient();
  }
  return client;
}

// Export a lazy proxy so existing call sites can keep using
// `prisma.model.findMany()` without change while we initialize the
// underlying PrismaClient on first use.
const prisma = new Proxy({} as PrismaClientType, {
  get(_target, prop, receiver) {
    const real = getClient();
    return Reflect.get(real, prop, receiver);
  },
}) as PrismaClient;

export default prisma;
