import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AssetRepository } from "../../infra/prisma-v1/asset.repository";
import { AssetType } from "@prisma/client";

@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetController {
  constructor(private readonly assets: AssetRepository) {}

  @Get()
  async listForCompany(@Req() req: any) {
    const user = req.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      // In practice, JwtStrategy always attaches companyId; this is a safety net.
      return [];
    }

    return this.assets.listAssetsForCompany(user.companyId);
  }

  @Post()
  async createForCompany(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      code?: string | null;
      description?: string | null;
      assetType: AssetType;
      baseUnit?: string | null;
      baseRate?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new Error("Missing company context for asset creation");
    }

    // Thin pass-through to the repository; no legacy coupling.
    return this.assets.createAsset({
      companyId: user.companyId,
      name: body.name,
      code: body.code ?? null,
      description: body.description ?? null,
      assetType: body.assetType,
      baseUnit: body.baseUnit ?? null,
      baseRate: body.baseRate ?? null,
    });
  }
}
