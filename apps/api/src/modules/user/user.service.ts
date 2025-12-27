import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "@prisma/client";
import {
  decryptPortfolioHrJson,
  encryptPortfolioHrJson,
} from "../../common/crypto/portfolio-hr.crypto";

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
};

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
        memberships: {
          select: {
            companyId: true,
            role: true,
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

  async updateMe(userId: string, dto: { firstName?: string; lastName?: string }) {
    const firstName = dto.firstName != null ? dto.firstName.trim() : undefined;
    const lastName = dto.lastName != null ? dto.lastName.trim() : undefined;

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: firstName === "" ? null : firstName,
        lastName: lastName === "" ? null : lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        globalRole: true,
        userType: true,
      },
    });
  }

  private canViewHrPortfolio(actor: AuthenticatedUser, targetUserId: string) {
    if (actor.userId === targetUserId) return true;
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) return true;
    if (actor.profileCode === "HR") return true;
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

  async getProfile(targetUserId: string, actor: AuthenticatedUser) {
    // Ensure target user is a member of the actor's company
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: targetUserId, companyId: actor.companyId },
      select: {
        role: true,
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

    return {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
      userType: user.userType,
      company: membership.company,
      companyRole: membership.role,
      reputation: {
        avg: user.reputationOverallAvg,
        count: user.reputationOverallCount,
        override: user.reputationOverallOverride,
      },
      skills,
    };
  }
}
