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
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CsvImportService } from "./csv-import.service";
import { DuplicateBillDetectorService } from "./duplicate-bill-detector.service";
import { CsvImportSource, TransactionDisposition } from "@prisma/client";

const VALID_SOURCES: Record<string, CsvImportSource> = {
  HD_PRO_XTRA: CsvImportSource.HD_PRO_XTRA,
  CHASE_BANK: CsvImportSource.CHASE_BANK,
  APPLE_CARD: CsvImportSource.APPLE_CARD,
};

const VALID_DISPOSITIONS: Record<string, TransactionDisposition> = {
  UNREVIEWED: TransactionDisposition.UNREVIEWED,
  PENDING_APPROVAL: TransactionDisposition.PENDING_APPROVAL,
  ASSIGNED: TransactionDisposition.ASSIGNED,
  IGNORED: TransactionDisposition.IGNORED,
  PERSONAL: TransactionDisposition.PERSONAL,
  DUPLICATE: TransactionDisposition.DUPLICATE,
  RETURNED: TransactionDisposition.RETURNED,
};

@Controller("banking")
@UseGuards(JwtAuthGuard)
export class CsvImportController {
  constructor(
    private readonly csvImport: CsvImportService,
    private readonly duplicateDetector: DuplicateBillDetectorService,
  ) {}

  // ─── Upload & parse a CSV ────────────────────────────────────────

  @Post("csv-import")
  async uploadCsv(@Req() req: FastifyRequest) {
    const actor = (req as any).user as AuthenticatedUser;

    // Read multipart
    const parts = (req as any).parts?.();
    if (!parts) throw new BadRequestException("Multipart upload required.");

    let fileBuffer: Buffer | null = null;
    let fileName = "upload.csv";
    let sourceStr: string | null = null;

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "source") {
        sourceStr = String(part.value).trim();
        continue;
      }
      if (part.type === "file" && part.fieldname === "file") {
        fileName = part.filename || fileName;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        fileBuffer = Buffer.concat(chunks);
        continue;
      }
    }

    if (!fileBuffer) throw new BadRequestException("A CSV file is required.");
    if (!sourceStr) throw new BadRequestException("A 'source' field is required (HD_PRO_XTRA, CHASE_BANK, APPLE_CARD).");

    const source = VALID_SOURCES[sourceStr];
    if (!source) {
      throw new BadRequestException(
        `Invalid source '${sourceStr}'. Must be one of: ${Object.keys(VALID_SOURCES).join(", ")}`,
      );
    }

    return this.csvImport.importCsv(actor, source, fileBuffer, fileName);
  }

  // ─── List import batches ─────────────────────────────────────────

  @Get("csv-imports")
  async listBatches(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.listBatches(actor.companyId);
  }

  // ─── Delete an import batch ──────────────────────────────────────

  @Delete("csv-imports/:batchId")
  async deleteBatch(@Req() req: any, @Param("batchId") batchId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.deleteBatch(actor.companyId, batchId);
  }

  // ─── Undo import (safe delete + return raw CSV) ─────────────────

  @Post("csv-imports/:batchId/undo")
  async undoImport(@Req() req: any, @Param("batchId") batchId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.undoImport(actor.companyId, batchId);
  }

  // ─── Bulk undo imports ──────────────────────────────────────────

  @Post("csv-imports/bulk-undo")
  async bulkUndoImport(@Req() req: any, @Body() body: { batchIds: string[] }) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.bulkUndoImport(actor.companyId, body.batchIds);
  }

  // ─── Unified transactions (Plaid + CSV) ──────────────────────────

  @Get("transactions/unified")
  async getUnifiedTransactions(
    @Req() req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("search") search?: string,
    @Query("source") source?: string,
    @Query("connectionId") connectionId?: string,
    @Query("batchId") batchId?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDir") sortDir?: string,
    @Query("category") category?: string,
    @Query("pending") pending?: string,
    @Query("projectId") projectId?: string,
    @Query("unassigned") unassigned?: string,
    @Query("disposition") disposition?: string,
    @Query("merchant") merchant?: string,
    @Query("accountMask") accountMask?: string,
    @Query("amountSearch") amountSearch?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getUnifiedTransactions(actor.companyId, {
      startDate,
      endDate,
      search,
      source,
      connectionId,
      batchId,
      sortBy: sortBy as any,
      sortDir: (sortDir === "asc" || sortDir === "desc") ? sortDir : undefined,
      category,
      pending: pending !== undefined ? pending === "true" : undefined,
      projectId,
      unassigned: unassigned === "true",
      disposition: disposition || undefined,
      merchant,
      accountMask: accountMask || undefined,
      amountSearch: amountSearch || undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  // ─── Assign transaction to project ────────────────────────────────

  @Patch("transactions/:id/assign-project")
  async assignProject(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { projectId: string | null; source: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.assignTransactionToProject(
      actor.companyId,
      id,
      body.source,
      body.projectId,
      actor.userId,
    );
  }

  // ─── Bulk assign transactions to project ──────────────────────────

  @Patch("transactions/bulk-assign-project")
  async bulkAssignProject(
    @Req() req: any,
    @Body() body: { ids: Array<{ id: string; source: string }>; projectId: string | null },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.bulkAssignProject(actor.companyId, body.ids, body.projectId, actor.userId);
  }

  // ─── Distinct categories ──────────────────────────────────────────

  @Get("transactions/categories")
  async getCategories(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getDistinctCategories(actor.companyId);
  }

  // ─── Raw transaction detail ──────────────────────────────────────

  @Get("transactions/:id/raw")
  async getRawTransaction(
    @Req() req: any,
    @Param("id") id: string,
    @Query("source") source: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getRawTransaction(actor.companyId, id, source);
  }

  // ─── Prescreen accept/reject/override ──────────────────────────────

  @Patch("transactions/:id/prescreen-accept")
  async acceptPrescreen(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.acceptPrescreen(actor.companyId, id, actor.userId);
  }

  @Patch("transactions/:id/prescreen-reject")
  async rejectPrescreen(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.rejectPrescreen(actor.companyId, id, body.reason, actor.userId);
  }

  @Patch("transactions/:id/prescreen-override")
  async overridePrescreen(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { projectId: string; reason: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.overridePrescreen(actor.companyId, id, body.projectId, body.reason, actor.userId);
  }

  @Patch("transactions/bulk-prescreen-accept")
  async bulkAcceptPrescreen(
    @Req() req: any,
    @Body() body: { transactionIds: string[] },
  ) {
    const actor = req.user as AuthenticatedUser;
    const results = [];
    for (const txnId of body.transactionIds) {
      try {
        await this.csvImport.acceptPrescreen(actor.companyId, txnId, actor.userId);
        results.push({ id: txnId, ok: true });
      } catch (err: any) {
        results.push({ id: txnId, ok: false, error: err.message });
      }
    }
    return { results, accepted: results.filter((r) => r.ok).length };
  }

  // ─── Bulk accept by confidence threshold ──────────────────────────

  @Patch("transactions/bulk-prescreen-accept-by-confidence")
  async bulkAcceptByConfidence(
    @Req() req: any,
    @Body() body: { minConfidence: number; projectId?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.bulkAcceptByConfidence(
      actor.companyId,
      body.minConfidence ?? 0.7,
      actor.userId,
      body.projectId,
    );
  }

  // ─── Per-project summary ──────────────────────────────────────────

  @Get("projects-summary")
  async getProjectsSummary(
    @Req() req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getProjectsSummary(actor.companyId, startDate, endDate);
  }

  // ─── Store-to-card reconciliation ─────────────────────────────────

  @Get("reconciliation/store-card-matches")
  async getStoreCardMatches(
    @Req() req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getStoreCardMatches(actor.companyId, startDate, endDate);
  }

  @Patch("reconciliation/link")
  async linkStoreToCard(
    @Req() req: any,
    @Body() body: { storeTransactionIds: string[]; cardTransactionId: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.linkStoreToCard(
      actor.companyId,
      body.storeTransactionIds,
      body.cardTransactionId,
    );
  }

  @Patch("reconciliation/unlink")
  async unlinkReconciliation(
    @Req() req: any,
    @Body() body: { transactionIds: string[] },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.unlinkReconciliation(actor.companyId, body.transactionIds);
  }

  // ─── Transaction Disposition ───────────────────────────────────────

  @Patch("transactions/:id/disposition")
  async dispositionTransaction(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { source: string; disposition: string; note: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    const disposition = VALID_DISPOSITIONS[body.disposition];
    if (!disposition) {
      throw new BadRequestException(
        `Invalid disposition. Must be one of: ${Object.keys(VALID_DISPOSITIONS).join(", ")}`,
      );
    }
    if (!body.source) throw new BadRequestException("source is required.");
    if (!body.note || body.note.trim().length < 3) {
      throw new BadRequestException("A disposition note is required (minimum 3 characters).");
    }
    return this.csvImport.dispositionTransaction({
      companyId: actor.companyId,
      transactionId: id,
      source: body.source,
      disposition,
      note: body.note.trim(),
      userId: actor.userId,
    });
  }

  @Get("transactions/:id/disposition-log")
  async getDispositionLog(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getDispositionLog(actor.companyId, id);
  }

  @Get("disposition-counts")
  async getDispositionCounts(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getDispositionCounts(actor.companyId);
  }

  // ─── Re-run prescreening on all pending transactions ──────────────

  @Post("prescreen-rerun")
  async rerunPrescreening(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.rerunPrescreening(actor.companyId);
  }

  // ─── Category Override + Verification ──────────────────────────────

  @Patch("transactions/:id/category")
  async overrideCategory(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { source: string; newCategory: string; note?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.source) throw new BadRequestException("source is required.");
    if (!body.newCategory || !body.newCategory.trim()) {
      throw new BadRequestException("newCategory is required.");
    }
    return this.csvImport.overrideCategory({
      companyId: actor.companyId,
      transactionId: id,
      source: body.source,
      newCategory: body.newCategory.trim(),
      note: body.note,
      userId: actor.userId,
    });
  }

  @Patch("transactions/:id/category-verify")
  async verifyCategory(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { source: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.source) throw new BadRequestException("source is required.");
    return this.csvImport.verifyCategory({
      companyId: actor.companyId,
      transactionId: id,
      source: body.source,
      userId: actor.userId,
    });
  }

  // ─── Transaction Tags ─────────────────────────────────────────────

  @Post("tags")
  async createTag(
    @Req() req: any,
    @Body() body: { name: string; color?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.name || !body.name.trim()) throw new BadRequestException("Tag name is required.");
    return this.csvImport.createTag(actor.companyId, body.name, body.color);
  }

  @Get("tags")
  async listTags(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.listTags(actor.companyId);
  }

  @Delete("tags/:tagId")
  async deleteTag(@Req() req: any, @Param("tagId") tagId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.deleteTag(actor.companyId, tagId);
  }

  @Post("transactions/:id/tags")
  async assignTag(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { tagId: string; source: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.assignTag(id, body.source, body.tagId, actor.userId);
  }

  @Delete("transactions/:id/tags/:tagId")
  async removeTag(
    @Req() req: any,
    @Param("id") id: string,
    @Param("tagId") tagId: string,
  ) {
    return this.csvImport.removeTag(id, tagId);
  }

  @Get("transactions/:id/tags")
  async getTransactionTags(@Param("id") id: string) {
    return this.csvImport.getTransactionTags(id);
  }

  // ─── Cross-project duplicate expense scanner ───────────────────────

  @Get("duplicate-expenses")
  async scanDuplicateExpenses(
    @Req() req: any,
    @Query("lookbackDays") lookbackDays?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.duplicateDetector.scanCrossProjectDuplicates(
      actor.companyId,
      { lookbackDays: lookbackDays ? parseInt(lookbackDays, 10) : undefined },
    );
  }
}
