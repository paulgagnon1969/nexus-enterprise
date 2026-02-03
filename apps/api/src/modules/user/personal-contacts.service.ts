import { Injectable, ForbiddenException, BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { PersonalContactSource, PersonalContactSubjectType } from "@prisma/client";

interface ImportContactInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: PersonalContactSource | null;
}

@Injectable()
export class PersonalContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(email?: string | null): string | null {
    const trimmed = (email ?? "").trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  private normalizePhone(phone?: string | null): string | null {
    const trimmed = (phone ?? "").trim();
    return trimmed || null;
  }

  private ensureUserId(actor: AuthenticatedUser): string {
    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for personal contacts.");
    }
    return actor.userId;
  }

  async importContacts(actor: AuthenticatedUser, inputs: ImportContactInput[]) {
    const ownerUserId = this.ensureUserId(actor);
    if (!inputs?.length) {
      throw new BadRequestException("No contacts provided for import.");
    }

    const contacts = inputs.map(input => {
      const email = this.normalizeEmail(input.email);
      const phone = this.normalizePhone(input.phone);
      const source = input.source ?? PersonalContactSource.UPLOAD;

      const displayName =
        input.displayName ||
        [input.firstName, input.lastName].filter(Boolean).join(" ") ||
        email ||
        phone ||
        null;

      return { ownerUserId, displayName, firstName: input.firstName ?? null, lastName: input.lastName ?? null, email, phone, source };
    });

    const created = await this.prisma.$transaction(async tx => {
      const results = [] as any[];
      for (const c of contacts) {
        const existing = await tx.personalContact.findFirst({
          where: {
            ownerUserId,
            OR: [
              c.email ? { email: c.email } : undefined,
              c.phone ? { phone: c.phone } : undefined,
            ].filter(Boolean) as any[],
          },
        });

        if (existing) {
          const updated = await tx.personalContact.update({
            where: { id: existing.id },
            data: {
              displayName: c.displayName ?? existing.displayName,
              firstName: c.firstName ?? existing.firstName,
              lastName: c.lastName ?? existing.lastName,
              email: c.email ?? existing.email,
              phone: c.phone ?? existing.phone,
              source: c.source ?? existing.source,
            },
          });
          results.push(updated);
        } else {
          const createdRow = await tx.personalContact.create({ data: c });
          results.push(createdRow);
        }
      }
      return results;
    });

    return {
      count: created.length,
      contacts: created.map(c => ({
        id: c.id,
        displayName: c.displayName,
        email: c.email,
        phone: c.phone,
      })),
    };
  }

  async listContacts(actor: AuthenticatedUser, search?: string | null, limit = 50) {
    const ownerUserId = this.ensureUserId(actor);
    const where: any = { ownerUserId };

    if (search && search.trim() !== "") {
      const term = search.trim();
      where.OR = [
        { displayName: { contains: term, mode: "insensitive" } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ];
    }

    const rows = await this.prisma.personalContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return rows.map(c => ({
      id: c.id,
      displayName: c.displayName,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      source: c.source,
    }));
  }

  async linkToSubject(
    actor: AuthenticatedUser,
    personalContactId: string,
    subjectType: PersonalContactSubjectType,
    subjectId: string,
    tenantId?: string | null,
    note?: string | null,
  ) {
    const ownerUserId = this.ensureUserId(actor);

    const contact = await this.prisma.personalContact.findFirst({
      where: { id: personalContactId, ownerUserId },
    });
    if (!contact) {
      throw new ForbiddenException("Personal contact not found or not owned by current user.");
    }

    const link = await this.prisma.personalContactLink.create({
      data: {
        personalContactId,
        subjectType,
        subjectId,
        tenantId: tenantId ?? null,
        note: note ?? null,
      },
    });

    return link;
  }
}