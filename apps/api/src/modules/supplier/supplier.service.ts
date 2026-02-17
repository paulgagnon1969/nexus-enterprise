import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { Role, SupplierTagCategory } from "@prisma/client";

interface AuthenticatedUser {
  userId: string;
  companyId?: string;
  role?: Role;
  globalRole?: string;
}

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== SUPPLIER TAGS ====================

  async listTags(companyId: string, category?: SupplierTagCategory) {
    return this.prisma.supplierTag.findMany({
      where: {
        companyId,
        ...(category ? { category } : {}),
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });
  }

  async createTag(
    companyId: string,
    data: {
      category: SupplierTagCategory;
      code: string;
      label: string;
      color?: string;
    }
  ) {
    return this.prisma.supplierTag.create({
      data: {
        companyId,
        category: data.category,
        code: data.code.toUpperCase(),
        label: data.label,
        color: data.color,
      },
    });
  }

  async updateTag(
    tagId: string,
    companyId: string,
    data: { label?: string; color?: string; sortOrder?: number }
  ) {
    const tag = await this.prisma.supplierTag.findFirst({
      where: { id: tagId, companyId },
    });
    if (!tag) throw new NotFoundException("Tag not found");

    return this.prisma.supplierTag.update({
      where: { id: tagId },
      data,
    });
  }

  async deleteTag(tagId: string, companyId: string) {
    const tag = await this.prisma.supplierTag.findFirst({
      where: { id: tagId, companyId },
    });
    if (!tag) throw new NotFoundException("Tag not found");

    return this.prisma.supplierTag.delete({ where: { id: tagId } });
  }

  // ==================== SUPPLIERS ====================

  async listSuppliers(
    companyId: string,
    options?: {
      tagIds?: string[];
      search?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { companyId };

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { defaultContactName: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options?.tagIds?.length) {
      where.tagAssignments = {
        some: { tagId: { in: options.tagIds } },
      };
    }

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: {
          tagAssignments: {
            include: { tag: true },
          },
          contacts: {
            where: { isActive: true },
            orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          },
          _count: {
            select: { bidRecipients: true },
          },
        },
        orderBy: { name: "asc" },
        take: options?.limit,
        skip: options?.offset,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { suppliers, total };
  }

  async getSupplier(supplierId: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
      include: {
        tagAssignments: {
          include: { tag: true },
        },
        contacts: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        },
        _count: {
          select: { bidRecipients: true, bidResponses: true },
        },
      },
    });

    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async createSupplier(
    companyId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      defaultContactName?: string;
      defaultContactEmail?: string;
      defaultContactPhone?: string;
      notes?: string;
      tagIds?: string[];
    }
  ) {
    const { tagIds, ...supplierData } = data;

    const supplier = await this.prisma.supplier.create({
      data: {
        companyId,
        ...supplierData,
        tagAssignments: tagIds?.length
          ? {
              create: tagIds.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
      include: {
        tagAssignments: { include: { tag: true } },
      },
    });

    return supplier;
  }

  async updateSupplier(
    supplierId: string,
    companyId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      defaultContactName?: string;
      defaultContactEmail?: string;
      defaultContactPhone?: string;
      notes?: string;
      isActive?: boolean;
      tagIds?: string[];
    }
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    const { tagIds, ...updateData } = data;

    // If tagIds provided, replace all tag assignments
    if (tagIds !== undefined) {
      await this.prisma.supplierTagAssignment.deleteMany({
        where: { supplierId },
      });

      if (tagIds.length > 0) {
        await this.prisma.supplierTagAssignment.createMany({
          data: tagIds.map((tagId) => ({ supplierId, tagId })),
        });
      }
    }

    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: updateData,
      include: {
        tagAssignments: { include: { tag: true } },
        contacts: { where: { isActive: true } },
      },
    });
  }

  async deleteSupplier(supplierId: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
      include: { _count: { select: { bidRecipients: true } } },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    // Soft delete if has bid history, hard delete otherwise
    if (supplier._count.bidRecipients > 0) {
      return this.prisma.supplier.update({
        where: { id: supplierId },
        data: { isActive: false },
      });
    }

    return this.prisma.supplier.delete({ where: { id: supplierId } });
  }

  // ==================== SUPPLIER CONTACTS ====================

  async listContacts(supplierId: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    return this.prisma.supplierContact.findMany({
      where: { supplierId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
  }

  async createContact(
    supplierId: string,
    companyId: string,
    data: {
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      isPrimary?: boolean;
    }
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    // If this contact is primary, unset other primaries
    if (data.isPrimary) {
      await this.prisma.supplierContact.updateMany({
        where: { supplierId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.supplierContact.create({
      data: {
        supplierId,
        ...data,
      },
    });
  }

  async updateContact(
    contactId: string,
    companyId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      isPrimary?: boolean;
      isActive?: boolean;
    }
  ) {
    const contact = await this.prisma.supplierContact.findFirst({
      where: { id: contactId },
      include: { supplier: true },
    });
    if (!contact || contact.supplier.companyId !== companyId) {
      throw new NotFoundException("Contact not found");
    }

    // If setting as primary, unset other primaries
    if (data.isPrimary) {
      await this.prisma.supplierContact.updateMany({
        where: { supplierId: contact.supplierId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.supplierContact.update({
      where: { id: contactId },
      data,
    });
  }

  async deleteContact(contactId: string, companyId: string) {
    const contact = await this.prisma.supplierContact.findFirst({
      where: { id: contactId },
      include: { supplier: true },
    });
    if (!contact || contact.supplier.companyId !== companyId) {
      throw new NotFoundException("Contact not found");
    }

    // Soft delete
    return this.prisma.supplierContact.update({
      where: { id: contactId },
      data: { isActive: false },
    });
  }
}
