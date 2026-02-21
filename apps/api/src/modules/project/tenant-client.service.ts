import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { EmailService } from "../../common/email.service";
import { UserType, ProjectParticipantScope, ProjectVisibilityLevel } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";

const PASSWORD_RESET_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days for new client invites

export interface CreateTenantClientDto {
  firstName: string;
  lastName: string;
  displayName?: string;
  email?: string;
  phone?: string;
  additionalEmails?: string[];
  additionalPhones?: string[];
  company?: string;
  notes?: string;
}

export interface UpdateTenantClientDto extends Partial<CreateTenantClientDto> {
  active?: boolean;
}

@Injectable()
export class TenantClientService {
  private readonly logger = new Logger(TenantClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  /**
   * Search for tenant clients by name, email, or phone.
   * Also searches project contact data (primaryContact fields) to find
   * contacts from other projects even if not yet in TenantClient table.
   * Returns matches sorted by relevance.
   */
  async search(companyId: string, query: string, limit = 10) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // 1. Search TenantClient records
    const tenantClients = await this.prisma.tenantClient.findMany({
      where: {
        companyId,
        active: true,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        _count: { select: { projects: true } },
      },
      take: limit,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const results: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      email: string | null;
      phone: string | null;
      company: string | null;
      projectCount?: number;
      source: "tenant_client" | "project";
    }> = tenantClients.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName || `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      company: c.company,
      projectCount: c._count.projects,
      source: "tenant_client" as const,
    }));

    // 2. Search project contact fields (primaryContactName, etc.)
    // Only if we need more results
    if (results.length < limit) {
      const projectContacts = await this.prisma.project.findMany({
        where: {
          companyId,
          OR: [
            { primaryContactName: { contains: q, mode: "insensitive" } },
            { primaryContactEmail: { contains: q, mode: "insensitive" } },
            { primaryContactPhone: { contains: q, mode: "insensitive" } },
          ],
          // Exclude projects already linked to a TenantClient
          tenantClientId: null,
        },
        select: {
          id: true,
          primaryContactName: true,
          primaryContactEmail: true,
          primaryContactPhone: true,
        },
        take: limit * 2, // Get more to allow for deduplication
      });

      // Deduplicate by email or phone (case-insensitive)
      const seen = new Set<string>();
      // Add existing results to seen set
      for (const r of results) {
        if (r.email) seen.add(r.email.toLowerCase());
        if (r.phone) seen.add(r.phone.replace(/\D/g, "")); // normalize phone
      }

      for (const p of projectContacts) {
        // Skip if we've already seen this contact
        const emailKey = p.primaryContactEmail?.toLowerCase();
        const phoneKey = p.primaryContactPhone?.replace(/\D/g, "");
        if (emailKey && seen.has(emailKey)) continue;
        if (phoneKey && phoneKey.length >= 7 && seen.has(phoneKey)) continue;

        // Add to results
        results.push({
          id: `project:${p.id}`, // Prefix to distinguish from TenantClient IDs
          firstName: null,
          lastName: null,
          displayName: p.primaryContactName,
          email: p.primaryContactEmail,
          phone: p.primaryContactPhone,
          company: null,
          source: "project" as const,
        });

        // Mark as seen
        if (emailKey) seen.add(emailKey);
        if (phoneKey && phoneKey.length >= 7) seen.add(phoneKey);

        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get a single tenant client with their linked projects.
   */
  async getById(companyId: string, clientId: string) {
    const client = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            addressLine1: true,
            city: true,
            state: true,
          },
          orderBy: { updatedAt: "desc" },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
      additionalEmails: client.additionalEmails as string[] | null,
      additionalPhones: client.additionalPhones as string[] | null,
      company: client.company,
      notes: client.notes,
      active: client.active,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      projects: client.projects,
      // Portal access info
      hasPortalAccess: !!client.userId,
      portalUser: client.user ? {
        id: client.user.id,
        email: client.user.email,
        name: client.user.firstName && client.user.lastName
          ? `${client.user.firstName} ${client.user.lastName}`
          : client.user.email,
      } : null,
    };
  }

  /**
   * Create a new tenant client.
   */
  async create(companyId: string, dto: CreateTenantClientDto) {
    const client = await this.prisma.tenantClient.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        additionalEmails: dto.additionalEmails ?? undefined,
        additionalPhones: dto.additionalPhones ?? undefined,
        company: dto.company,
        notes: dto.notes,
      },
    });

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
    };
  }

  /**
   * Update an existing tenant client.
   */
  async update(companyId: string, clientId: string, dto: UpdateTenantClientDto) {
    // Verify client belongs to this company
    const existing = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
    });

    if (!existing) {
      throw new NotFoundException("Client not found");
    }

    const client = await this.prisma.tenantClient.update({
      where: { id: clientId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        additionalEmails: dto.additionalEmails,
        additionalPhones: dto.additionalPhones,
        company: dto.company,
        notes: dto.notes,
        active: dto.active,
      },
    });

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
      active: client.active,
    };
  }

  /**
   * Create a TenantClient from an existing Nexus User.
   * 
   * Used when a tenant admin finds an existing user via marketplace search
   * and wants to add them as a client. The TenantClient is created and
   * immediately linked to the User, giving them instant portal access.
   * 
   * Pulls as much user data as possible (name, phone, etc.) from the User
   * record and associated onboarding profiles.
   */
  async createFromExistingUser(companyId: string, userId: string, email: string) {
    // 1. Verify the user exists and fetch all available profile data
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        // Get onboarding profile data if available (for phone, additional name data)
        onboardingSessions: {
          select: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: "desc" as const },
          take: 1,
        },
        // Get NexNet candidate data if available
        nexNetCandidate: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Verify email matches (security check)
    if (user.email.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException("Email mismatch");
    }

    // 2. Check if this user is already a client for this company
    const existingClient = await this.prisma.tenantClient.findFirst({
      where: {
        companyId,
        userId: user.id,
      },
    });

    if (existingClient) {
      return {
        id: existingClient.id,
        firstName: existingClient.firstName,
        lastName: existingClient.lastName,
        displayName: existingClient.displayName || `${existingClient.firstName} ${existingClient.lastName}`,
        email: existingClient.email,
        phone: existingClient.phone,
        alreadyExisted: true,
        hasPortalAccess: true,
      };
    }

    // 3. Gather best available data from all sources
    const onboardingProfile = user.onboardingSessions?.[0]?.profile;
    const candidate = user.nexNetCandidate;

    // Priority: User fields > Onboarding profile > NexNet candidate
    // Note: User model doesn't have phone; we get it from profile sources
    const firstName = user.firstName || onboardingProfile?.firstName || candidate?.firstName || "";
    const lastName = user.lastName || onboardingProfile?.lastName || candidate?.lastName || "";
    const phone = onboardingProfile?.phone || candidate?.phone || null;

    // 4. Create new TenantClient linked to user with all available data
    const client = await this.prisma.tenantClient.create({
      data: {
        companyId,
        userId: user.id,
        firstName,
        lastName,
        displayName: firstName && lastName ? `${firstName} ${lastName}` : null,
        email: user.email,
        phone,
      },
    });

    this.logger.log(`Created TenantClient ${client.id} from existing user ${user.id} for company ${companyId}`);

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`.trim() || client.email,
      email: client.email,
      phone: client.phone,
      alreadyExisted: false,
      hasPortalAccess: true,
    };
  }

  /**
   * List all clients for a company.
   */
  async list(companyId: string, includeInactive = false) {
    const clients = await this.prisma.tenantClient.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { active: true }),
      },
      include: {
        _count: { select: { projects: true } },
        user: { select: { id: true, email: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return clients.map((c: typeof clients[number]) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName || `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      company: c.company,
      active: c.active,
      projectCount: c._count.projects,
      hasPortalAccess: !!c.userId,
      portalUserId: c.userId,
    }));
  }

  /**
   * Invite a client to the portal.
   * 
   * Creates or links a User account, then creates ProjectMembership records
   * for all projects linked to this TenantClient.
   * 
   * If the client's email matches an existing user (even INTERNAL), they are
   * linked — allowing employees to also be clients for other projects.
   * 
   * Multi-company support: If another company later invites the same email,
   * the same User is linked to their TenantClient, giving the client a unified
   * view across all companies using NEXUS.
   */
  async inviteToPortal(
    companyId: string,
    clientId: string,
    options?: {
      visibility?: ProjectVisibilityLevel;
      sendEmail?: boolean;
    }
  ) {
    const visibility = options?.visibility ?? ProjectVisibilityLevel.LIMITED;
    const sendEmail = options?.sendEmail ?? true;

    // 1. Load TenantClient and validate
    const client = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
      include: {
        projects: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    if (client.userId) {
      throw new BadRequestException("Client already has portal access");
    }

    if (!client.email) {
      throw new BadRequestException("Client must have an email address to be invited to the portal");
    }

    const normalizedEmail = client.email.trim().toLowerCase();

    // 2. Find or create User
    let user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });

    let isNewUser = false;
    let passwordResetToken: string | null = null;

    if (!user) {
      // Create new user with CLIENT type and a random password
      // Client will use password reset to set their actual password
      const randomPassword = randomUUID();
      const passwordHash = await argon2.hash(randomPassword);

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          userType: UserType.CLIENT,
          firstName: client.firstName,
          lastName: client.lastName,
        },
      });

      isNewUser = true;
      passwordResetToken = randomUUID(); // Will be stored in Redis by caller if email is sent
    }

    // 3. Link TenantClient to User
    await this.prisma.tenantClient.update({
      where: { id: clientId },
      data: { userId: user.id },
    });

    // 4. Create ProjectMembership for each linked project
    const membershipResults = await Promise.all(
      client.projects.map(async (project) => {
        try {
          await this.prisma.projectMembership.upsert({
            where: {
              userId_projectId: {
                userId: user!.id,
                projectId: project.id,
              },
            },
            create: {
              userId: user!.id,
              projectId: project.id,
              companyId,
              role: "VIEWER",
              scope: ProjectParticipantScope.EXTERNAL_CONTACT,
              visibility,
            },
            update: {}, // no-op if already exists
          });
          return { projectId: project.id, projectName: project.name, success: true };
        } catch (error) {
          return { projectId: project.id, projectName: project.name, success: false, error: String(error) };
        }
      })
    );

    // 5. Send welcome email if requested
    const webBase = process.env.WEB_BASE_URL || "https://ncc-nexus-contractor-connect.com";
    const portalUrl = `${webBase.replace(/\/$/, "")}/projects/portal/my-projects`;
    let passwordResetUrl: string | null = null;

    if (sendEmail && client.email) {
      // Get company name for email
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      const companyName = company?.name || "Your contractor";

      // For new users, store client invite token with extra metadata and generate URL
      if (isNewUser && passwordResetToken) {
        const redisClient = this.redis.getClient();
        await redisClient.setex(
          `clientinvite:${passwordResetToken}`,
          PASSWORD_RESET_TTL_SECONDS,
          JSON.stringify({
            userId: user.id,
            email: user.email,
            firstName: client.firstName,
            lastName: client.lastName,
            companyName,
          }),
        );
        // Use simplified client registration page instead of generic password reset
        passwordResetUrl = `${webBase.replace(/\/$/, "")}/register/client?token=${encodeURIComponent(passwordResetToken)}`;
      }

      // Get project details for the email
      const projectsWithAddress = await this.prisma.project.findMany({
        where: { id: { in: client.projects.map((p) => p.id) } },
        select: { name: true, addressLine1: true, city: true, state: true },
      });

      try {
        await this.email.sendClientPortalInvite({
          toEmail: client.email,
          clientName: client.displayName || `${client.firstName} ${client.lastName}`,
          companyName,
          projects: projectsWithAddress.map((p) => ({
            name: p.name,
            address: p.addressLine1 ? `${p.addressLine1}, ${p.city}, ${p.state}` : undefined,
          })),
          portalUrl,
          isNewUser,
          passwordResetUrl: passwordResetUrl || undefined,
        });
        this.logger.log(`Sent client portal invite email to ${client.email}`);
      } catch (err) {
        this.logger.error(`Failed to send client portal invite email to ${client.email}: ${err}`);
        // Don't fail the invite if email fails
      }
    }

    return {
      success: true,
      client: {
        id: client.id,
        displayName: client.displayName || `${client.firstName} ${client.lastName}`,
        email: client.email,
      },
      user: {
        id: user.id,
        email: user.email,
        isNewUser,
      },
      projectsGranted: membershipResults.filter((r) => r.success).map((r) => ({
        id: r.projectId,
        name: r.projectName,
      })),
      visibility,
      emailSent: sendEmail && !!client.email,
    };
  }

  /**
   * Revoke a client's portal access.
   * 
   * Unlinks the User from the TenantClient and removes all ProjectMemberships
   * for projects linked to this TenantClient.
   */
  async revokePortalAccess(companyId: string, clientId: string) {
    const client = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
      include: {
        projects: { select: { id: true } },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    if (!client.userId) {
      throw new BadRequestException("Client does not have portal access");
    }

    const userId = client.userId;

    // Remove ProjectMemberships for this client's projects
    await this.prisma.projectMembership.deleteMany({
      where: {
        userId,
        projectId: { in: client.projects.map((p) => p.id) },
        scope: ProjectParticipantScope.EXTERNAL_CONTACT,
      },
    });

    // Unlink user from TenantClient
    await this.prisma.tenantClient.update({
      where: { id: clientId },
      data: { userId: null },
    });

    return {
      success: true,
      revokedUserId: userId,
      projectsRevoked: client.projects.length,
    };
  }
}
