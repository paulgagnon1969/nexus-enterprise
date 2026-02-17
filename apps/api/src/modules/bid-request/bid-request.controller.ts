import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { BidRequestService } from "./bid-request.service";
import { JwtAuthGuard } from "../auth/auth.guards";

@Controller("projects/:projectId/bid-requests")
@UseGuards(JwtAuthGuard)
export class BidRequestController {
  constructor(private bidRequestService: BidRequestService) {}

  /**
   * GET /projects/:projectId/bid-requests
   * List all bid requests for a project
   */
  @Get()
  async listBidRequests(
    @Param("projectId") projectId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.listBidRequests(companyId, projectId);
  }

  /**
   * GET /projects/:projectId/bid-requests/filters
   * Get available BOM filters for bid request creation
   */
  @Get("filters")
  async getBomFilters(
    @Param("projectId") projectId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.getBomFilters(companyId, projectId);
  }

  /**
   * POST /projects/:projectId/bid-requests
   * Create a new bid request
   */
  @Post()
  async createBidRequest(
    @Param("projectId") projectId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      dueDate?: string;
      filterConfig?: {
        categories?: string[];
        costTypes?: string[];
      };
      supplierIds: string[];
      notes?: string;
    },
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.userId;

    return this.bidRequestService.createBidRequest(companyId, userId, {
      projectId,
      ...body,
      filterConfig: body.filterConfig as any,
    });
  }

  /**
   * GET /projects/:projectId/bid-requests/:bidRequestId
   * Get bid request details
   */
  @Get(":bidRequestId")
  async getBidRequest(
    @Param("projectId") projectId: string,
    @Param("bidRequestId") bidRequestId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.getBidRequest(companyId, bidRequestId);
  }

  /**
   * PUT /projects/:projectId/bid-requests/:bidRequestId
   * Update bid request details
   */
  @Put(":bidRequestId")
  async updateBidRequest(
    @Param("bidRequestId") bidRequestId: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      dueDate?: string;
      notes?: string;
    },
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.updateBidRequest(companyId, bidRequestId, body);
  }

  /**
   * DELETE /projects/:projectId/bid-requests/:bidRequestId
   * Delete a draft bid request
   */
  @Delete(":bidRequestId")
  async deleteBidRequest(
    @Param("bidRequestId") bidRequestId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.deleteBidRequest(companyId, bidRequestId);
  }

  /**
   * POST /projects/:projectId/bid-requests/:bidRequestId/send
   * Send bid request to all pending recipients
   */
  @Post(":bidRequestId/send")
  async sendBidRequest(
    @Param("bidRequestId") bidRequestId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.sendBidRequest(companyId, bidRequestId);
  }

  /**
   * POST /projects/:projectId/bid-requests/:bidRequestId/recipients
   * Add a supplier as recipient
   */
  @Post(":bidRequestId/recipients")
  async addRecipient(
    @Param("bidRequestId") bidRequestId: string,
    @Body() body: { supplierId: string },
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.addRecipient(
      companyId,
      bidRequestId,
      body.supplierId
    );
  }

  /**
   * DELETE /projects/:projectId/bid-requests/:bidRequestId/recipients/:recipientId
   * Remove a recipient
   */
  @Delete(":bidRequestId/recipients/:recipientId")
  async removeRecipient(
    @Param("bidRequestId") bidRequestId: string,
    @Param("recipientId") recipientId: string,
    @Request() req: any
  ) {
    const companyId = req.user?.companyId;
    return this.bidRequestService.removeRecipient(
      companyId,
      bidRequestId,
      recipientId
    );
  }
}
