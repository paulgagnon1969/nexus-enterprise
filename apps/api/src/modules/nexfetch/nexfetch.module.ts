import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";

/**
 * NexFetch module — Receipt Email Puller & Auto-Matcher.
 *
 * This module currently exposes standalone functions (parsers, matcher,
 * bill-creator) consumed by the CLI import script.  The NestJS module
 * registration is here so NexFetch services can be injected into
 * controllers or other modules when we add API endpoints later
 * (e.g. /api/nexfetch/import, /api/nexfetch/status).
 */
@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class NexFetchModule {}
