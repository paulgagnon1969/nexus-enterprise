import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  ClaimJournalService,
  CreateCarrierContactDto,
  UpdateCarrierContactDto,
  CreateJournalEntryDto,
  JournalListFilters,
} from "./claim-journal.service";
import { ClaimJournalEntryType, ClaimJournalDirection } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Carrier Contacts Controller (Company-wide)
// ─────────────────────────────────────────────────────────────────────────────

@Controller("company/carrier-contacts")
export class CarrierContactsController {
  constructor(private readonly service: ClaimJournalService) {}

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get()
  listContacts(
    @Req() req: any,
    @Query("includeInactive") includeInactive?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.listCarrierContacts(actor, includeInactive === "true");
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  createContact(@Req() req: any, @Body() dto: CreateCarrierContactDto) {
    const actor = req.user as AuthenticatedUser;
    return this.service.createCarrierContact(actor, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":id")
  updateContact(
    @Req() req: any,
    @Param("id") contactId: string,
    @Body() dto: UpdateCarrierContactDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.updateCarrierContact(actor, contactId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(":id")
  deleteContact(@Req() req: any, @Param("id") contactId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.service.deleteCarrierContact(actor, contactId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Journal Entries Controller (Project-scoped)
// ─────────────────────────────────────────────────────────────────────────────

@Controller("projects/:projectId/journal")
export class JournalEntriesController {
  constructor(private readonly service: ClaimJournalService) {}

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get()
  listEntries(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("entryType") entryType?: ClaimJournalEntryType,
    @Query("direction") direction?: ClaimJournalDirection,
    @Query("carrierContactId") carrierContactId?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    const filters: JournalListFilters = {
      entryType,
      direction,
      carrierContactId,
      fromDate,
      toDate,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.service.listJournalEntries(actor, projectId, filters);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get(":entryId")
  getEntry(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("entryId") entryId: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.getJournalEntry(actor, projectId, entryId);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  createEntry(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateJournalEntryDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.createJournalEntry(actor, projectId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":entryId/correct")
  createCorrection(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("entryId") entryId: string,
    @Body() dto: CreateJournalEntryDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.createCorrectionEntry(actor, projectId, entryId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Attachments
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":entryId/attachments")
  addAttachment(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("entryId") entryId: string,
    @Body()
    body: {
      fileName: string;
      fileType?: string;
      fileSize?: number;
      storageKey: string;
      storageUrl?: string;
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.addAttachment(actor, projectId, entryId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(":entryId/attachments/:attachmentId")
  deleteAttachment(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("entryId") entryId: string,
    @Param("attachmentId") attachmentId: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.service.deleteAttachment(actor, projectId, entryId, attachmentId);
  }
}
