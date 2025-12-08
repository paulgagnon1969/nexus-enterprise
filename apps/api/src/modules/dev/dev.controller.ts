import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

interface CreateSnapshotDto {
  label?: string;
}

@Controller("dev")
export class DevController {
  @UseGuards(JwtAuthGuard)
  @Post("snapshots")
  async createSnapshot(@Req() req: any, @Body() body: CreateSnapshotDto) {
    const user = req.user as AuthenticatedUser;
    // TODO: Wire this to a real CI/GitHub Action or server-side script that
    // creates a git tag / "dev snapshot" from the current repo state.
    // For now we just log and return a fake id.

    const label = body.label || "dev-snapshot";
    const ts = new Date().toISOString();

    console.log("[DevSnapshot] Requested by", {
      userId: user.userId,
      companyId: user.companyId,
      label,
      timestamp: ts
    });

    return {
      ok: true,
      snapshotId: `${label}-${ts}`,
    };
  }
}
