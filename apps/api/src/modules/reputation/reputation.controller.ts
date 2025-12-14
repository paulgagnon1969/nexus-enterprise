import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ReputationService } from "./reputation.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("reputation")
export class ReputationController {
  constructor(private readonly reputation: ReputationService) {}

  @UseGuards(JwtAuthGuard)
  @Post("company/:companyId/overall")
  async rateCompany(
    @Param("companyId") companyId: string,
    @Body("score") score: number,
    @Body("comment") comment: string | undefined,
    @Req() req: any,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.reputation.rateCompanyOverall(actor, companyId, score, comment);
  }

  @UseGuards(JwtAuthGuard)
  @Post("user/:userId/overall")
  async rateUser(
    @Param("userId") userId: string,
    @Body("score") score: number,
    @Body("comment") comment: string | undefined,
    @Req() req: any,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.reputation.rateUserOverall(actor, userId, score, comment);
  }
}
