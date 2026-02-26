import { Controller, Get, Post, Patch, Body, Param, Res, BadRequestException } from "@nestjs/common";
import { Response } from "express";
import { BidPackageService, SubmitBidDto } from "./bid-package.service";
import { createObjectCsvStringifier } from "csv-writer";

@Controller("supplier-portal")
export class SupplierPortalController {
  constructor(private readonly bidPackageService: BidPackageService) {}

  /**
   * Get bid package details for supplier (token-based access).
   * GET /supplier-portal/:accessToken
   */
  @Get(":accessToken")
  async getBidPackage(@Param("accessToken") accessToken: string) {
    return this.bidPackageService.getBidPackageByToken(accessToken);
  }

  /**
   * Submit or save a bid.
   * POST /supplier-portal/:accessToken/bid
   */
  @Post(":accessToken/bid")
  async submitBid(@Param("accessToken") accessToken: string, @Body() dto: SubmitBidDto) {
    return this.bidPackageService.submitBid(accessToken, dto);
  }

  /**
   * Amend an existing bid (alias for submit with SUBMITTED status).
   * PATCH /supplier-portal/:accessToken/bid/:bidId
   */
  @Patch(":accessToken/bid/:bidId")
  async amendBid(@Param("accessToken") accessToken: string, @Body() dto: SubmitBidDto) {
    // For amendments, we always set status to SUBMITTED
    return this.bidPackageService.submitBid(accessToken, { ...dto, status: "SUBMITTED" });
  }

  /**
   * Download CSV template for offline editing.
   * GET /supplier-portal/:accessToken/csv-template
   */
  @Get(":accessToken/csv-template")
  async downloadCsvTemplate(@Param("accessToken") accessToken: string, @Res() res: Response) {
    const { bidPackage, invitation } = await this.bidPackageService.getBidPackageByToken(accessToken);

    // Build CSV rows
    const rows = bidPackage.lineItems.map((item) => ({
      lineNo: item.lineNo,
      description: item.description,
      category: item.category || "",
      qty: item.qty,
      unit: item.unit,
      unitPrice: "",
      leadTimeDays: "",
      notes: "",
    }));

    // Create CSV stringifier
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: "lineNo", title: "Line #" },
        { id: "description", title: "Description" },
        { id: "category", title: "Category" },
        { id: "qty", title: "Qty" },
        { id: "unit", title: "Unit" },
        { id: "unitPrice", title: "Unit Price" },
        { id: "leadTimeDays", title: "Lead Time (days)" },
        { id: "notes", title: "Notes" },
      ],
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="bid-${bidPackage.id}.csv"`);
    res.send(csvContent);
  }

  /**
   * Upload completed CSV.
   * POST /supplier-portal/:accessToken/upload-csv
   */
  @Post(":accessToken/upload-csv")
  async uploadCsv(@Param("accessToken") accessToken: string, @Body() body: { csv: string }) {
    // Parse CSV (basic implementation - could use csv-parse library)
    const lines = body.csv.split("\n").slice(1); // Skip header
    const lineItems = lines
      .filter((line) => line.trim())
      .map((line) => {
        const [lineNo, description, category, qty, unit, unitPrice, leadTimeDays, notes] = line.split(",");
        return {
          lineNo: parseInt(lineNo, 10),
          unitPrice: parseFloat(unitPrice) || null,
          leadTimeDays: parseInt(leadTimeDays, 10) || null,
          notes: notes?.trim() || null,
        };
      });

    // Validate and get bid package to map line numbers to IDs
    const { bidPackage } = await this.bidPackageService.getBidPackageByToken(accessToken);

    const lineItemMap = new Map(bidPackage.lineItems.map((item) => [item.lineNo, item.id]));

    const bidLineItems = lineItems.map((item) => {
      const bidPackageLineItemId = lineItemMap.get(item.lineNo);
      if (!bidPackageLineItemId) {
        throw new BadRequestException(`Invalid line number: ${item.lineNo}`);
      }
      return {
        bidPackageLineItemId,
        unitPrice: item.unitPrice,
        leadTimeDays: item.leadTimeDays,
        notes: item.notes,
      };
    });

    // Calculate totals
    const subtotal = bidLineItems.reduce((sum, item, idx) => {
      const packageLine = bidPackage.lineItems[idx];
      return sum + (item.unitPrice ? item.unitPrice * packageLine.qty : 0);
    }, 0);

    return this.bidPackageService.submitBid(accessToken, {
      status: "SUBMITTED",
      lineItems: bidLineItems,
      subtotal,
      total: subtotal, // Simplified - could add tax/shipping
    });
  }

  /**
   * Decline invitation.
   * POST /supplier-portal/:accessToken/decline
   */
  @Post(":accessToken/decline")
  async decline(@Param("accessToken") accessToken: string, @Body() body: { reason?: string }) {
    // Mark invitation as declined
    // TODO: Add declineInvitation method to service
    return { ok: true, message: "Invitation declined" };
  }
}
