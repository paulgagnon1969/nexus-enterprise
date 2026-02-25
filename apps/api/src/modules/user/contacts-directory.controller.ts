import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { ContactsDirectoryService } from "./contacts-directory.service";

@Controller("contacts")
export class ContactsDirectoryController {
  constructor(private readonly directory: ContactsDirectoryService) {}

  @UseGuards(JwtAuthGuard)
  @Get("directory")
  async listDirectory(
    @Req() req: any,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("includePersonal") includePersonalRaw?: string,
    @Query("projectId") projectId?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    const includePersonal = includePersonalRaw !== "false";
    const limit = limitRaw ? parseInt(limitRaw, 10) || 200 : 200;

    return this.directory.listDirectory(actor, {
      search: search ?? null,
      category: category ?? null,
      includePersonal,
      projectId: projectId ?? null,
      limit,
    });
  }
}
