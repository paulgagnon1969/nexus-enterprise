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
    const dbTime = await this.prisma.$queryRawUnsafe<
      { now: Date }[]
    >("SELECT NOW()");

    const redisClient = this.redis.getClient();
    const redisPing = await redisClient.ping();

    return {
      ok: true,
      dbTime: dbTime[0]?.now,
      redis: redisPing
    };
  }
}
