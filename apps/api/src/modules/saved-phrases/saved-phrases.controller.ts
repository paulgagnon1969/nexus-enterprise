import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { JwtAuthGuard, Role, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SavedPhrasesService, CreateSavedPhraseDto, UpdateSavedPhraseDto } from "./saved-phrases.service";
import { SavedPhraseCategory } from "@prisma/client";

@Controller("saved-phrases")
@UseGuards(JwtAuthGuard)
export class SavedPhrasesController {
  constructor(private readonly savedPhrases: SavedPhrasesService) {}

  /**
   * List saved phrases for the current user.
   * Returns both user-specific and company-wide phrases.
   * Optional query param: ?category=INVOICE|BILL|DAILY_LOG|GENERAL
   */
  @Get()
  list(
    @Req() req: any,
    @Query("category") category?: string
  ) {
    const user = req.user as AuthenticatedUser;
    const cat = category as SavedPhraseCategory | undefined;
    return this.savedPhrases.list(user.companyId, user.userId, cat);
  }

  /**
   * Create a new saved phrase.
   * By default creates as user-specific.
   * Pass isCompanyWide: true to create as company-wide (admin only).
   */
  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateSavedPhraseDto
  ) {
    const user = req.user as AuthenticatedUser;
    const isAdmin = this.isAdminOrAbove(user);
    return this.savedPhrases.create(user.companyId, user.userId, dto, isAdmin);
  }

  /**
   * Update an existing saved phrase.
   * Users can only update their own phrases.
   * Admins can update any phrase.
   */
  @Patch(":id")
  update(
    @Req() req: any,
    @Param("id") phraseId: string,
    @Body() dto: UpdateSavedPhraseDto
  ) {
    const user = req.user as AuthenticatedUser;
    const isAdmin = this.isAdminOrAbove(user);
    return this.savedPhrases.update(
      user.companyId,
      user.userId,
      phraseId,
      dto,
      isAdmin
    );
  }

  /**
   * Delete a saved phrase.
   * Users can only delete their own phrases.
   * Admins can delete any phrase.
   */
  @Delete(":id")
  delete(
    @Req() req: any,
    @Param("id") phraseId: string
  ) {
    const user = req.user as AuthenticatedUser;
    const isAdmin = this.isAdminOrAbove(user);
    return this.savedPhrases.delete(
      user.companyId,
      user.userId,
      phraseId,
      isAdmin
    );
  }

  /**
   * Promote a user phrase to company-wide (admin only).
   * Optional: keepOriginal=true to create a copy instead of converting.
   */
  @Post(":id/promote")
  promote(
    @Req() req: any,
    @Param("id") phraseId: string,
    @Body() body: { keepOriginal?: boolean }
  ) {
    const user = req.user as AuthenticatedUser;
    // Only admins can promote phrases
    if (!this.isAdminOrAbove(user)) {
      throw new ForbiddenException("Only administrators can promote phrases to company-wide");
    }
    return this.savedPhrases.promote(
      user.companyId,
      user.userId,
      phraseId,
      body.keepOriginal ?? false
    );
  }

  private isAdminOrAbove(user: AuthenticatedUser): boolean {
    // Check global role first
    if (
      user.globalRole === GlobalRole.SUPER_ADMIN ||
      user.globalRole === GlobalRole.SUPPORT
    ) {
      return true;
    }
    // Check company role
    return user.role === Role.ADMIN || user.role === Role.OWNER;
  }
}
