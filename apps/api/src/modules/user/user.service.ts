import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        memberships: {
          select: {
            companyId: true,
            role: true,
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });
  }
}
