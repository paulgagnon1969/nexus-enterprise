import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "../auth/auth.guards";
import { UserType } from "@prisma/client";
import {
  decryptPortfolioHrJson,
  encryptPortfolioHrJson,
} from "../../common/crypto/portfolio-hr.crypto";

type HrDocumentPayload = {
  id: string;
  type: string;
  fileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type PortfolioHrPayload = {
  // Contact / identity (HR-only)
  displayEmail?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  // Highly sensitive
  ssn?: string | null;
  itin?: string | null;
  bankAccountNumber?: string | null;
  bankRoutingNumber?: string | null;
  bankName?: string | null;
  bankAddress?: string | null;

  // HIPAA / medical / notes
  hipaaNotes?: string | null;

  // Availability / start date (HR-only, used for planning/anniversaries)
  startDate?: string | null;

  // HR-only compensation (protected; used for CP/export)
  hourlyRate?: number | null;
  dayRate?: number | null;
  cpHourlyRate?: number | null;
  candidateDesiredPay?: number | null;

  // HR documents (non-secret; URLs to storage)
  documents?: HrDocumentPayload[];
};

function calculateProfileCompletionPercent(user: {
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
} & {
  // Optional richer context we may use later (portfolio, onboarding, skills, etc.)
  // For now we keep the function minimal and safe.
}): number {
  // Base: 10% once we have at least name + email.
  let score = 0;
  const hasName = !!(user.firstName && user.firstName.trim()) && !!(user.lastName && user.lastName.trim());
  const hasEmail = !!(user.email && user.email.trim());

  if (hasName && hasEmail) {
    score = 10;
  }

  // Future: increment score based on additional fields (phone, address, skills, etc.).
  // For now, keep it simple and always cap at 100.
  return Math.max(10, Math.min(score, 100));
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        globalRole: true,
        userType: true,
        profileCompletionPercent: true,
        memberships: {
          select: {
            companyId: true,
            role: true,
            isActive: true,
            company: {
              select: {
                id: true,
                name: true,
                kind: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private async updateUserNamesAndProfileCompletion(
    userId: string,
    dto: { firstName?: string; lastName?: string },
  ) {
    const firstName = dto.firstName != null ? dto.firstName.trim() : undefined;
    const lastName = dto.lastName != null ? dto.lastName.trim() : undefined;

    // Load current user so we can recalculate profile completion.
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        profileReminderStartAt: true,
      },
    });

    const nextFirst = firstName === "" ? null : firstName ?? existing?.firstName ?? null;
    const nextLast = lastName === "" ? null : lastName ?? existing?.lastName ?? null;

    const nextPercent = calculateProfileCompletionPercent({
      email: existing?.email ?? null,
      firstName: nextFirst,
      lastName: nextLast,
    });

    const now = new Date();

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: nextFirst,
        lastName: nextLast,
        profileCompletionPercent: nextPercent,
        profileCompletionUpdatedAt: now,
        profileReminderStartAt: existing?.profileReminderStartAt ?? now,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        globalRole: true,
        userType: true,
        profileCompletionPercent: true,
      },
    });
  }

  async updateMe(userId: string, dto: { firstName?: string; lastName?: string }) {
    return this.updateUserNamesAndProfileCompletion(userId, dto);
  }

  private canViewHrPortfolio(actor: AuthenticatedUser, targetUserId: string) {
    if (actor.userId === targetUserId) return true;
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) return true;
    if (actor.profileCode === "HR") return true;
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) return true;
    return false;
  }

  private normalizeField(value: any): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  private last4FromValue(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 4) return null;
    return digits.slice(-4);
  }

  private hasValue(value: string | null | undefined): boolean {
    return !!(value && value.trim() !== "");
  }

  async getMyPortfolio(actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        globalRole: true,
        userType: true,
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const portfolio = await this.prisma.userPortfolio.upsert({
      where: {
        UserPortfolio_company_user_key: {
          companyId: actor.companyId,
          userId: actor.userId,
        },
      },
      update: {},
      create: {
        companyId: actor.companyId,
        userId: actor.userId,
      },
      select: {
        id: true,
        headline: true,
        bio: true,
        photoUrl: true,
        updatedAt: true,
      },
    });

    const canViewHr = this.canViewHrPortfolio(actor, actor.userId);

    const hr = await this.prisma.userPortfolioHr.findUnique({
      where: { portfolioId: portfolio.id },
      select: {
        encryptedJson: true,
        ssnLast4: true,
        itinLast4: true,
        bankAccountLast4: true,
        bankRoutingLast4: true,
        updatedAt: true,
      },
    });

    let hrPublic: any = null;
    if (hr && canViewHr) {
      try {
        const payload = decryptPortfolioHrJson(Buffer.from(hr.encryptedJson)) as PortfolioHrPayload;
        hrPublic = {
          displayEmail: payload.displayEmail ?? null,
          phone: payload.phone ?? null,
          addressLine1: payload.addressLine1 ?? null,
          addressLine2: payload.addressLine2 ?? null,
          city: payload.city ?? null,
          state: payload.state ?? null,
          postalCode: payload.postalCode ?? null,
          country: payload.country ?? null,
          bankName: payload.bankName ?? null,
          bankAddress: payload.bankAddress ?? null,
          hipaaNotes: payload.hipaaNotes ?? null,

          startDate: payload.startDate ?? null,

          hourlyRate: payload.hourlyRate ?? null,
          dayRate: payload.dayRate ?? null,
          cpHourlyRate: payload.cpHourlyRate ?? null,
          candidateDesiredPay: payload.candidateDesiredPay ?? null,

          documents: Array.isArray(payload.documents) ? payload.documents : [],

          // Masked / derived
          ssnLast4: hr.ssnLast4 ?? null,
          itinLast4: hr.itinLast4 ?? null,
          bankAccountLast4: hr.bankAccountLast4 ?? null,
          bankRoutingLast4: hr.bankRoutingLast4 ?? null,
          hasSsn: this.hasValue(payload.ssn ?? null),
          hasItin: this.hasValue(payload.itin ?? null),
          hasBankAccount: this.hasValue(payload.bankAccountNumber ?? null),
          hasBankRouting: this.hasValue(payload.bankRoutingNumber ?? null),
        };
      } catch {
        // If HR payload is malformed or cannot be decrypted, fail soft and
        // continue without exposing HR details instead of returning 500.
        hrPublic = null;
      }
    }

    return {
      user,
      portfolio,
      canViewHr,
      hr: hrPublic,
    };
  }

  async updateMyPortfolio(actor: AuthenticatedUser, body: any) {
    const firstName = this.normalizeField(body.firstName);
    const lastName = this.normalizeField(body.lastName);

    const headline = this.normalizeField(body.headline);
    const bio = this.normalizeField(body.bio);
    const photoUrl = this.normalizeField(body.photoUrl);

    await this.prisma.user.update({
      where: { id: actor.userId },
      data: {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
      },
    });

    const portfolio = await this.prisma.userPortfolio.upsert({
      where: {
        UserPortfolio_company_user_key: {
          companyId: actor.companyId,
          userId: actor.userId,
        },
      },
      update: {
        ...(headline !== undefined ? { headline } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(photoUrl !== undefined ? { photoUrl } : {}),
      },
      create: {
        companyId: actor.companyId,
        userId: actor.userId,
        headline: headline ?? null,
        bio: bio ?? null,
        photoUrl: photoUrl ?? null,
      },
      select: {
        id: true,
        headline: true,
        bio: true,
        photoUrl: true,
        updatedAt: true,
      },
    });

    const canViewHr = this.canViewHrPortfolio(actor, actor.userId);

      const hrInputKeys = [
      "displayEmail",
      "phone",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "country",
      "ssn",
      "itin",
      "bankAccountNumber",
      "bankRoutingNumber",
      "bankName",
      "bankAddress",
      "hipaaNotes",
      "startDate",
      // HR-only compensation fields
      "hourlyRate",
      "dayRate",
      "cpHourlyRate",
      "candidateDesiredPay",
    ];

    const hasAnyHrUpdate = hrInputKeys.some(k => body[k] !== undefined);

    if (hasAnyHrUpdate && canViewHr) {
      const existing = await this.prisma.userPortfolioHr.findUnique({
        where: { portfolioId: portfolio.id },
        select: {
          encryptedJson: true,
        },
      });

      const currentPayload: PortfolioHrPayload = existing
        ? (decryptPortfolioHrJson(Buffer.from(existing.encryptedJson)) as PortfolioHrPayload)
        : {};

      const next: PortfolioHrPayload = { ...currentPayload };

      const setMaybe = (key: keyof PortfolioHrPayload, value: any) => {
        const v = this.normalizeField(value);
        if (v === undefined) return;
        (next as any)[key] = v;
      };

      setMaybe("displayEmail", body.displayEmail);
      setMaybe("phone", body.phone);
      setMaybe("addressLine1", body.addressLine1);
      setMaybe("addressLine2", body.addressLine2);
      setMaybe("city", body.city);
      setMaybe("state", body.state);
      setMaybe("postalCode", body.postalCode);
      setMaybe("country", body.country);
      setMaybe("bankName", body.bankName);
      setMaybe("bankAddress", body.bankAddress);
      setMaybe("hipaaNotes", body.hipaaNotes);
      setMaybe("startDate", body.startDate);

      // HR-only compensation: stored encrypted alongside other HR payload.
      // These are numbers in the payload; we coerce from strings if needed.
      const coerceNumber = (val: any): number | null | undefined => {
        if (val === undefined) return undefined;
        if (val === null || val === "") return null;
        const n = typeof val === "number" ? val : parseFloat(String(val));
        if (Number.isNaN(n)) return undefined;
        return n;
      };
      const hrHourly = coerceNumber(body.hourlyRate);
      const hrDay = coerceNumber(body.dayRate);
      const hrCpHourly = coerceNumber(body.cpHourlyRate);
      const hrDesired = coerceNumber(body.candidateDesiredPay);
      if (hrHourly !== undefined) (next as any).hourlyRate = hrHourly;
      if (hrDay !== undefined) (next as any).dayRate = hrDay;
      if (hrCpHourly !== undefined) (next as any).cpHourlyRate = hrCpHourly;
      if (hrDesired !== undefined) (next as any).candidateDesiredPay = hrDesired;

      // Highly sensitive: we keep the full value only in encrypted JSON.
      setMaybe("ssn", body.ssn);
      setMaybe("itin", body.itin);
      setMaybe("bankAccountNumber", body.bankAccountNumber);
      setMaybe("bankRoutingNumber", body.bankRoutingNumber);

      const encryptedJson = encryptPortfolioHrJson(next);
      const encryptedBytes = Uint8Array.from(encryptedJson);

      await this.prisma.userPortfolioHr.upsert({
        where: { portfolioId: portfolio.id },
        update: {
          encryptedJson: encryptedBytes,
          ssnLast4: this.last4FromValue(next.ssn ?? null),
          itinLast4: this.last4FromValue(next.itin ?? null),
          bankAccountLast4: this.last4FromValue(next.bankAccountNumber ?? null),
          bankRoutingLast4: this.last4FromValue(next.bankRoutingNumber ?? null),
        },
        create: {
          portfolioId: portfolio.id,
          encryptedJson: encryptedBytes,
          ssnLast4: this.last4FromValue(next.ssn ?? null),
          itinLast4: this.last4FromValue(next.itin ?? null),
          bankAccountLast4: this.last4FromValue(next.bankAccountNumber ?? null),
          bankRoutingLast4: this.last4FromValue(next.bankRoutingNumber ?? null),
        },
      });
    }

    return this.getMyPortfolio(actor);
  }

  // Admin/HR-only update of HR portfolio fields for a specific user in the
  // current company context.
  async updateUserPortfolioHr(actor: AuthenticatedUser, targetUserId: string, body: any) {
    const companyId = actor.companyId;
    if (!companyId) {
      throw new ForbiddenException("Missing company context");
    }

    // Ensure the target user is a member of the actor's company.
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: targetUserId, companyId },
      select: { userId: true },
    });

    if (!membership) {
      throw new ForbiddenException("User is not a member of your company");
    }

    const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;
    const isHr = actor.profileCode === "HR";

    const actorMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: actor.userId,
          companyId,
        },
      },
      select: { role: true },
    });

    const isOwnerOrAdmin =
      actorMembership?.role === Role.OWNER || actorMembership?.role === Role.ADMIN;

    if (!isSuperAdmin && !isHr && !isOwnerOrAdmin) {
      throw new ForbiddenException("Not allowed to edit HR portfolio for this user");
    }

    // Ensure there is a portfolio row for this (company, user).
    const portfolio = await this.prisma.userPortfolio.upsert({
      where: {
        UserPortfolio_company_user_key: {
          companyId,
          userId: targetUserId,
        },
      },
      update: {},
      create: {
        companyId,
        userId: targetUserId,
      },
      select: { id: true },
    });

    const existing = await this.prisma.userPortfolioHr.findUnique({
      where: { portfolioId: portfolio.id },
      select: {
        encryptedJson: true,
      },
    });

    const currentPayload: PortfolioHrPayload = existing
      ? (decryptPortfolioHrJson(Buffer.from(existing.encryptedJson)) as PortfolioHrPayload)
      : {};

    const next: PortfolioHrPayload = { ...currentPayload };

    const setMaybe = (key: keyof PortfolioHrPayload, value: any) => {
      const v = this.normalizeField(value);
      if (v === undefined) return;
      (next as any)[key] = v;
    };

    setMaybe("displayEmail", body.displayEmail);
    setMaybe("phone", body.phone);
    setMaybe("addressLine1", body.addressLine1);
    setMaybe("addressLine2", body.addressLine2);
    setMaybe("city", body.city);
    setMaybe("state", body.state);
    setMaybe("postalCode", body.postalCode);
    setMaybe("country", body.country);

    // Banking (stored encrypted; last-4 derived columns kept in sync).
    setMaybe("bankName", body.bankName);
    setMaybe("bankAddress", body.bankAddress);
    setMaybe("bankAccountNumber", body.bankAccountNumber);
    setMaybe("bankRoutingNumber", body.bankRoutingNumber);

    setMaybe("startDate", body.startDate);

    // HR-only compensation: allow OWNER/ADMIN/HR to set these on behalf of
    // the worker. They remain stored only in the encrypted HR payload.
    const coerceNumber = (val: any): number | null | undefined => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return null;
      const n = typeof val === "number" ? val : parseFloat(String(val));
      if (Number.isNaN(n)) return undefined;
      return n;
    };
    const hrHourly = coerceNumber(body.hourlyRate);
    const hrDay = coerceNumber(body.dayRate);
    const hrCpHourly = coerceNumber(body.cpHourlyRate);
    const hrDesired = coerceNumber(body.candidateDesiredPay);
    if (hrHourly !== undefined) (next as any).hourlyRate = hrHourly;
    if (hrDay !== undefined) (next as any).dayRate = hrDay;
    if (hrCpHourly !== undefined) (next as any).cpHourlyRate = hrCpHourly;
    if (hrDesired !== undefined) (next as any).candidateDesiredPay = hrDesired;

    const encryptedJson = encryptPortfolioHrJson(next);
    const encryptedBytes = Uint8Array.from(encryptedJson);

    await this.prisma.userPortfolioHr.upsert({
      where: { portfolioId: portfolio.id },
      update: {
        encryptedJson: encryptedBytes,
        bankAccountLast4: this.last4FromValue(next.bankAccountNumber ?? null),
        bankRoutingLast4: this.last4FromValue(next.bankRoutingNumber ?? null),
      },
      create: {
        portfolioId: portfolio.id,
        encryptedJson: encryptedBytes,
        bankAccountLast4: this.last4FromValue(next.bankAccountNumber ?? null),
        bankRoutingLast4: this.last4FromValue(next.bankRoutingNumber ?? null),
      },
    });

    // Reuse existing profile DTO so the client can refresh its view.
    return this.getProfile(targetUserId, actor);
  }

  async updateUserProfileBasics(
    actor: AuthenticatedUser,
    targetUserId: string,
    dto: { firstName?: string; lastName?: string },
  ) {
    const companyId = actor.companyId;
    if (!companyId) {
      throw new ForbiddenException("Missing company context");
    }

    const actorMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: actor.userId,
          companyId,
        },
      },
      select: { role: true },
    });

    if (!actorMembership || (actorMembership.role !== Role.OWNER && actorMembership.role !== Role.ADMIN)) {
      throw new ForbiddenException("Only company OWNER/ADMIN can update basic profile fields");
    }

    const targetMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: targetUserId,
          companyId,
        },
      },
      select: { userId: true },
    });

    if (!targetMembership) {
      throw new ForbiddenException("Target user is not a member of this company");
    }

    return this.updateUserNamesAndProfileCompletion(targetUserId, dto);
  }

  async updateUserType(
    actor: AuthenticatedUser,
    targetUserId: string,
    nextUserTypeRaw: string,
  ) {
    const companyId = actor.companyId;
    if (!companyId) {
      throw new ForbiddenException("Missing company context");
    }

    const actorMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: actor.userId,
          companyId,
        },
      },
      select: { role: true },
    });

    if (!actorMembership || (actorMembership.role !== Role.OWNER && actorMembership.role !== Role.ADMIN)) {
      throw new ForbiddenException("Only company OWNER/ADMIN can update user type");
    }

    const targetMembership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: targetUserId,
          companyId,
        },
      },
      select: { userId: true },
    });

    if (!targetMembership) {
      throw new ForbiddenException("Target user is not a member of this company");
    }

    const normalized = (nextUserTypeRaw || "").toUpperCase().trim();
    const allowed: UserType[] = [UserType.INTERNAL, UserType.CLIENT, UserType.APPLICANT];
    if (!allowed.includes(normalized as UserType)) {
      throw new ForbiddenException(`Invalid userType: ${nextUserTypeRaw}`);
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { userType: normalized as UserType },
      select: {
        id: true,
        email: true,
        userType: true,
        globalRole: true,
      },
    });
  }

  async updateGlobalRole(
    actor: AuthenticatedUser,
    targetUserId: string,
    nextGlobalRoleRaw: string,
  ) {
    // Controller-level guard already restricts to SUPER_ADMIN, but we double-check.
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only SUPER_ADMIN can change global roles");
    }

    const normalized = (nextGlobalRoleRaw || "").toUpperCase().trim();
    const allowed: GlobalRole[] = [GlobalRole.NONE, GlobalRole.SUPER_ADMIN, GlobalRole.SUPPORT];
    if (!allowed.includes(normalized as GlobalRole)) {
      throw new ForbiddenException(`Invalid globalRole: ${nextGlobalRoleRaw}`);
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { globalRole: normalized as GlobalRole },
      select: {
        id: true,
        email: true,
        userType: true,
        globalRole: true,
      },
    });
  }

  async getProfile(
    targetUserId: string,
    actor: AuthenticatedUser,
    opts?: { includeBankNumbers?: boolean },
  ) {
    const includeBankNumbers = !!opts?.includeBankNumbers;

    try {
      // Ensure target user is a member of the actor's company
      const membership = await this.prisma.companyMembership.findFirst({
        where: { userId: targetUserId, companyId: actor.companyId },
        select: {
          role: true,
          isActive: true,
          company: {
            select: { id: true, name: true },
          },
        },
      });

      if (!membership) {
        throw new ForbiddenException("User is not a member of your company");
      }

      const user = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          globalRole: true,
          userType: true,
          reputationOverallAvg: true,
          reputationOverallCount: true,
          reputationOverallOverride: true,
        },
      });

      if (!user) {
        throw new NotFoundException("User not found");
      }

      // Load per-skill ratings (self + aggregates)
      const userSkillRatings = await this.prisma.userSkillRating.findMany({
        where: { userId: targetUserId },
      });

      // Load the full active skill catalog so the UI can show the complete matrix
      // (including unrated skills with empty stars).
      const skillDefs = await this.prisma.skillDefinition.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          label: true,
          tradeLabel: true,
          categoryId: true,
          sortOrder: true,
        },
        orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      });

      const categories = await this.prisma.skillCategory.findMany({
        where: { active: true },
        select: { id: true, label: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      });

      const ratingBySkillId = new Map(userSkillRatings.map(r => [r.skillId, r]));
      const catById = new Map(categories.map(c => [c.id, c]));

      const isAdminOrAbove =
        actor.globalRole === GlobalRole.SUPER_ADMIN || actor.role === Role.OWNER || actor.role === Role.ADMIN;

      const skills = skillDefs.map(def => {
        const r = ratingBySkillId.get(def.id);
        const cat = catById.get(def.categoryId) ?? null;

        const selfLevel = r?.selfLevel != null && r.selfLevel > 0 ? r.selfLevel : null;

        const employerCount = r?.employerRatingCount ?? 0;
        const clientCount = r?.clientRatingCount ?? 0;
        const totalCount = employerCount + clientCount;

        const sum =
          (r?.employerAvgLevel != null ? r.employerAvgLevel * employerCount : 0) +
          (r?.clientAvgLevel != null ? r.clientAvgLevel * clientCount : 0);

        const aggregateAvgLevel = totalCount > 0 ? sum / totalCount : null;

        return {
          id: def.id,
          code: def.code,
          label: def.label,
          tradeLabel: def.tradeLabel ?? null,
          categoryLabel: cat?.label ?? null,

          // Everyone can see the single aggregate rating for the skill.
          aggregateAvgLevel,
          aggregateRatingCount: totalCount,

          // Only admins and above can see the breakdown.
          selfLevel: isAdminOrAbove ? selfLevel : null,
          employerAvgLevel: isAdminOrAbove ? r?.employerAvgLevel ?? null : null,
          employerRatingCount: isAdminOrAbove ? r?.employerRatingCount ?? null : null,
          clientAvgLevel: isAdminOrAbove ? r?.clientAvgLevel ?? null : null,
          clientRatingCount: isAdminOrAbove ? r?.clientRatingCount ?? null : null,
        };
      });

      // Optional portfolio for this user in the actor's company.
      const canViewHr = this.canViewHrPortfolio(actor, targetUserId);

      let portfolio = await this.prisma.userPortfolio.findUnique({
        where: {
          UserPortfolio_company_user_key: {
            companyId: actor.companyId,
            userId: targetUserId,
          },
        },
        select: {
          id: true,
          companyId: true,
          headline: true,
          bio: true,
          photoUrl: true,
          updatedAt: true,
        },
      });

      // SUPER_ADMINs may be looking at a user in a company that does not own the
      // canonical HR portfolio (e.g. Nexis recruiting pool lives in "Nexus System").
      // In that case, fall back to any portfolio for this user so we can still
      // surface HR contact details.
      if (!portfolio && actor.globalRole === GlobalRole.SUPER_ADMIN) {
        portfolio = await this.prisma.userPortfolio.findFirst({
          where: { userId: targetUserId },
          select: {
            id: true,
            companyId: true,
            headline: true,
            bio: true,
            photoUrl: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      let hrPublic: any = null;
      if (portfolio && canViewHr) {
        const hr = await this.prisma.userPortfolioHr.findUnique({
          where: { portfolioId: portfolio.id },
          select: {
            encryptedJson: true,
            ssnLast4: true,
            itinLast4: true,
            bankAccountLast4: true,
            bankRoutingLast4: true,
            updatedAt: true,
          },
        });

        if (hr) {
          try {
            const payload = decryptPortfolioHrJson(Buffer.from(hr.encryptedJson)) as PortfolioHrPayload;
            hrPublic = {
              displayEmail: payload.displayEmail ?? null,
              phone: payload.phone ?? null,
              addressLine1: payload.addressLine1 ?? null,
              addressLine2: payload.addressLine2 ?? null,
              city: payload.city ?? null,
              state: payload.state ?? null,
              postalCode: payload.postalCode ?? null,
              country: payload.country ?? null,
              bankName: payload.bankName ?? null,
              bankAddress: payload.bankAddress ?? null,
              hipaaNotes: payload.hipaaNotes ?? null,

              ...(includeBankNumbers
                ? {
                    bankAccountNumber: payload.bankAccountNumber ?? null,
                    bankRoutingNumber: payload.bankRoutingNumber ?? null,
                  }
                : {}),

              startDate: payload.startDate ?? null,

              hourlyRate: payload.hourlyRate ?? null,
              dayRate: payload.dayRate ?? null,
              cpHourlyRate: payload.cpHourlyRate ?? null,
              candidateDesiredPay: payload.candidateDesiredPay ?? null,

              documents: Array.isArray(payload.documents) ? payload.documents : [],

              ssnLast4: hr.ssnLast4 ?? null,
              itinLast4: hr.itinLast4 ?? null,
              bankAccountLast4: hr.bankAccountLast4 ?? null,
              bankRoutingLast4: hr.bankRoutingLast4 ?? null,
              hasSsn: this.hasValue(payload.ssn ?? null),
              hasItin: this.hasValue(payload.itin ?? null),
              hasBankAccount: this.hasValue(payload.bankAccountNumber ?? null),
              hasBankRouting: this.hasValue(payload.bankRoutingNumber ?? null),
            };
          } catch {
            // Same as getMyPortfolio: if decryption fails, do not blow up the
            // entire profile – just omit HR details.
            hrPublic = null;
          }
        }
      }

      // Optional Worker record (BIA/LCP) matched by email, if any.
      let worker: any = null;
      if (user.email) {
        try {
          worker = await this.prisma.worker.findFirst({
            where: {
              email: {
                equals: user.email,
                mode: "insensitive",
              } as any,
            },
            select: {
              id: true,
              fullName: true,
              status: true,
              defaultProjectCode: true,
              primaryClassCode: true,
              phone: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              postalCode: true,
              unionLocal: true,
              dateHired: true,
              totalHoursCbs: true,
              totalHoursCct: true,
              defaultPayRate: true,
              defaultHoursPerDay: true,
              billRate: true,
              cpRate: true,
              cpRole: true,
            },
          });
        } catch (err) {
          // If the Worker lookup fails (e.g., schema drift in legacy BIA/LCP
          // mirror), fail soft and continue without blocking the profile.
          // eslint-disable-next-line no-console
          console.error("getProfile worker lookup failed", {
            userId: user.id,
            email: user.email,
            error: String(err),
          });
          worker = null;
        }
      }

      // Decide HR edit capability.
      const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;
      const isOwnerOrAdmin = actor.role === Role.OWNER || actor.role === Role.ADMIN;
      const isHrProfile = actor.profileCode === "HR";

      // Nexus System detection by company name (matches onboarding service logic).
      const companyName = membership.company?.name?.toLowerCase() ?? "";
      const isNexusSystemCompany = companyName === "nexus system";

      const canEditHr =
        isSuperAdmin ||
        // Nexus System HR/Admin can edit any user's Nexus System portfolio.
        (isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile)) ||
        // Tenant OWNER/ADMIN/HR can edit HR portfolio for their own company membership.
        (!isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile));

      const canEditWorkerComp =
        isSuperAdmin ||
        // Nexus System HR/Admin can curate worker compensation records for any
        // worker while in the Nexus System company context.
        (isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile));
 
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        globalRole: user.globalRole,
        userType: user.userType,
        company: membership.company,
        companyRole: membership.role,
        companyMembershipActive: membership.isActive,
        reputation: {
          avg: user.reputationOverallAvg,
          count: user.reputationOverallCount,
          override: user.reputationOverallOverride,
        },
        portfolio: portfolio
          ? {
              headline: portfolio.headline ?? null,
              bio: portfolio.bio ?? null,
              photoUrl: portfolio.photoUrl ?? null,
              updatedAt: portfolio.updatedAt,
            }
          : null,
        hr: hrPublic,
        canViewHr,
        canEditHr,
        canEditWorkerComp,
        worker,
        skills,
      };
    } catch (err) {
      // Preserve explicit 403/404 semantics.
      if (err instanceof ForbiddenException || err instanceof NotFoundException) {
        throw err;
      }

      // eslint-disable-next-line no-console
      console.error("getProfile failed; returning minimal profile", {
        targetUserId,
        actorUserId: actor.userId,
        error: String(err),
      });

      // Best-effort minimal profile so the UI can still render something.
      const user = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          globalRole: true,
          userType: true,
          reputationOverallAvg: true,
          reputationOverallCount: true,
          reputationOverallOverride: true,
        },
      });

      if (!user) {
        // Fall back to original error if the user truly does not exist.
        throw err;
      }

      const membership = await this.prisma.companyMembership.findFirst({
        where: { userId: targetUserId, companyId: actor.companyId },
        select: {
          role: true,
          isActive: true,
          company: {
            select: { id: true, name: true },
          },
        },
      });

      if (!membership) {
        throw new ForbiddenException("User is not a member of your company");
      }

      const companyName = membership.company?.name?.toLowerCase() ?? "";
      const isNexusSystemCompany = companyName === "nexus system";
      const isSuperAdmin = actor.globalRole === GlobalRole.SUPER_ADMIN;
      const isOwnerOrAdmin = actor.role === Role.OWNER || actor.role === Role.ADMIN;
      const isHrProfile = actor.profileCode === "HR";

      const canEditHr =
        isSuperAdmin ||
        (isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile)) ||
        (!isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile));

      const canEditWorkerComp =
        isSuperAdmin || (isNexusSystemCompany && (isOwnerOrAdmin || isHrProfile));

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        globalRole: user.globalRole,
        userType: user.userType,
        company: membership.company,
        companyRole: membership.role,
        companyMembershipActive: membership.isActive,
        reputation: {
          avg: user.reputationOverallAvg,
          count: user.reputationOverallCount,
          override: user.reputationOverallOverride,
        },
        portfolio: null,
        hr: null,
        // Preserve HR view capability based on actor + target, even if we
        // failed to load the full HR payload. This lets the UI show a clear
        // "no data" placeholder instead of hiding the section entirely.
        canViewHr: this.canViewHrPortfolio(actor, targetUserId),
        canEditHr,
        canEditWorkerComp,
        worker: null,
        skills: [],
      };
    }
  }
}
