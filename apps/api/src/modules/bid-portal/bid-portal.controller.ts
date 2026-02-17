import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
} from "@nestjs/common";
import { BidPortalService } from "./bid-portal.service";

/**
 * Public controller for supplier bid portal access.
 * Does NOT use JWT auth - uses token/PIN authentication instead.
 */
@Controller("bid-portal")
export class BidPortalController {
  constructor(private bidPortalService: BidPortalService) {}

  /**
   * GET /bid-portal/:token
   * Get basic portal info (no PIN required)
   * Used to show the PIN entry screen with company/bid info
   */
  @Get(":token")
  async getPortalInfo(@Param("token") token: string) {
    return this.bidPortalService.getPortalInfo(token);
  }

  /**
   * POST /bid-portal/:token/verify
   * Verify PIN and get full bid request data
   */
  @Post(":token/verify")
  async verifyPin(
    @Param("token") token: string,
    @Body() body: { pin: string }
  ) {
    return this.bidPortalService.verifyPinAndGetBidRequest(token, body.pin);
  }

  /**
   * POST /bid-portal/:token/submit
   * Submit a bid response
   */
  @Post(":token/submit")
  async submitResponse(
    @Param("token") token: string,
    @Body()
    body: {
      pin: string;
      items: {
        bidRequestItemId: string;
        unitPrice: number;
        notes?: string;
        leadTimeDays?: number;
        availability?: string;
      }[];
      totalAmount?: number;
      notes?: string;
      submitterName?: string;
      submitterEmail?: string;
      submitterPhone?: string;
    }
  ) {
    const { pin, ...dto } = body;
    return this.bidPortalService.submitResponse(token, pin, dto as any);
  }

  /**
   * POST /bid-portal/:token/decline
   * Decline to submit a bid
   */
  @Post(":token/decline")
  async declineBid(
    @Param("token") token: string,
    @Body() body: { pin: string; reason?: string }
  ) {
    return this.bidPortalService.declineBid(token, body.pin, body.reason);
  }
}
