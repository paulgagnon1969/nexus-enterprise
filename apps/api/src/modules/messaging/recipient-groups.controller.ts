import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

interface UpsertGroupDto {
  name: string;
  members?: {
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  }[];
}

@Controller("messages/recipient-groups")
@UseGuards(JwtAuthGuard)
export class RecipientGroupsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    if (!actor.companyId) return [];

    return this.prisma.messageRecipientGroup.findMany({
      where: {
        companyId: actor.companyId,
        ownerId: actor.userId,
      },
      orderBy: { name: "asc" },
      include: {
        members: true,
      },
    });
  }

  @Post()
  async create(@Req() req: any, @Body() body: UpsertGroupDto) {
    const actor = req.user as AuthenticatedUser;
    if (!actor.companyId) {
      throw new Error("Missing company context");
    }

    const name = (body.name || "").trim();
    if (!name) {
      throw new Error("Group name is required");
    }

    const members = Array.isArray(body.members) ? body.members : [];

    return this.prisma.$transaction(async tx => {
      const group = await tx.messageRecipientGroup.create({
        data: {
          companyId: actor.companyId!,
          ownerId: actor.userId,
          name,
        },
      });

      if (members.length) {
        await tx.messageRecipientGroupMember.createMany({
          data: members.map(m => ({
            groupId: group.id,
            userId: m.userId || null,
            email: m.email || null,
            phone: m.phone || null,
            name: m.name || null,
            isExternal: !!(m.email || m.phone) && !m.userId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.messageRecipientGroup.findUnique({
        where: { id: group.id },
        include: { members: true },
      });
    });
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    if (!actor.companyId) {
      throw new Error("Missing company context");
    }

    await this.prisma.messageRecipientGroup.deleteMany({
      where: {
        id,
        companyId: actor.companyId,
        ownerId: actor.userId,
      },
    });

    return { success: true };
  }
}
