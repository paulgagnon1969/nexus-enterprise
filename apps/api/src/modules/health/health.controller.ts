import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async getHealth() {
    // For now, just confirm DB connectivity via a trivial code path; we do not
    // depend on a raw SQL call here while stabilizing Prisma typings.
    // If this call throws, Nest will surface a 500 and the health check will fail.
    await this.prisma.$connect();

    const now = new Date();

    let redisStatus: string;
    try {
      const redisClient = this.redis.getClient();
      const redisPing = await redisClient.ping();
      redisStatus = redisPing;
    } catch (e) {
      // Redis might not be available in some environments (like Cloud Run)
      redisStatus = "unreachable";
    }

    return {
      ok: true,
      dbTime: now,
      redis: redisStatus,
    };
  }
}
