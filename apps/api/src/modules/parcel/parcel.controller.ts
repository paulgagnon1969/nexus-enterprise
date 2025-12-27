import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ParcelService } from "./parcel.service";
import { JwtAuthGuard, Roles } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateParcelDto, UpdateParcelDto } from "./dto/parcel.dto";
import { ParcelStatus } from "@prisma/client";
import { Role } from "../auth/auth.guards";

@Controller("parcels")
export class ParcelController {
  constructor(private readonly parcels: ParcelService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query("projectId") projectId?: string,
    @Query("status") status?: ParcelStatus
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.parcels.listParcels(actor, projectId, status);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  create(@Req() req: any, @Body() dto: CreateParcelDto) {
    const actor = req.user as AuthenticatedUser;
    return this.parcels.createParcel(actor, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateParcelDto) {
    const actor = req.user as AuthenticatedUser;
    return this.parcels.updateParcel(actor, id, dto);
  }
}
