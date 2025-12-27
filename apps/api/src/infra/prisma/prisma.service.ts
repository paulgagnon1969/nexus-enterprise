import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL env var is required for PrismaService. Set it before starting the API.",
      );
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    // Prisma 7 defaults to the "client" engine, which requires an adapter
    // (or accelerateUrl). We use the official Postgres driver adapter.
    super({
      adapter,
      log: [],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Backwards-compatible alias so existing this.prisma.client.* calls still work
  get client() {
    return this as PrismaClient;
  }
}
