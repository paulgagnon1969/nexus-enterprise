import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ReceiptEmailService } from "./receipt-email.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailReceiptStatus } from "@prisma/client";

@Controller("receipt-emails")
export class ReceiptEmailController {
  constructor(private readonly service: ReceiptEmailService) {}

  @Get()
  async list(
    @Req() req: { user: AuthenticatedUser },
    @Query("status") status?: string,
    @Query("projectId") projectId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.list(req.user, {
      status: status as EmailReceiptStatus | undefined,
      projectId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get("summary")
  async summary(@Req() req: { user: AuthenticatedUser }) {
    return this.service.getSummary(req.user);
  }

  @Get(":id")
  async getById(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.getById(req.user, id);
  }

  @Patch(":id/assign")
  async assign(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() body: { projectId: string },
  ) {
    return this.service.assign(req.user, id, body.projectId);
  }

  @Patch(":id/unassign")
  async unassign(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
  ) {
    return this.service.unassign(req.user, id);
  }
}
