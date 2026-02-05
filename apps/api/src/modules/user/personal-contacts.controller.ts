import { Controller, Post, Get, Patch, Body, Query, Req, UseGuards, Param } from "@nestjs/common";
import { JwtAuthGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { PersonalContactsService } from "./personal-contacts.service";
import { PersonalContactSource, PersonalContactSubjectType } from "@prisma/client";

@Controller("personal-contacts")
export class PersonalContactsController {
  constructor(private readonly contacts: PersonalContactsService) {}

  @UseGuards(JwtAuthGuard)
  @Post("import")
  async importContacts(
    @Req() req: any,
    @Body()
    body: {
      contacts: Array<{
        displayName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        allEmails?: string[] | null;
        allPhones?: string[] | null;
        source?: PersonalContactSource | null;
      }>;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.importContacts(actor, body?.contacts ?? []);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":contactId/primary")
  async updatePrimary(
    @Req() req: any,
    @Param("contactId") contactId: string,
    @Body() body: { email?: string | null; phone?: string | null },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.updatePrimaryContact(actor, contactId, body.email, body.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listContacts(
    @Req() req: any,
    @Query("search") search?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    const limit = limitRaw ? parseInt(limitRaw, 10) || 50 : 50;
    return this.contacts.listContacts(actor, search ?? null, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Post("links")
  async createLink(
    @Req() req: any,
    @Body()
    body: {
      personalContactId: string;
      subjectType: PersonalContactSubjectType;
      subjectId: string;
      tenantId?: string | null;
      note?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.linkToSubject(
      actor,
      body.personalContactId,
      body.subjectType,
      body.subjectId,
      body.tenantId ?? null,
      body.note ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("for-candidate/:candidateId")
  async getForCandidate(
    @Req() req: any,
    @Param("candidateId") candidateId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.getContactsForCandidate(actor, candidateId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("for-worker/:workerId")
  async getForWorker(
    @Req() req: any,
    @Param("workerId") workerId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.getContactsForWorker(actor, workerId);
  }

  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("admin/import-for-user")
  async adminImportForUser(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      contacts: Array<{
        displayName?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
        allEmails?: string[] | null;
        allPhones?: string[] | null;
        source?: PersonalContactSource | null;
      }>;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.contacts.importContactsForUser(actor, body?.userId, body?.contacts ?? []);
  }
}
