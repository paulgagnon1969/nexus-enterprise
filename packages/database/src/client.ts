import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Central PrismaClient instance for the shared database package.
//
// Prisma 7 defaults the client engine to "client". In this mode, an
// adapter (or accelerateUrl) is required. We use the official Postgres
// driver adapter so all consumers of @repo/database share the same
// configuration.

let client: PrismaClient | null = null;

function createClient(): PrismaClient {
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

function getClient(): PrismaClient {
  if (!client) {
    client = createClient();
  }
  return client;
}

// Export a lazy proxy so existing call sites can keep using
// `prisma.model.findMany()` without change while we initialize the
// underlying PrismaClient on first use.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const real = getClient();
    return Reflect.get(real, prop, receiver);
  },
}) as PrismaClient;

export default prisma;
