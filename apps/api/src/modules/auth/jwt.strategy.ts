import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role, GlobalRole, UserType } from "@prisma/client";

export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  role: Role;
  email: string;
  globalRole: GlobalRole;
  userType?: UserType | null;
  // Optional hook for future: code of the active RoleProfile for this membership
  profileCode?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || "change-me-access"
    });
  }

  async validate(payload: any): Promise<AuthenticatedUser> {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      email: payload.email,
      globalRole: payload.globalRole ?? GlobalRole.NONE,
      userType: payload.userType ?? null,
      profileCode: payload.profileCode ?? null,
    };
  }
}
