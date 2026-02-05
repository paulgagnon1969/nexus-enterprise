import { Injectable, ForbiddenException, BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GlobalRole } from "../auth/auth.guards";
import { PersonalContactSource, PersonalContactSubjectType, Prisma } from "@prisma/client";

interface ImportContactInput {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;        // Primary email for invites
  phone?: string | null;        // Primary phone for invites
  allEmails?: string[] | null;  // All emails from device
  allPhones?: string[] | null;  // All phones from device
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

  private buildContactsForOwner(ownerUserId: string, inputs: ImportContactInput[]) {
    if (!inputs?.length) {
      throw new BadRequestException("No contacts provided for import.");
    }

    // Normalize and filter out any rows that are missing both email and phone so
    // that downstream Prisma queries never receive an empty OR [] clause.
    const contacts = inputs
      .map(input => {
        const email = this.normalizeEmail(input.email);
        const phone = this.normalizePhone(input.phone);
        const source = input.source ?? PersonalContactSource.UPLOAD;

        const displayName =
          input.displayName ||
          [input.firstName, input.lastName].filter(Boolean).join(" ") ||
          email ||
          phone ||
          null;

        // Store all emails/phones as JSON arrays
        const allEmails = input.allEmails?.length ? input.allEmails : (email ? [email] : null);
        const allPhones = input.allPhones?.length ? input.allPhones : (phone ? [phone] : null);

        return {
          ownerUserId,
          displayName,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          email,
          phone,
          allEmails,
          allPhones,
          source,
        };
      })
      .filter(c => c.email || c.phone);

    if (!contacts.length) {
      throw new BadRequestException("No contacts with email or phone were provided for import.");
    }

    return contacts;
  }

  private async upsertContactsForOwner(ownerUserId: string, inputs: ImportContactInput[]) {
    const contacts = this.buildContactsForOwner(ownerUserId, inputs);

    try {
      const results = [] as any[];
      let created = 0;
      let updated = 0;

      // Perform per-contact upserts without wrapping the entire import in a
      // long-lived interactive transaction. This avoids hitting Prisma's
      // 5-second interactive transaction timeout when importing large CSVs.
      for (const c of contacts) {
        const orClauses: any[] = [];
        if (c.email) orClauses.push({ email: c.email });
        if (c.phone) orClauses.push({ phone: c.phone });

        const existing = await this.prisma.personalContact.findFirst({
          where: {
            ownerUserId,
            OR: orClauses,
          },
        });

        if (existing) {
          // Merge allEmails/allPhones arrays if both exist
          // Use Prisma.JsonNull for explicit null in JSON columns
          const mergedEmails = c.allEmails ?? existing.allEmails;
          const mergedPhones = c.allPhones ?? existing.allPhones;

          const updatedRow = await this.prisma.personalContact.update({
            where: { id: existing.id },
            data: {
              displayName: c.displayName ?? existing.displayName,
              firstName: c.firstName ?? existing.firstName,
              lastName: c.lastName ?? existing.lastName,
              email: c.email ?? existing.email,
              phone: c.phone ?? existing.phone,
              allEmails: mergedEmails ?? Prisma.JsonNull,
              allPhones: mergedPhones ?? Prisma.JsonNull,
              source: c.source ?? existing.source,
            },
          });
          updated += 1;
          results.push(updatedRow);
        } else {
          const createdRow = await this.prisma.personalContact.create({
            data: {
              ...c,
              allEmails: c.allEmails ?? Prisma.JsonNull,
              allPhones: c.allPhones ?? Prisma.JsonNull,
            },
          });
          created += 1;
          results.push(createdRow);
        }
      }

      return { rows: results, createdCount: created, updatedCount: updated };
    } catch (err: any) {
      // Surface a clear, client-visible error rather than a generic 500 when
      // something goes wrong during import (e.g. unexpected DB constraint).
      throw new BadRequestException(
        `Failed to import personal contacts. ${err?.message ?? "Please verify the CSV format and try again."}`,
      );
    }
  }

  async importContacts(actor: AuthenticatedUser, inputs: ImportContactInput[]) {
    const ownerUserId = this.ensureUserId(actor);
    const { rows, createdCount, updatedCount } = await this.upsertContactsForOwner(ownerUserId, inputs);

    return {
      count: rows.length,
      createdCount,
      updatedCount,
      contacts: rows.map(c => ({
        id: c.id,
        displayName: c.displayName,
        email: c.email,
        phone: c.phone,
      })),
    };
  }

  async importContactsForUser(actor: AuthenticatedUser, targetUserId: string, inputs: ImportContactInput[]) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can import contacts for other users.");
    }
    if (!targetUserId) {
      throw new BadRequestException("userId is required");
    }

    const { rows, createdCount, updatedCount } = await this.upsertContactsForOwner(targetUserId, inputs);

    return {
      count: rows.length,
      createdCount,
      updatedCount,
      contacts: rows.map(c => ({
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
      allEmails: (c.allEmails as string[] | null) ?? null,
      allPhones: (c.allPhones as string[] | null) ?? null,
      source: c.source,
    }));
  }

  /**
   * Update the primary email or phone for a contact (for invite purposes).
   * The email/phone must exist in allEmails/allPhones.
   */
  async updatePrimaryContact(
    actor: AuthenticatedUser,
    contactId: string,
    primaryEmail?: string | null,
    primaryPhone?: string | null,
  ) {
    const ownerUserId = this.ensureUserId(actor);

    const contact = await this.prisma.personalContact.findFirst({
      where: { id: contactId, ownerUserId },
    });

    if (!contact) {
      throw new ForbiddenException("Personal contact not found or not owned by current user.");
    }

    const allEmails = (contact.allEmails as string[] | null) ?? [];
    const allPhones = (contact.allPhones as string[] | null) ?? [];

    // Validate the email is in allEmails (if provided)
    if (primaryEmail && !allEmails.includes(primaryEmail)) {
      throw new BadRequestException(`Email "${primaryEmail}" is not in the contact's email list.`);
    }

    // Validate the phone is in allPhones (if provided)
    if (primaryPhone && !allPhones.includes(primaryPhone)) {
      throw new BadRequestException(`Phone "${primaryPhone}" is not in the contact's phone list.`);
    }

    const updated = await this.prisma.personalContact.update({
      where: { id: contactId },
      data: {
        ...(primaryEmail !== undefined ? { email: primaryEmail } : {}),
        ...(primaryPhone !== undefined ? { phone: primaryPhone } : {}),
      },
    });

    return {
      id: updated.id,
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      allEmails: (updated.allEmails as string[] | null) ?? null,
      allPhones: (updated.allPhones as string[] | null) ?? null,
    };
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

  async getContactsForCandidate(actor: AuthenticatedUser, candidateId: string) {
    const ownerUserId = this.ensureUserId(actor);
    if (!candidateId) {
      throw new BadRequestException("candidateId is required");
    }

    const candidate = await this.prisma.nexNetCandidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    if (!candidate) {
      throw new BadRequestException("Candidate not found");
    }

    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();

    const candEmail = this.normalizeEmail(candidate.email);
    if (candEmail) emailSet.add(candEmail);
    const userEmail = this.normalizeEmail(candidate.user?.email ?? null);
    if (userEmail) emailSet.add(userEmail);

    const candPhone = this.normalizePhone(candidate.phone);
    if (candPhone) phoneSet.add(candPhone);

    const linked = await this.prisma.personalContactLink.findMany({
      where: {
        subjectType: PersonalContactSubjectType.CANDIDATE,
        subjectId: candidateId,
        personalContact: { ownerUserId },
      },
      include: { personalContact: true },
    });

    const linkedContacts = linked.map(l => l.personalContact);
    const linkedIds = linkedContacts.map(c => c.id);

    const or: any[] = [];
    for (const email of emailSet) {
      if (email) {
        or.push({ email });
      }
    }
    for (const phone of phoneSet) {
      if (phone) {
        or.push({ phone });
      }
    }

    let matchingContacts: any[] = [];
    if (or.length) {
      matchingContacts = await this.prisma.personalContact.findMany({
        where: {
          ownerUserId,
          id: { notIn: linkedIds },
          OR: or,
        },
      });
    }

    const toSummary = (c: any) => ({
      id: c.id,
      displayName: c.displayName,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      source: c.source,
    });

    return {
      linkedContacts: linkedContacts.map(toSummary),
      matchingContacts: matchingContacts.map(toSummary),
    };
  }

  async getContactsForWorker(actor: AuthenticatedUser, workerId: string) {
    const ownerUserId = this.ensureUserId(actor);
    if (!workerId) {
      throw new BadRequestException("workerId is required");
    }

    // Use a raw Worker query (like WorkerService) to be resilient to legacy
    // schema differences while we only need a small subset of columns.
    const worker = await (this.prisma as any).worker.findUnique({
      where: { id: workerId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!worker) {
      throw new BadRequestException("Worker not found");
    }

    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();

    const email = this.normalizeEmail(worker.email ?? null);
    if (email) emailSet.add(email);

    const phone = this.normalizePhone(worker.phone ?? null);
    if (phone) phoneSet.add(phone);

    const linked = await this.prisma.personalContactLink.findMany({
      where: {
        subjectType: PersonalContactSubjectType.WORKER,
        subjectId: workerId,
        personalContact: { ownerUserId },
      },
      include: { personalContact: true },
    });

    const linkedContacts = linked.map(l => l.personalContact);
    const linkedIds = linkedContacts.map(c => c.id);

    const or: any[] = [];
    for (const e of emailSet) {
      if (e) or.push({ email: e });
    }
    for (const p of phoneSet) {
      if (p) or.push({ phone: p });
    }

    let matchingContacts: any[] = [];
    if (or.length) {
      matchingContacts = await this.prisma.personalContact.findMany({
        where: {
          ownerUserId,
          id: { notIn: linkedIds },
          OR: or,
        },
      });
    }

    const toSummary = (c: any) => ({
      id: c.id,
      displayName: c.displayName,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      source: c.source,
    });

    return {
      linkedContacts: linkedContacts.map(toSummary),
      matchingContacts: matchingContacts.map(toSummary),
    };
  }
}
