import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  // Liveness: process is up and able to respond.
  @Get()
  async getHealth() {
    return {
      ok: true,
      time: new Date().toISOString(),
    };
  }

  // Readiness: core dependencies (Postgres + Redis) are reachable.
  @Get("deps")
  async getDepsHealth() {
    // If this throws, Nest will surface a 5xx and the health check fails.
    await this.prisma.$queryRaw`SELECT 1`;

    let redisStatus: string;
    try {
      const redisClient = this.redis.getClient();
      const redisPing = await redisClient.ping();
      redisStatus = redisPing;
    } catch (e) {
      // Redis might not be available in some environments (e.g., dev without REDIS_USE_REAL=true).
      redisStatus = "unreachable";
    }

    return {
      ok: true,
      db: "ok",
      redis: redisStatus,
      time: new Date().toISOString(),
    };
  }
}
