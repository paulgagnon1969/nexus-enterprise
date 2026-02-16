import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CreatePublicationGroupDto, UpdatePublicationGroupDto } from "./dto/publication-group.dto";

@Injectable()
export class PublicationGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroups() {
    return this.prisma.publicationGroup.findMany({
      include: {
        _count: { select: { members: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async getGroup(id: string) {
    const group = await this.prisma.publicationGroup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        members: {
          include: {
            company: { select: { id: true, name: true } },
          },
          orderBy: { company: { name: "asc" } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException("Publication group not found");
    }

    return group;
  }

  async createGroup(userId: string, dto: CreatePublicationGroupDto) {
    // Check for duplicate code
    const existing = await this.prisma.publicationGroup.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Publication group with code "${dto.code}" already exists`);
    }

    const group = await this.prisma.publicationGroup.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        createdByUserId: userId,
      },
      include: {
        _count: { select: { members: true } },
      },
    });

    // Add initial members if provided
    if (dto.companyIds && dto.companyIds.length > 0) {
      await this.prisma.publicationGroupMember.createMany({
        data: dto.companyIds.map((companyId) => ({
          groupId: group.id,
          companyId,
        })),
        skipDuplicates: true,
      });
    }

    return this.getGroup(group.id);
  }

  async updateGroup(id: string, dto: UpdatePublicationGroupDto) {
    const group = await this.prisma.publicationGroup.findUnique({
      where: { id },
    });

    if (!group) {
      throw new NotFoundException("Publication group not found");
    }

    // Check code uniqueness if changing
    if (dto.code && dto.code !== group.code) {
      const existing = await this.prisma.publicationGroup.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new ConflictException(`Publication group with code "${dto.code}" already exists`);
      }
    }

    return this.prisma.publicationGroup.update({
      where: { id },
      data: {
        code: dto.code ?? group.code,
        name: dto.name ?? group.name,
        description: dto.description ?? group.description,
      },
      include: {
        _count: { select: { members: true } },
      },
    });
  }

  async deleteGroup(id: string) {
    const group = await this.prisma.publicationGroup.findUnique({
      where: { id },
    });

    if (!group) {
      throw new NotFoundException("Publication group not found");
    }

    await this.prisma.publicationGroup.delete({
      where: { id },
    });

    return { success: true };
  }

  async updateMembers(groupId: string, companyIds: string[]) {
    const group = await this.prisma.publicationGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException("Publication group not found");
    }

    // Replace all members with the new list
    await this.prisma.$transaction([
      this.prisma.publicationGroupMember.deleteMany({
        where: { groupId },
      }),
      this.prisma.publicationGroupMember.createMany({
        data: companyIds.map((companyId) => ({
          groupId,
          companyId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.getGroup(groupId);
  }

  async getMembers(groupId: string) {
    const group = await this.prisma.publicationGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException("Publication group not found");
    }

    return this.prisma.publicationGroupMember.findMany({
      where: { groupId },
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { company: { name: "asc" } },
    });
  }

  /**
   * Get company IDs for a group (used by publish endpoint)
   */
  async getGroupCompanyIds(groupId: string): Promise<string[]> {
    const members = await this.prisma.publicationGroupMember.findMany({
      where: { groupId },
      select: { companyId: true },
    });
    return members.map((m) => m.companyId);
  }
}
