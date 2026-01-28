import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { LocationsService } from "./locations.service";
import { SeedProjectLocationsDto } from "./dto/seed-project-locations.dto";

@UseGuards(JwtAuthGuard)
@Controller("locations")
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get("roots")
  async getRootLocations(@Req() req: any) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      return [];
    }
    const rows = await this.locations.getRootLocations(user.companyId);
    return rows;
  }

  @Get("children/:locationId")
  async getChildLocations(@Req() req: any, @Param("locationId") locationId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      return [];
    }
    const rows = await this.locations.getChildLocations(user.companyId, locationId);
    return rows;
  }

  @Get("me/person-location")
  async getMyPersonLocation(@Req() req: any) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId || !user?.userId) {
      return { locationId: null, location: null };
    }
    const personLoc = await this.locations.getPersonLocation(user.companyId, user.userId);
    if (!personLoc) {
      return { locationId: null, location: null };
    }
    return {
      locationId: personLoc.locationId,
      location: personLoc.location,
    };
  }

  @Post(":locationId/assign-people")
  @Roles(Role.OWNER, Role.ADMIN)
  async assignPeopleToLocation(
    @Req() req: any,
    @Param("locationId") locationId: string,
    @Body() body: { userIds: string[] },
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId || !user?.userId) {
      throw new Error("Missing company context");
    }
    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];
    return this.locations.assignPeopleToLocation(user.companyId, locationId, user.userId, userIds);
  }

  // Resolve the location tree root for a project (if seeded).
  @Get("project/:projectId/root")
  async getProjectRoot(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      return null;
    }

    const row = await this.locations.getProjectRootLocation(user.companyId, projectId);
    return row;
  }

  // Seed a standardized location hierarchy for a project:
  // Company -> Project -> (Upstream, Downstream, Main Warehouse -> Zones)
  @Post("project/:projectId/seed")
  @Roles(Role.OWNER, Role.ADMIN)
  async seedProjectTree(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: SeedProjectLocationsDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      throw new Error("Missing company context");
    }

    const seeded = await this.locations.seedProjectLocationTree({
      companyId: user.companyId,
      projectId,
      zonesCount: dto?.zonesCount,
      upstreamVendors: dto?.upstreamVendors,
    });

    return seeded;
  }
}
