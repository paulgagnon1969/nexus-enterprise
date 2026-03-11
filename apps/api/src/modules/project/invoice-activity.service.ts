import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  InvoiceActivityActor,
  InvoiceActivityEvent,
  AutoPayReviewStatus,
} from "@prisma/client";

// ── Public Types ──────────────────────────────────────────────────

export interface RecordActivityOpts {
  invoiceId: string;
  companyId: string;
  projectId: string;
  actorType?: InvoiceActivityActor;
  actorId?: string | null;
  eventType: InvoiceActivityEvent;
  metadata?: Record<string, unknown>;
}

export interface InvoiceTrackerRow {
  invoiceId: string;
  invoiceNo: string | null;
  status: string;
  totalAmount: number;
  viewCount: number;
  uniqueViewers: number;
  lastViewedAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  downloadCount: number;
  onlinePayment: {
    method: string;
    amount: number;
    paidAt: string;
    autoPayReviewId: string;
    autoPayReviewStatus: string;
    reviewNote: string | null;
  } | null;
}

// ── Service ──────────────────────────────────────────────────────

@Injectable()
export class InvoiceActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an invoice engagement event.
   * VIEW events are deduped per actor per hour to avoid inflating counts
   * on page refreshes.
   */
  async recordActivity(opts: RecordActivityOpts): Promise<void> {
    const {
      invoiceId,
      companyId,
      projectId,
      actorType = InvoiceActivityActor.CLIENT,
      actorId = null,
      eventType,
      metadata,
    } = opts;

    // Dedupe VIEWs: skip if same actor viewed within the last hour
    if (eventType === InvoiceActivityEvent.VIEW) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await this.prisma.invoiceActivity.findFirst({
        where: {
          invoiceId,
          actorId: actorId ?? undefined,
          eventType: InvoiceActivityEvent.VIEW,
          createdAt: { gte: oneHourAgo },
        },
        select: { id: true },
      });
      if (recent) return; // skip duplicate
    }

    await this.prisma.invoiceActivity.create({
      data: {
        invoiceId,
        companyId,
        projectId,
        actorType,
        actorId,
        eventType,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  }

  /**
   * Returns per-invoice activity summary for all issued invoices on a project.
   * Used by the Invoice Tracker card (Admin+ only).
   */
  async getInvoiceTracker(
    projectId: string,
    companyId: string,
  ): Promise<InvoiceTrackerRow[]> {
    // Get all non-draft invoices on this project
    const invoices = await this.prisma.projectInvoice.findMany({
      where: {
        projectId,
        companyId,
        status: { notIn: ["DRAFT", "VOID"] },
      },
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        totalAmount: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (invoices.length === 0) return [];

    const invoiceIds = invoices.map((i) => i.id);

    // Batch-fetch all activity for these invoices
    const activities = await this.prisma.invoiceActivity.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: {
        invoiceId: true,
        actorId: true,
        eventType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Batch-fetch auto-pay reviews
    const reviews = await this.prisma.autoPayReview.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: {
        id: true,
        invoiceId: true,
        method: true,
        amount: true,
        status: true,
        reviewNote: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Build per-invoice summaries
    return invoices.map((inv) => {
      const invActivities = activities.filter((a) => a.invoiceId === inv.id);

      const views = invActivities.filter(
        (a: { eventType: string }) => a.eventType === InvoiceActivityEvent.VIEW,
      );
      const prints = invActivities.filter(
        (a: { eventType: string }) => a.eventType === InvoiceActivityEvent.PRINT,
      );
      const downloads = invActivities.filter(
        (a: { eventType: string }) => a.eventType === InvoiceActivityEvent.DOWNLOAD,
      );

      const uniqueViewerSet = new Set(
        views.map((v: { actorId: string | null }) => v.actorId ?? "__anonymous__"),
      );

      const lastView = views[0]?.createdAt ?? null;
      const lastPrint = prints[0]?.createdAt ?? null;

      // Most recent auto-pay review for this invoice
      const review = reviews.find((r: { invoiceId: string }) => r.invoiceId === inv.id) ?? null;

      return {
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        status: inv.status,
        totalAmount: inv.totalAmount,
        viewCount: views.length,
        uniqueViewers: uniqueViewerSet.size,
        lastViewedAt: lastView ? lastView.toISOString() : null,
        printCount: prints.length,
        lastPrintedAt: lastPrint ? lastPrint.toISOString() : null,
        downloadCount: downloads.length,
        onlinePayment: review
          ? {
              method: review.method,
              amount: review.amount,
              paidAt: review.createdAt.toISOString(),
              autoPayReviewId: review.id,
              autoPayReviewStatus: review.status,
              reviewNote: review.reviewNote,
            }
          : null,
      };
    });
  }

  /**
   * Admin+ action: confirm or reject an auto-pay review.
   */
  async updateAutoPayReview(
    reviewId: string,
    userId: string,
    action: "CONFIRMED" | "REJECTED",
    note?: string,
  ): Promise<{ ok: boolean }> {
    const review = await this.prisma.autoPayReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException("Auto-pay review not found");
    }
    if (review.status !== AutoPayReviewStatus.PENDING) {
      throw new BadRequestException(
        `This review has already been ${review.status.toLowerCase()}`,
      );
    }

    await this.prisma.autoPayReview.update({
      where: { id: reviewId },
      data: {
        status: action as AutoPayReviewStatus,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    return { ok: true };
  }
}
