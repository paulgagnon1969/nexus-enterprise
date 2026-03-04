import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const SYSTEM_DISPOSITIONS = [
  { code: "ACTIVE",     label: "In Service",         color: "#059669", sortOrder: 0, isTerminal: false },
  { code: "STORED",     label: "Stored / Available",  color: "#2563eb", sortOrder: 1, isTerminal: false },
  { code: "IN_REPAIR",  label: "In Repair",           color: "#d97706", sortOrder: 2, isTerminal: false },
  { code: "IN_RENT",    label: "Rented Out",          color: "#7c3aed", sortOrder: 3, isTerminal: false },
  { code: "IN_TRANSIT", label: "In Transit",          color: "#0891b2", sortOrder: 4, isTerminal: false },
  { code: "DISPOSED",   label: "Disposed / Sold",     color: "#6b7280", sortOrder: 5, isTerminal: true },
  { code: "LOST",       label: "Lost / Unaccounted",  color: "#dc2626", sortOrder: 6, isTerminal: true },
];

@Injectable()
export class DispositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure system-seeded dispositions exist for a company.
   * Called lazily on first list request.
   */
  async ensureSeeded(companyId: string): Promise<void> {
    const count = await this.prisma.assetDisposition.count({ where: { companyId } });
    if (count > 0) return;

    await this.prisma.assetDisposition.createMany({
      data: SYSTEM_DISPOSITIONS.map((d) => ({
        companyId,
        ...d,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  async list(companyId: string) {
    await this.ensureSeeded(companyId);
    return this.prisma.assetDisposition.findMany({
      where: { companyId },
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(companyId: string, input: { code: string; label: string; color?: string; isTerminal?: boolean }) {
    const maxSort = await this.prisma.assetDisposition.aggregate({
      where: { companyId },
      _max: { sortOrder: true },
    });
    return this.prisma.assetDisposition.create({
      data: {
        companyId,
        code: input.code.toUpperCase().replace(/\s+/g, "_"),
        label: input.label,
        color: input.color ?? null,
        isTerminal: input.isTerminal ?? false,
        isSystem: false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(companyId: string, id: string, input: { label?: string; color?: string; sortOrder?: number; isTerminal?: boolean }) {
    const existing = await this.prisma.assetDisposition.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Disposition not found");

    const data: any = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.color !== undefined) data.color = input.color;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isTerminal !== undefined) {
      if (existing.isSystem) throw new ForbiddenException("Cannot change isTerminal on system dispositions");
      data.isTerminal = input.isTerminal;
    }

    return this.prisma.assetDisposition.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    const existing = await this.prisma.assetDisposition.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Disposition not found");
    if (existing.isSystem) throw new ForbiddenException("Cannot delete system dispositions");

    // Check if any assets use this disposition
    const usageCount = await this.prisma.asset.count({ where: { dispositionId: id } });
    if (usageCount > 0) {
      throw new ForbiddenException(`Cannot delete: ${usageCount} asset(s) currently use this disposition`);
    }

    return this.prisma.assetDisposition.delete({ where: { id } });
  }
}
