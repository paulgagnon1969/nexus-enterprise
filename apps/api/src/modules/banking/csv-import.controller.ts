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
import { CsvImportSource } from "@prisma/client";

const VALID_SOURCES: Record<string, CsvImportSource> = {
  HD_PRO_XTRA: CsvImportSource.HD_PRO_XTRA,
  CHASE_BANK: CsvImportSource.CHASE_BANK,
  APPLE_CARD: CsvImportSource.APPLE_CARD,
};

@Controller("banking")
@UseGuards(JwtAuthGuard)
export class CsvImportController {
  constructor(private readonly csvImport: CsvImportService) {}

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
    );
  }

  // ─── Bulk assign transactions to project ──────────────────────────

  @Patch("transactions/bulk-assign-project")
  async bulkAssignProject(
    @Req() req: any,
    @Body() body: { ids: Array<{ id: string; source: string }>; projectId: string | null },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.bulkAssignProject(actor.companyId, body.ids, body.projectId);
  }

  // ─── Distinct categories ──────────────────────────────────────────

  @Get("transactions/categories")
  async getCategories(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.csvImport.getDistinctCategories(actor.companyId);
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
}
