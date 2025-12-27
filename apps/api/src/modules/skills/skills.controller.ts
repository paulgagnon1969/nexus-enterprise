import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { SkillsService } from "./skills.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("skills")
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get("categories")
  async listCategories() {
    return this.skills.listCategories();
  }

  @Get("definitions")
  async listDefinitions() {
    return this.skills.listDefinitions();
  }

  // Self-managed ratings for the current user
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async getMySkills(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.getSelfRatings(actor.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/details/:skillId")
  async getMySkillDetails(@Req() req: any, @Param("skillId") skillId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.getSelfSkillDetails(actor.userId, skillId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me")
  async upsertMySkills(
    @Req() req: any,
    @Body() body: { ratings: { skillId: string; level: number }[] }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.upsertSelfRatings(actor.userId, body.ratings || []);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me/notes")
  async updateMySkillNotes(
    @Req() req: any,
    @Body() body: { skillId: string; notes: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.updateSelfNotes(actor.userId, body.skillId, body.notes ?? "");
  }

  // Employer ratings for a worker's skills (OWNER/ADMIN only for now)
  @UseGuards(JwtAuthGuard)
  @Post("workers/:userId")
  async addEmployerRating(
    @Param("userId") userId: string,
    @Body() body: { skillId: string; level: number; comment?: string },
    @Req() req: any
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.addEmployerRating(actor, userId, body.skillId, body.level, body.comment);
  }

  // Admin-only: view detailed peer/client ratings (including comments) for a worker skill
  @UseGuards(JwtAuthGuard)
  @Get("workers/:userId/details/:skillId")
  async getWorkerSkillDetails(
    @Req() req: any,
    @Param("userId") userId: string,
    @Param("skillId") skillId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.getWorkerSkillDetails(actor, userId, skillId);
  }

  // Client ratings for a worker's skills (CLIENT users)
  @UseGuards(JwtAuthGuard)
  @Post("clients/:userId")
  async addClientRating(
    @Param("userId") userId: string,
    @Body() body: { skillId: string; level: number; comment?: string },
    @Req() req: any
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.addClientRating(actor, userId, body.skillId, body.level, body.comment);
  }

  // User-submitted skill suggestions (visible only to the submitting user for now)
  @UseGuards(JwtAuthGuard)
  @Get("suggestions/me")
  async listMySuggestions(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.listMySuggestions(actor.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("suggestions")
  async createSuggestion(
    @Req() req: any,
    @Body() body: { label: string; categoryLabel?: string; description?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.skills.createSuggestion(actor.userId, body);
  }

  // Admin: review pending skill suggestions
  @UseGuards(JwtAuthGuard)
  @Get("suggestions/pending")
  async listPendingSuggestions(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    this.skills.ensureCanReviewSkills(actor);
    return this.skills.listPendingSuggestions();
  }

  @UseGuards(JwtAuthGuard)
  @Post("suggestions/:id/:action")
  async moderateSuggestion(
    @Req() req: any,
    @Param("id") id: string,
    @Param("action") action: "approve" | "reject",
  ) {
    const actor = req.user as AuthenticatedUser;
    this.skills.ensureCanReviewSkills(actor);

    if (action === "approve") {
      return this.skills.approveSuggestion(id);
    }

    return this.skills.updateSuggestionStatus(id, "REJECTED");
  }

  @UseGuards(JwtAuthGuard)
  @Get("suggestions/:id/review")
  async getSuggestionReview(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    this.skills.ensureCanReviewSkills(actor);
    return this.skills.getSuggestionReview(id);
  }
}
