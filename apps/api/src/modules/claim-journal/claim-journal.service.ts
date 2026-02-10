import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { Prisma, ClaimJournalEntryType, ClaimJournalDirection } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCarrierContactDto {
  carrierName: string;
  contactName: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface UpdateCarrierContactDto {
  carrierName?: string;
  contactName?: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CreateJournalEntryDto {
  entryType: ClaimJournalEntryType;
  direction: ClaimJournalDirection;
  carrierContactId?: string;
  actorNameOverride?: string;
  actorOrgOverride?: string;
  occurredAt: string; // ISO date string
  summary: string;
  details?: string;
  amountDisputed?: number;
  amountApproved?: number;
  amountDenied?: number;
  tags?: string[];
}

export interface JournalListFilters {
  entryType?: ClaimJournalEntryType;
  direction?: ClaimJournalDirection;
  carrierContactId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ClaimJournalService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Carrier Contacts
  // ───────────────────────────────────────────────────────────────────────────

  async listCarrierContacts(actor: AuthenticatedUser, includeInactive = false) {
    this.requireAdminOrAbove(actor);

    const where: Prisma.CarrierContactWhereInput = {
      companyId: actor.companyId,
    };

    if (!includeInactive) {
      where.isActive = true;
    }

    const contacts = await this.prisma.carrierContact.findMany({
      where,
      orderBy: [{ carrierName: "asc" }, { contactName: "asc" }],
    });

    return { contacts };
  }

  async createCarrierContact(actor: AuthenticatedUser, dto: CreateCarrierContactDto) {
    this.requireAdminOrAbove(actor);

    if (!dto.carrierName?.trim()) {
      throw new BadRequestException("Carrier name is required");
    }
    if (!dto.contactName?.trim()) {
      throw new BadRequestException("Contact name is required");
    }

    const contact = await this.prisma.carrierContact.create({
      data: {
        companyId: actor.companyId,
        carrierName: dto.carrierName.trim(),
        contactName: dto.contactName.trim(),
        role: dto.role?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });

    return contact;
  }

  async updateCarrierContact(
    actor: AuthenticatedUser,
    contactId: string,
    dto: UpdateCarrierContactDto
  ) {
    this.requireAdminOrAbove(actor);

    const existing = await this.prisma.carrierContact.findFirst({
      where: { id: contactId, companyId: actor.companyId },
    });

    if (!existing) {
      throw new NotFoundException("Carrier contact not found");
    }

    const data: Prisma.CarrierContactUpdateInput = {};

    if (dto.carrierName !== undefined) {
      if (!dto.carrierName.trim()) {
        throw new BadRequestException("Carrier name cannot be empty");
      }
      data.carrierName = dto.carrierName.trim();
    }
    if (dto.contactName !== undefined) {
      if (!dto.contactName.trim()) {
        throw new BadRequestException("Contact name cannot be empty");
      }
      data.contactName = dto.contactName.trim();
    }
    if (dto.role !== undefined) data.role = dto.role?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.carrierContact.update({
      where: { id: contactId },
      data,
    });

    return updated;
  }

  async deleteCarrierContact(actor: AuthenticatedUser, contactId: string) {
    this.requireAdminOrAbove(actor);

    const existing = await this.prisma.carrierContact.findFirst({
      where: { id: contactId, companyId: actor.companyId },
    });

    if (!existing) {
      throw new NotFoundException("Carrier contact not found");
    }

    // Soft delete by setting isActive = false
    await this.prisma.carrierContact.update({
      where: { id: contactId },
      data: { isActive: false },
    });

    return { success: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Journal Entries
  // ───────────────────────────────────────────────────────────────────────────

  async listJournalEntries(
    actor: AuthenticatedUser,
    projectId: string,
    filters: JournalListFilters = {}
  ) {
    this.requireAdminOrAbove(actor);

    // Verify project belongs to actor's company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: actor.companyId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ClaimJournalEntryWhereInput = {
      projectId,
    };

    if (filters.entryType) {
      where.entryType = filters.entryType;
    }
    if (filters.direction) {
      where.direction = filters.direction;
    }
    if (filters.carrierContactId) {
      where.carrierContactId = filters.carrierContactId;
    }
    if (filters.fromDate) {
      where.occurredAt = { ...((where.occurredAt as any) || {}), gte: new Date(filters.fromDate) };
    }
    if (filters.toDate) {
      where.occurredAt = { ...((where.occurredAt as any) || {}), lte: new Date(filters.toDate) };
    }
    if (filters.search?.trim()) {
      const searchTerm = filters.search.trim();
      where.OR = [
        { summary: { contains: searchTerm, mode: "insensitive" } },
        { details: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.claimJournalEntry.findMany({
        where,
        include: {
          carrierContact: {
            select: {
              id: true,
              carrierName: true,
              contactName: true,
              role: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              fileSize: true,
              storageUrl: true,
              uploadedAt: true,
            },
          },
          correctedBy: {
            select: { id: true },
          },
        },
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.claimJournalEntry.count({ where }),
    ]);

    return {
      entries: entries.map((e) => ({
        ...e,
        createdBy: {
          id: e.createdBy.id,
          displayName: [e.createdBy.firstName, e.createdBy.lastName].filter(Boolean).join(" ") || e.createdBy.email,
        },
        isCorrected: !!e.correctedBy,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJournalEntry(actor: AuthenticatedUser, projectId: string, entryId: string) {
    this.requireAdminOrAbove(actor);

    const entry = await this.prisma.claimJournalEntry.findFirst({
      where: {
        id: entryId,
        projectId,
        project: { companyId: actor.companyId },
      },
      include: {
        carrierContact: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
        correctsEntry: {
          select: { id: true, summary: true, occurredAt: true },
        },
        correctedBy: {
          select: { id: true, summary: true, occurredAt: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException("Journal entry not found");
    }

    return {
      ...entry,
      createdBy: {
        id: entry.createdBy.id,
        displayName: [entry.createdBy.firstName, entry.createdBy.lastName].filter(Boolean).join(" ") || entry.createdBy.email,
      },
    };
  }

  async createJournalEntry(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateJournalEntryDto
  ) {
    this.requireAdminOrAbove(actor);

    // Verify project belongs to actor's company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: actor.companyId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (!dto.summary?.trim()) {
      throw new BadRequestException("Summary is required");
    }

    // If carrierContactId is provided, verify it belongs to the same company
    if (dto.carrierContactId) {
      const contact = await this.prisma.carrierContact.findFirst({
        where: { id: dto.carrierContactId, companyId: actor.companyId },
      });
      if (!contact) {
        throw new BadRequestException("Carrier contact not found");
      }
    }

    const entry = await this.prisma.claimJournalEntry.create({
      data: {
        projectId,
        entryType: dto.entryType,
        direction: dto.direction,
        carrierContactId: dto.carrierContactId || null,
        actorNameOverride: dto.actorNameOverride?.trim() || null,
        actorOrgOverride: dto.actorOrgOverride?.trim() || null,
        occurredAt: new Date(dto.occurredAt),
        summary: dto.summary.trim(),
        details: dto.details?.trim() || null,
        amountDisputed: dto.amountDisputed != null ? new Prisma.Decimal(dto.amountDisputed) : null,
        amountApproved: dto.amountApproved != null ? new Prisma.Decimal(dto.amountApproved) : null,
        amountDenied: dto.amountDenied != null ? new Prisma.Decimal(dto.amountDenied) : null,
        tags: dto.tags ?? [],
        createdById: actor.userId,
      },
      include: {
        carrierContact: {
          select: {
            id: true,
            carrierName: true,
            contactName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        attachments: true,
      },
    });

    return {
      ...entry,
      createdBy: {
        id: entry.createdBy.id,
        displayName: [entry.createdBy.firstName, entry.createdBy.lastName].filter(Boolean).join(" ") || entry.createdBy.email,
      },
    };
  }

  async createCorrectionEntry(
    actor: AuthenticatedUser,
    projectId: string,
    originalEntryId: string,
    dto: CreateJournalEntryDto
  ) {
    this.requireAdminOrAbove(actor);

    // Verify original entry exists and belongs to the project
    const originalEntry = await this.prisma.claimJournalEntry.findFirst({
      where: {
        id: originalEntryId,
        projectId,
        project: { companyId: actor.companyId },
      },
    });

    if (!originalEntry) {
      throw new NotFoundException("Original journal entry not found");
    }

    // Check if already corrected
    const existingCorrection = await this.prisma.claimJournalEntry.findFirst({
      where: { correctsEntryId: originalEntryId },
    });

    if (existingCorrection) {
      throw new BadRequestException("This entry has already been corrected");
    }

    // Create the correction entry
    const entry = await this.prisma.claimJournalEntry.create({
      data: {
        projectId,
        entryType: dto.entryType,
        direction: dto.direction,
        carrierContactId: dto.carrierContactId || null,
        actorNameOverride: dto.actorNameOverride?.trim() || null,
        actorOrgOverride: dto.actorOrgOverride?.trim() || null,
        occurredAt: new Date(dto.occurredAt),
        summary: dto.summary.trim(),
        details: dto.details?.trim() || null,
        amountDisputed: dto.amountDisputed != null ? new Prisma.Decimal(dto.amountDisputed) : null,
        amountApproved: dto.amountApproved != null ? new Prisma.Decimal(dto.amountApproved) : null,
        amountDenied: dto.amountDenied != null ? new Prisma.Decimal(dto.amountDenied) : null,
        tags: dto.tags ?? [],
        createdById: actor.userId,
        correctsEntryId: originalEntryId,
      },
      include: {
        carrierContact: {
          select: {
            id: true,
            carrierName: true,
            contactName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        correctsEntry: {
          select: { id: true, summary: true },
        },
      },
    });

    return {
      ...entry,
      createdBy: {
        id: entry.createdBy.id,
        displayName: [entry.createdBy.firstName, entry.createdBy.lastName].filter(Boolean).join(" ") || entry.createdBy.email,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Attachments
  // ───────────────────────────────────────────────────────────────────────────

  async addAttachment(
    actor: AuthenticatedUser,
    projectId: string,
    entryId: string,
    attachment: {
      fileName: string;
      fileType?: string;
      fileSize?: number;
      storageKey: string;
      storageUrl?: string;
    }
  ) {
    this.requireAdminOrAbove(actor);

    // Verify entry exists and belongs to the project
    const entry = await this.prisma.claimJournalEntry.findFirst({
      where: {
        id: entryId,
        projectId,
        project: { companyId: actor.companyId },
      },
    });

    if (!entry) {
      throw new NotFoundException("Journal entry not found");
    }

    const created = await this.prisma.claimJournalAttachment.create({
      data: {
        journalEntryId: entryId,
        fileName: attachment.fileName,
        fileType: attachment.fileType || null,
        fileSize: attachment.fileSize || null,
        storageKey: attachment.storageKey,
        storageUrl: attachment.storageUrl || null,
        uploadedById: actor.userId,
      },
    });

    return created;
  }

  async deleteAttachment(
    actor: AuthenticatedUser,
    projectId: string,
    entryId: string,
    attachmentId: string
  ) {
    this.requireAdminOrAbove(actor);

    const attachment = await this.prisma.claimJournalAttachment.findFirst({
      where: {
        id: attachmentId,
        journalEntryId: entryId,
        journalEntry: {
          projectId,
          project: { companyId: actor.companyId },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }

    await this.prisma.claimJournalAttachment.delete({
      where: { id: attachmentId },
    });

    return { success: true };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private requireAdminOrAbove(actor: AuthenticatedUser) {
    const isAdmin =
      actor.globalRole === "SUPER_ADMIN" ||
      actor.role === "OWNER" ||
      actor.role === "ADMIN";

    if (!isAdmin) {
      throw new ForbiddenException("Admin access required");
    }
  }
}
