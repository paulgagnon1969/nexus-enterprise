import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { BidPackageService, CreateBidPackageDto, InviteSupplierDto } from "./bid-package.service";

@Controller("bid-packages")
@UseGuards(JwtAuthGuard)
export class BidPackageController {
  constructor(private readonly bidPackageService: BidPackageService) {}

  /**
   * Create a new bid package.
   * POST /bid-packages
   */
  @Post()
  async create(@Request() req: any, @Body() dto: CreateBidPackageDto) {
    const { companyId, userId } = req.user;
    return this.bidPackageService.createBidPackage(companyId, userId, dto);
  }

  /**
   * List bid packages for a project.
   * GET /bid-packages?projectId=xxx
   */
  @Get()
  async list(@Request() req: any, @Query("projectId") projectId: string) {
    const { companyId } = req.user;
    return this.bidPackageService.listBidPackages(companyId, projectId);
  }

  /**
   * Get bid package details.
   * GET /bid-packages/:id
   */
  @Get(":id")
  async get(@Request() req: any, @Param("id") id: string) {
    const { companyId } = req.user;
    return this.bidPackageService.getBidPackage(id, companyId);
  }

  /**
   * Invite suppliers to bid.
   * POST /bid-packages/:id/invite
   */
  @Post(":id/invite")
  async invite(
    @Request() req: any,
    @Param("id") packageId: string,
    @Body() body: { suppliers: InviteSupplierDto[] },
  ) {
    const { companyId } = req.user;
    return this.bidPackageService.inviteSuppliers(packageId, companyId, body.suppliers);
  }

  /**
   * Compare bids side-by-side.
   * GET /bid-packages/:id/compare
   */
  @Get(":id/compare")
  async compare(@Request() req: any, @Param("id") packageId: string) {
    const { companyId } = req.user;
    return this.bidPackageService.compareBids(packageId, companyId);
  }

  /**
   * Award bid to a supplier.
   * POST /bid-packages/:id/award
   */
  @Post(":id/award")
  async award(
    @Request() req: any,
    @Param("id") packageId: string,
    @Body() body: { bidId: string; notes?: string },
  ) {
    const { companyId } = req.user;
    return this.bidPackageService.awardBid(packageId, companyId, body.bidId, body.notes);
  }

  /**
   * Close bidding.
   * POST /bid-packages/:id/close
   */
  @Post(":id/close")
  async close(@Request() req: any, @Param("id") packageId: string) {
    const { companyId } = req.user;
    return this.bidPackageService.closeBidding(packageId, companyId);
  }
}
