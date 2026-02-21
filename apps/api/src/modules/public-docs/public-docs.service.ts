import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EmailService } from "../../common/email.service";
import * as crypto from "crypto";
import {
  CreateShareLinkDto,
  UpdatePublicSettingsDto,
  CreateSecureShareDto,
  CreateReaderGroupDto,
  UpdateReaderGroupDto,
  AddReaderGroupMembersDto,
} from "./dto/public-doc.dto";

@Injectable()
export class PublicDocsService {
  private readonly logger = new Logger(PublicDocsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private generateToken(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  private generatePassword(length = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }

  private hashPasscode(passcode: string): string {
    return crypto.createHash("sha256").update(passcode).digest("hex");
  }

  // =========================================================================
  // Public Portal (No Auth Required)
  // =========================================================================

  /**
   * Get all public manuals and documents for the public portal
   */
  async getPublicPortal() {
    const [manuals, documents] = await Promise.all([
      // Get all public published manuals
      this.prisma.manual.findMany({
        where: {
          isPublic: true,
          status: "PUBLISHED",
          publicSlug: { not: null },
        },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          publicSlug: true,
          iconEmoji: true,
          coverImageUrl: true,
          currentVersion: true,
          publishedAt: true,
          _count: {
            select: {
              chapters: { where: { active: true } },
              documents: { where: { active: true } },
            },
          },
        },
        orderBy: { title: "asc" },
      }),
      // Get all public documents (standalone, not part of manuals)
      this.prisma.systemDocument.findMany({
        where: {
          isPublic: true,
          active: true,
          publicSlug: { not: null },
        },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          publicSlug: true,
          category: true,
          subcategory: true,
          currentVersion: {
            select: { versionNo: true, createdAt: true },
          },
        },
        orderBy: [{ category: "asc" }, { title: "asc" }],
      }),
    ]);

    return {
      manuals: manuals.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        description: m.description,
        slug: m.publicSlug,
        iconEmoji: m.iconEmoji,
        coverImageUrl: m.coverImageUrl,
        version: m.currentVersion,
        publishedAt: m.publishedAt,
        chapterCount: m._count.chapters,
        documentCount: m._count.documents,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        description: d.description,
        slug: d.publicSlug,
        category: d.category,
        subcategory: d.subcategory,
        versionNo: d.currentVersion?.versionNo,
        updatedAt: d.currentVersion?.createdAt,
      })),
    };
  }

  // =========================================================================
  // Public Document Access (No Auth Required)
  // =========================================================================

  async getPublicDocument(slug: string) {
    const doc = await this.prisma.systemDocument.findFirst({
      where: {
        publicSlug: slug,
        isPublic: true,
        active: true,
      },
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            htmlContent: true,
            createdAt: true,
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    return {
      id: doc.id,
      code: doc.code,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      subcategory: doc.subcategory,
      versionNo: doc.currentVersion?.versionNo,
      htmlContent: doc.currentVersion?.htmlContent,
      updatedAt: doc.currentVersion?.createdAt || doc.updatedAt,
    };
  }

  async getPublicManual(slug: string) {
    const manual = await this.prisma.manual.findFirst({
      where: {
        publicSlug: slug,
        isPublic: true,
        status: "PUBLISHED",
      },
      include: {
        chapters: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          include: {
            documents: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    currentVersion: {
                      select: { versionNo: true, htmlContent: true },
                    },
                  },
                },
              },
            },
          },
        },
        documents: {
          where: { active: true, chapterId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            systemDocument: {
              select: {
                id: true,
                code: true,
                title: true,
                currentVersion: {
                  select: { versionNo: true, htmlContent: true },
                },
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return {
      id: manual.id,
      code: manual.code,
      title: manual.title,
      description: manual.description,
      version: manual.currentVersion,
      iconEmoji: manual.iconEmoji,
      coverImageUrl: manual.coverImageUrl,
      publishedAt: manual.publishedAt,
      chapters: manual.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        documents: ch.documents.map((d) => ({
          id: d.id,
          title: d.displayTitleOverride || d.systemDocument.title,
          code: d.systemDocument.code,
          versionNo: d.systemDocument.currentVersion?.versionNo,
          htmlContent: d.systemDocument.currentVersion?.htmlContent,
        })),
      })),
      rootDocuments: manual.documents.map((d) => ({
        id: d.id,
        title: d.displayTitleOverride || d.systemDocument.title,
        code: d.systemDocument.code,
        versionNo: d.systemDocument.currentVersion?.versionNo,
        htmlContent: d.systemDocument.currentVersion?.htmlContent,
      })),
    };
  }

  // =========================================================================
  // Share Link Access (Token Required)
  // =========================================================================

  async accessShareLink(token: string, passcode?: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { accessToken: token },
      include: {
        systemDocument: {
          include: {
            currentVersion: {
              select: { versionNo: true, htmlContent: true, createdAt: true },
            },
          },
        },
        manual: {
          include: {
            chapters: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                documents: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  include: {
                    systemDocument: {
                      select: {
                        id: true,
                        code: true,
                        title: true,
                        currentVersion: { select: { versionNo: true, htmlContent: true } },
                      },
                    },
                  },
                },
              },
            },
            documents: {
              where: { active: true, chapterId: null },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    currentVersion: { select: { versionNo: true, htmlContent: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException("Share link not found or has been revoked");
    }

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new ForbiddenException("This share link has expired");
    }

    // Check passcode
    if (link.passcode) {
      if (!passcode) {
        throw new ForbiddenException("This link requires a passcode");
      }
      if (this.hashPasscode(passcode) !== link.passcode) {
        throw new ForbiddenException("Invalid passcode");
      }
    }

    // Update access stats
    await this.prisma.documentShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // Return document or manual content
    if (link.systemDocument) {
      return {
        type: "document",
        id: link.systemDocument.id,
        code: link.systemDocument.code,
        title: link.systemDocument.title,
        description: link.systemDocument.description,
        category: link.systemDocument.category,
        versionNo: link.systemDocument.currentVersion?.versionNo,
        htmlContent: link.systemDocument.currentVersion?.htmlContent,
        updatedAt: link.systemDocument.currentVersion?.createdAt,
      };
    }

    if (link.manual) {
      return {
        type: "manual",
        id: link.manual.id,
        code: link.manual.code,
        title: link.manual.title,
        description: link.manual.description,
        version: link.manual.currentVersion,
        iconEmoji: link.manual.iconEmoji,
        coverImageUrl: link.manual.coverImageUrl,
        chapters: link.manual.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          description: ch.description,
          documents: ch.documents.map((d) => ({
            id: d.id,
            title: d.displayTitleOverride || d.systemDocument.title,
            code: d.systemDocument.code,
            versionNo: d.systemDocument.currentVersion?.versionNo,
            htmlContent: d.systemDocument.currentVersion?.htmlContent,
          })),
        })),
        rootDocuments: link.manual.documents.map((d) => ({
          id: d.id,
          title: d.displayTitleOverride || d.systemDocument.title,
          code: d.systemDocument.code,
          versionNo: d.systemDocument.currentVersion?.versionNo,
          htmlContent: d.systemDocument.currentVersion?.htmlContent,
        })),
      };
    }

    throw new NotFoundException("Link target not found");
  }

  // =========================================================================
  // Share Link Management (Auth Required - Super Admin)
  // =========================================================================

  async createDocumentShareLink(documentId: string, userId: string, dto: CreateShareLinkDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    return this.prisma.documentShareLink.create({
      data: {
        systemDocumentId: documentId,
        accessToken: this.generateToken(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        passcode: dto.passcode ? this.hashPasscode(dto.passcode) : null,
        createdByUserId: userId,
      },
    });
  }

  async createManualShareLink(manualId: string, userId: string, dto: CreateShareLinkDto) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return this.prisma.documentShareLink.create({
      data: {
        manualId,
        accessToken: this.generateToken(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        passcode: dto.passcode ? this.hashPasscode(dto.passcode) : null,
        createdByUserId: userId,
      },
    });
  }

  async listDocumentShareLinks(documentId: string) {
    return this.prisma.documentShareLink.findMany({
      where: { systemDocumentId: documentId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listManualShareLinks(manualId: string) {
    return this.prisma.documentShareLink.findMany({
      where: { manualId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeShareLink(linkId: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      throw new NotFoundException("Share link not found");
    }

    return this.prisma.documentShareLink.update({
      where: { id: linkId },
      data: { isActive: false },
    });
  }

  async deleteShareLink(linkId: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      throw new NotFoundException("Share link not found");
    }

    await this.prisma.documentShareLink.delete({
      where: { id: linkId },
    });

    return { success: true };
  }

  // =========================================================================
  // Public Settings Management (Auth Required - Super Admin)
  // =========================================================================

  async updateDocumentPublicSettings(documentId: string, dto: UpdatePublicSettingsDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    // Check slug uniqueness if changing
    if (dto.publicSlug && dto.publicSlug !== doc.publicSlug) {
      const existing = await this.prisma.systemDocument.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (existing) {
        throw new ConflictException(`Slug "${dto.publicSlug}" is already in use`);
      }
    }

    return this.prisma.systemDocument.update({
      where: { id: documentId },
      data: {
        publicSlug: dto.publicSlug === "" ? null : dto.publicSlug ?? doc.publicSlug,
        isPublic: dto.isPublic ?? doc.isPublic,
      },
      select: {
        id: true,
        code: true,
        title: true,
        publicSlug: true,
        isPublic: true,
      },
    });
  }

  async updateManualPublicSettings(manualId: string, dto: UpdatePublicSettingsDto) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Check slug uniqueness if changing
    if (dto.publicSlug && dto.publicSlug !== manual.publicSlug) {
      const existing = await this.prisma.manual.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (existing) {
        throw new ConflictException(`Slug "${dto.publicSlug}" is already in use`);
      }
    }

    return this.prisma.manual.update({
      where: { id: manualId },
      data: {
        publicSlug: dto.publicSlug === "" ? null : dto.publicSlug ?? manual.publicSlug,
        isPublic: dto.isPublic ?? manual.isPublic,
      },
      select: {
        id: true,
        code: true,
        title: true,
        publicSlug: true,
        isPublic: true,
      },
    });
  }

  // =========================================================================
  // Secure Share (Email-Verified, Password-Protected)
  // =========================================================================

  /**
   * Create per-recipient secure share links for a document.
   * Each recipient gets a unique token + randomly generated password.
   * Two separate emails are sent per recipient: (1) share URL, (2) password.
   */
  async createSecureDocumentShare(
    documentId: string,
    userId: string,
    dto: CreateSecureShareDto,
    baseUrl: string,
  ) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, code: true },
    });
    if (!doc) throw new NotFoundException("Document not found");

    // Build full recipient list (explicit + reader group members)
    const recipients = await this.resolveRecipients(dto);
    if (recipients.length === 0) {
      throw new BadRequestException("At least one recipient is required");
    }

    // Look up the sender's name
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(" ") || "NEXUS";

    const results: { email: string; linkId: string; sent: boolean }[] = [];

    for (const recipient of recipients) {
      const token = this.generateToken();
      const password = this.generatePassword();

      const link = await this.prisma.documentShareLink.create({
        data: {
          systemDocumentId: documentId,
          accessToken: token,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          passcode: this.hashPasscode(password),
          recipientEmail: recipient.email.toLowerCase(),
          recipientName: recipient.name || null,
          createdByUserId: userId,
        },
      });

      const shareUrl = `${baseUrl}/share/${token}`;

      // Send two separate emails (fire-and-forget, log errors)
      try {
        await this.email.sendDocumentShareAccess({
          toEmail: recipient.email,
          recipientName: recipient.name,
          documentTitle: doc.title,
          shareUrl,
          senderName,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        });
        await this.email.sendDocumentSharePassword({
          toEmail: recipient.email,
          recipientName: recipient.name,
          documentTitle: doc.title,
          password,
        });
        results.push({ email: recipient.email, linkId: link.id, sent: true });
      } catch (err: any) {
        this.logger.error(`Failed to send secure share emails to ${recipient.email}: ${err?.message}`);
        results.push({ email: recipient.email, linkId: link.id, sent: false });
      }
    }

    return { documentId, documentTitle: doc.title, recipients: results };
  }

  /**
   * Create per-recipient secure share links for a manual.
   */
  async createSecureManualShare(
    manualId: string,
    userId: string,
    dto: CreateSecureShareDto,
    baseUrl: string,
  ) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
      select: { id: true, title: true, code: true },
    });
    if (!manual) throw new NotFoundException("Manual not found");

    const recipients = await this.resolveRecipients(dto);
    if (recipients.length === 0) {
      throw new BadRequestException("At least one recipient is required");
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(" ") || "NEXUS";

    const results: { email: string; linkId: string; sent: boolean }[] = [];

    for (const recipient of recipients) {
      const token = this.generateToken();
      const password = this.generatePassword();

      const link = await this.prisma.documentShareLink.create({
        data: {
          manualId,
          accessToken: token,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          passcode: this.hashPasscode(password),
          recipientEmail: recipient.email.toLowerCase(),
          recipientName: recipient.name || null,
          createdByUserId: userId,
        },
      });

      const shareUrl = `${baseUrl}/share/${token}`;

      try {
        await this.email.sendDocumentShareAccess({
          toEmail: recipient.email,
          recipientName: recipient.name,
          documentTitle: manual.title,
          shareUrl,
          senderName,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        });
        await this.email.sendDocumentSharePassword({
          toEmail: recipient.email,
          recipientName: recipient.name,
          documentTitle: manual.title,
          password,
        });
        results.push({ email: recipient.email, linkId: link.id, sent: true });
      } catch (err: any) {
        this.logger.error(`Failed to send secure share emails to ${recipient.email}: ${err?.message}`);
        results.push({ email: recipient.email, linkId: link.id, sent: false });
      }
    }

    return { manualId, manualTitle: manual.title, recipients: results };
  }

  /**
   * Verify a secure share link using email + password.
   * Returns document/manual content on success.
   */
  async accessSecureShareLink(token: string, email: string, password: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { accessToken: token },
      include: {
        systemDocument: {
          include: {
            currentVersion: {
              select: { versionNo: true, htmlContent: true, createdAt: true },
            },
          },
        },
        manual: {
          include: {
            chapters: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                documents: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  include: {
                    systemDocument: {
                      select: {
                        id: true,
                        code: true,
                        title: true,
                        currentVersion: { select: { versionNo: true, htmlContent: true } },
                      },
                    },
                  },
                },
              },
            },
            documents: {
              where: { active: true, chapterId: null },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    currentVersion: { select: { versionNo: true, htmlContent: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException("Share link not found or has been revoked");
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new ForbiddenException("This share link has expired");
    }

    // Validate email matches recipient
    if (link.recipientEmail && link.recipientEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ForbiddenException("Invalid credentials");
    }

    // Validate password
    if (link.passcode) {
      if (this.hashPasscode(password) !== link.passcode) {
        throw new ForbiddenException("Invalid credentials");
      }
    }

    // Update access stats
    await this.prisma.documentShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // Return content (reuse same response shape as accessShareLink)
    if (link.systemDocument) {
      return {
        type: "document",
        id: link.systemDocument.id,
        code: link.systemDocument.code,
        title: link.systemDocument.title,
        description: link.systemDocument.description,
        category: link.systemDocument.category,
        versionNo: link.systemDocument.currentVersion?.versionNo,
        htmlContent: link.systemDocument.currentVersion?.htmlContent,
        updatedAt: link.systemDocument.currentVersion?.createdAt,
      };
    }

    if (link.manual) {
      return {
        type: "manual",
        id: link.manual.id,
        code: link.manual.code,
        title: link.manual.title,
        description: link.manual.description,
        version: link.manual.currentVersion,
        iconEmoji: link.manual.iconEmoji,
        coverImageUrl: link.manual.coverImageUrl,
        chapters: link.manual.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          description: ch.description,
          documents: ch.documents.map((d) => ({
            id: d.id,
            title: d.displayTitleOverride || d.systemDocument.title,
            code: d.systemDocument.code,
            versionNo: d.systemDocument.currentVersion?.versionNo,
            htmlContent: d.systemDocument.currentVersion?.htmlContent,
          })),
        })),
        rootDocuments: link.manual.documents.map((d) => ({
          id: d.id,
          title: d.displayTitleOverride || d.systemDocument.title,
          code: d.systemDocument.code,
          versionNo: d.systemDocument.currentVersion?.versionNo,
          htmlContent: d.systemDocument.currentVersion?.htmlContent,
        })),
      };
    }

    throw new NotFoundException("Link target not found");
  }

  /**
   * List secure share links for a document (only those with recipientEmail).
   */
  async listSecureDocumentShares(documentId: string) {
    return this.prisma.documentShareLink.findMany({
      where: {
        systemDocumentId: documentId,
        recipientEmail: { not: null },
      },
      select: {
        id: true,
        recipientEmail: true,
        recipientName: true,
        isActive: true,
        accessCount: true,
        lastAccessedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * List secure share links for a manual (only those with recipientEmail).
   */
  async listSecureManualShares(manualId: string) {
    return this.prisma.documentShareLink.findMany({
      where: {
        manualId,
        recipientEmail: { not: null },
      },
      select: {
        id: true,
        recipientEmail: true,
        recipientName: true,
        isActive: true,
        accessCount: true,
        lastAccessedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Resolve the full recipient list from explicit emails + reader group.
   */
  private async resolveRecipients(
    dto: CreateSecureShareDto,
  ): Promise<{ email: string; name?: string }[]> {
    const map = new Map<string, { email: string; name?: string }>();

    // Add explicit recipients
    for (const r of dto.recipients || []) {
      map.set(r.email.toLowerCase(), { email: r.email.toLowerCase(), name: r.name });
    }

    // Add reader group members
    if (dto.readerGroupId) {
      const group = await this.prisma.readerGroup.findUnique({
        where: { id: dto.readerGroupId },
        include: { members: true },
      });
      if (group) {
        for (const m of group.members) {
          if (!map.has(m.email.toLowerCase())) {
            map.set(m.email.toLowerCase(), {
              email: m.email.toLowerCase(),
              name: m.displayName || undefined,
            });
          }
        }
      }
    }

    return Array.from(map.values());
  }

  // =========================================================================
  // Reader Group Management (Admin)
  // =========================================================================

  async createReaderGroup(userId: string, dto: CreateReaderGroupDto) {
    return this.prisma.readerGroup.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        createdByUserId: userId,
      },
      include: { members: true },
    });
  }

  async listReaderGroups() {
    return this.prisma.readerGroup.findMany({
      include: {
        _count: { select: { members: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async getReaderGroup(id: string) {
    const group = await this.prisma.readerGroup.findUnique({
      where: { id },
      include: {
        members: { orderBy: { email: "asc" } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!group) throw new NotFoundException("Reader group not found");
    return group;
  }

  async updateReaderGroup(id: string, dto: UpdateReaderGroupDto) {
    const group = await this.prisma.readerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException("Reader group not found");

    return this.prisma.readerGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
      include: { members: { orderBy: { email: "asc" } } },
    });
  }

  async addReaderGroupMembers(groupId: string, dto: AddReaderGroupMembersDto) {
    const group = await this.prisma.readerGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException("Reader group not found");

    const results: { email: string; added: boolean; reason?: string }[] = [];

    for (const m of dto.members) {
      try {
        await this.prisma.readerGroupMember.create({
          data: {
            groupId,
            email: m.email.toLowerCase(),
            displayName: m.displayName || null,
          },
        });
        results.push({ email: m.email, added: true });
      } catch (err: any) {
        // Unique constraint violation = already a member
        if (err?.code === "P2002") {
          results.push({ email: m.email, added: false, reason: "already a member" });
        } else {
          throw err;
        }
      }
    }

    return { groupId, results };
  }

  async removeReaderGroupMember(groupId: string, memberId: string) {
    const member = await this.prisma.readerGroupMember.findFirst({
      where: { id: memberId, groupId },
    });
    if (!member) throw new NotFoundException("Member not found");

    await this.prisma.readerGroupMember.delete({ where: { id: memberId } });
    return { success: true };
  }

  async deleteReaderGroup(id: string) {
    const group = await this.prisma.readerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException("Reader group not found");

    await this.prisma.readerGroup.delete({ where: { id } });
    return { success: true };
  }
}
