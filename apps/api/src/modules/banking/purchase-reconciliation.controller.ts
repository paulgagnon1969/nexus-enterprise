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
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PurchaseReconciliationService } from "./purchase-reconciliation.service";
import { NexPriceService } from "./nexprice.service";
import {
  ExpenseClassification,
  DispositionType,
  PmReviewStatus,
  RegionType,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Valid enum values for runtime validation
// ---------------------------------------------------------------------------

const VALID_CLASSIFICATIONS: Record<string, ExpenseClassification> = {
  PROJECT_MATERIAL: ExpenseClassification.PROJECT_MATERIAL,
  ENTERTAINMENT: ExpenseClassification.ENTERTAINMENT,
  PERSONAL: ExpenseClassification.PERSONAL,
  FUEL: ExpenseClassification.FUEL,
  TOOL_EQUIPMENT: ExpenseClassification.TOOL_EQUIPMENT,
  UNCLASSIFIED: ExpenseClassification.UNCLASSIFIED,
};

const VALID_DISPOSITIONS: Record<string, DispositionType> = {
  KEEP_ON_JOB: DispositionType.KEEP_ON_JOB,
  CREDIT_PERSONAL: DispositionType.CREDIT_PERSONAL,
  MOVE_TO_PROJECT: DispositionType.MOVE_TO_PROJECT,
};

const VALID_REVIEW_STATUSES: Record<string, PmReviewStatus> = {
  APPROVED: PmReviewStatus.APPROVED,
  REJECTED: PmReviewStatus.REJECTED,
  MODIFIED: PmReviewStatus.MODIFIED,
};

@Controller("banking/purchase-reconciliation")
@UseGuards(JwtAuthGuard)
export class PurchaseReconciliationController {
  constructor(
    private readonly recon: PurchaseReconciliationService,
    private readonly nexprice: NexPriceService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // Auto-classification
  // ═══════════════════════════════════════════════════════════════════

  /**
   * POST /banking/purchase-reconciliation/classify
   * Trigger auto-classification of unclassified transactions.
   */
  @Post("classify")
  async classify(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.recon.classifyTransactions(actor.companyId);
  }

  /**
   * PATCH /banking/purchase-reconciliation/classify/:id
   * Manually reclassify a single transaction.
   */
  @Patch("classify/:id")
  async manualClassify(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { classification: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    const classification = VALID_CLASSIFICATIONS[body.classification];
    if (!classification) {
      throw new BadRequestException(
        `Invalid classification. Must be one of: ${Object.keys(VALID_CLASSIFICATIONS).join(", ")}`,
      );
    }
    return this.recon.manualClassify(actor.companyId, id, classification);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CC-to-Checking linking
  // ═══════════════════════════════════════════════════════════════════

  /**
   * GET /banking/purchase-reconciliation/cc-checking-suggestions
   * Get suggested CC-to-checking links.
   */
  @Get("cc-checking-suggestions")
  async getCcCheckingSuggestions(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.recon.suggestCreditCardCheckingLinks(actor.companyId);
  }

  /**
   * PATCH /banking/purchase-reconciliation/cc-checking-link
   * Confirm a CC-to-checking link.
   */
  @Patch("cc-checking-link")
  async linkCcToChecking(
    @Req() req: any,
    @Body() body: { checkingTxnId: string; creditCardTxnIds: string[] },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.checkingTxnId || !body.creditCardTxnIds?.length) {
      throw new BadRequestException("checkingTxnId and creditCardTxnIds[] are required.");
    }
    return this.recon.linkCreditCardToChecking(
      actor.companyId,
      body.checkingTxnId,
      body.creditCardTxnIds,
      actor.userId,
    );
  }

  /**
   * DELETE /banking/purchase-reconciliation/cc-checking-link/:creditCardTxnId
   * Remove a CC-to-checking link.
   */
  @Delete("cc-checking-link/:creditCardTxnId")
  async unlinkCcFromChecking(
    @Req() req: any,
    @Param("creditCardTxnId") creditCardTxnId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.recon.unlinkCreditCardFromChecking(actor.companyId, creditCardTxnId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Receipt line disposition
  // ═══════════════════════════════════════════════════════════════════

  /**
   * POST /banking/purchase-reconciliation/disposition
   * Disposition a receipt line item.
   */
  @Post("disposition")
  async disposition(
    @Req() req: any,
    @Body()
    body: {
      dailyLogId: string;
      ocrResultId: string;
      lineItemIndex: number;
      description?: string;
      amount?: number;
      dispositionType: string;
      targetProjectId?: string;
      creditReason?: string;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    const dispositionType = VALID_DISPOSITIONS[body.dispositionType];
    if (!dispositionType) {
      throw new BadRequestException(
        `Invalid dispositionType. Must be one of: ${Object.keys(VALID_DISPOSITIONS).join(", ")}`,
      );
    }
    if (!body.dailyLogId || !body.ocrResultId || body.lineItemIndex === undefined) {
      throw new BadRequestException("dailyLogId, ocrResultId, and lineItemIndex are required.");
    }
    return this.recon.dispositionLineItem({
      companyId: actor.companyId,
      dailyLogId: body.dailyLogId,
      ocrResultId: body.ocrResultId,
      lineItemIndex: body.lineItemIndex,
      description: body.description,
      amount: body.amount,
      dispositionType,
      targetProjectId: body.targetProjectId,
      creditReason: body.creditReason,
      userId: actor.userId,
    });
  }

  /**
   * GET /banking/purchase-reconciliation/dispositions/:dailyLogId
   * Get all dispositions for a daily log.
   */
  @Get("dispositions/:dailyLogId")
  async getDispositions(@Req() req: any, @Param("dailyLogId") dailyLogId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.recon.getDispositionsForDailyLog(actor.companyId, dailyLogId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PM Review Queue
  // ═══════════════════════════════════════════════════════════════════

  /**
   * GET /banking/purchase-reconciliation/pm-review
   * Get PM review queue.
   */
  @Get("pm-review")
  async getPmReview(
    @Req() req: any,
    @Query("projectId") projectId?: string,
    @Query("userId") userId?: string,
    @Query("status") status?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.recon.getPmReviewQueue(actor.companyId, {
      projectId,
      userId,
      status: status ? (VALID_REVIEW_STATUSES[status] ?? PmReviewStatus.PENDING) : undefined,
    });
  }

  /**
   * PATCH /banking/purchase-reconciliation/pm-review/:id
   * Submit a PM review decision.
   */
  @Patch("pm-review/:id")
  async submitPmReview(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { status: string; note?: string; reassignProjectId?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    const status = VALID_REVIEW_STATUSES[body.status];
    if (!status) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.keys(VALID_REVIEW_STATUSES).join(", ")}`,
      );
    }
    return this.recon.submitPmReview(
      actor.companyId,
      id,
      { status, note: body.note, reassignProjectId: body.reassignProjectId },
      actor.userId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // NexPRICE — Regional cost indices (admin/read)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * GET /banking/purchase-reconciliation/nexprice/regions
   * List regional cost indices.
   */
  @Get("nexprice/regions")
  async listRegions(
    @Query("regionType") regionType?: string,
    @Query("year") year?: string,
  ) {
    return this.nexprice.listRegionalCostIndices({
      regionType: regionType as RegionType | undefined,
      year: year ? parseInt(year, 10) : undefined,
    });
  }

  /**
   * GET /banking/purchase-reconciliation/nexprice/region/:code
   * Get a specific regional cost index.
   */
  @Get("nexprice/region/:code")
  async getRegion(
    @Param("code") code: string,
    @Query("year") year?: string,
  ) {
    return this.nexprice.getRegionalCostIndex(code, year ? parseInt(year, 10) : undefined);
  }
}
