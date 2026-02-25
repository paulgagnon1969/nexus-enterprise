import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, RolesGuard, Roles, Role } from "../auth/auth.guards";
import {
  HelpItemsService,
  CreateHelpItemDto,
  UpdateHelpItemDto,
} from "./help-items.service";

@Controller("help-items")
export class HelpItemsController {
  constructor(private readonly helpItems: HelpItemsService) {}

  /**
   * GET /help-items/by-keys?keys=key1,key2,key3
   * Public endpoint (no auth required) - fetches active help items by keys
   * Used by the help overlay to get content for visible elements
   */
  @Get("by-keys")
  async findByKeys(@Query("keys") keysParam: string) {
    const keys = keysParam ? keysParam.split(",").map((k) => k.trim()) : [];
    return this.helpItems.findByKeys(keys);
  }

  /**
   * GET /help-items
   * Admin only - list all help items for management UI
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get()
  async findAll() {
    return this.helpItems.findAll();
  }

  /**
   * GET /help-items/:id
   * Admin only - get single help item
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.helpItems.findById(id);
  }

  /**
   * POST /help-items
   * Admin only - create new help item
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post()
  async create(@Body() dto: CreateHelpItemDto) {
    return this.helpItems.create(dto);
  }

  /**
   * PATCH /help-items/:id
   * Admin only - update help item
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateHelpItemDto) {
    return this.helpItems.update(id, dto);
  }

  /**
   * DELETE /help-items/:id
   * Admin only - delete help item
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.helpItems.delete(id);
  }
}
