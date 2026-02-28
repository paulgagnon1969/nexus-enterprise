import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { RequiresModule } from "../billing/module.guard";
import { LocalSupplierService } from "./local-supplier.service";
import { LocalSupplierStatus } from "@prisma/client";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException("Authentication required");
  return user;
}

@RequiresModule("SUPPLIER_INDEX")
@Controller("local-suppliers")
@UseGuards(JwtAuthGuard)
export class LocalSupplierController {
  constructor(private readonly suppliers: LocalSupplierService) {}

  /** GET /local-suppliers?status=ACTIVE */
  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Query("status") status?: string,
  ) {
    const user = getUser(req);
    const validStatus =
      status && Object.values(LocalSupplierStatus).includes(status as LocalSupplierStatus)
        ? (status as LocalSupplierStatus)
        : undefined;
    return this.suppliers.list(user, { status: validStatus });
  }

  /** POST /local-suppliers/:id/flag  { reason: "..." } */
  @Post(":id/flag")
  async flagClosed(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    const user = getUser(req);
    return this.suppliers.flagClosed(user, id, body.reason);
  }

  /** POST /local-suppliers/:id/approve  { note?: "..." } */
  @Post(":id/approve")
  async approveRemoval(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { note?: string },
  ) {
    const user = getUser(req);
    return this.suppliers.approveRemoval(user, id, body.note);
  }

  /** POST /local-suppliers/:id/deny  { note?: "..." } */
  @Post(":id/deny")
  async denyRemoval(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { note?: string },
  ) {
    const user = getUser(req);
    return this.suppliers.denyRemoval(user, id, body.note);
  }
}
