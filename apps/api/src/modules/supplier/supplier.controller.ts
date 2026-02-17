import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { SupplierService } from "./supplier.service";
import { Role, SupplierTagCategory } from "@prisma/client";

interface AuthenticatedUser {
  userId: string;
  companyId?: string;
  role?: Role;
  globalRole?: string;
}

@Controller("suppliers")
@UseGuards(JwtAuthGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  // ==================== SUPPLIER TAGS ====================

  @Get("tags")
  async listTags(
    @Req() req: FastifyRequest,
    @Query("category") category?: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    const categoryEnum = category
      ? (category.toUpperCase() as SupplierTagCategory)
      : undefined;

    return this.supplierService.listTags(user.companyId, categoryEnum);
  }

  @Post("tags")
  async createTag(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      category: string;
      code: string;
      label: string;
      color?: string;
    }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    if (!body.category || !body.code || !body.label) {
      throw new BadRequestException("category, code, and label are required");
    }

    return this.supplierService.createTag(user.companyId, {
      category: body.category.toUpperCase() as SupplierTagCategory,
      code: body.code,
      label: body.label,
      color: body.color,
    });
  }

  @Put("tags/:tagId")
  async updateTag(
    @Req() req: FastifyRequest,
    @Param("tagId") tagId: string,
    @Body() body: { label?: string; color?: string; sortOrder?: number }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.updateTag(tagId, user.companyId, body);
  }

  @Delete("tags/:tagId")
  async deleteTag(@Req() req: FastifyRequest, @Param("tagId") tagId: string) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.deleteTag(tagId, user.companyId);
  }

  // ==================== SUPPLIERS ====================

  @Get()
  async listSuppliers(
    @Req() req: FastifyRequest,
    @Query("search") search?: string,
    @Query("tagIds") tagIds?: string,
    @Query("isActive") isActive?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.listSuppliers(user.companyId, {
      search,
      tagIds: tagIds ? tagIds.split(",").filter(Boolean) : undefined,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(":supplierId")
  async getSupplier(
    @Req() req: FastifyRequest,
    @Param("supplierId") supplierId: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.getSupplier(supplierId, user.companyId);
  }

  @Post()
  async createSupplier(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      name: string;
      email?: string;
      phone?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      defaultContactName?: string;
      defaultContactEmail?: string;
      defaultContactPhone?: string;
      notes?: string;
      tagIds?: string[];
    }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    if (!body.name?.trim()) {
      throw new BadRequestException("name is required");
    }

    return this.supplierService.createSupplier(user.companyId, body);
  }

  @Put(":supplierId")
  async updateSupplier(
    @Req() req: FastifyRequest,
    @Param("supplierId") supplierId: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      website?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      defaultContactName?: string;
      defaultContactEmail?: string;
      defaultContactPhone?: string;
      notes?: string;
      isActive?: boolean;
      tagIds?: string[];
    }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.updateSupplier(supplierId, user.companyId, body);
  }

  @Delete(":supplierId")
  async deleteSupplier(
    @Req() req: FastifyRequest,
    @Param("supplierId") supplierId: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.deleteSupplier(supplierId, user.companyId);
  }

  // ==================== SUPPLIER CONTACTS ====================

  @Get(":supplierId/contacts")
  async listContacts(
    @Req() req: FastifyRequest,
    @Param("supplierId") supplierId: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.listContacts(supplierId, user.companyId);
  }

  @Post(":supplierId/contacts")
  async createContact(
    @Req() req: FastifyRequest,
    @Param("supplierId") supplierId: string,
    @Body()
    body: {
      name: string;
      email?: string;
      phone?: string;
      role?: string;
      isPrimary?: boolean;
    }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    if (!body.name?.trim()) {
      throw new BadRequestException("name is required");
    }

    return this.supplierService.createContact(supplierId, user.companyId, body);
  }

  @Put("contacts/:contactId")
  async updateContact(
    @Req() req: FastifyRequest,
    @Param("contactId") contactId: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      isPrimary?: boolean;
      isActive?: boolean;
    }
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.updateContact(contactId, user.companyId, body);
  }

  @Delete("contacts/:contactId")
  async deleteContact(
    @Req() req: FastifyRequest,
    @Param("contactId") contactId: string
  ) {
    const user = (req as any).user as AuthenticatedUser;
    if (!user?.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.supplierService.deleteContact(contactId, user.companyId);
  }
}
