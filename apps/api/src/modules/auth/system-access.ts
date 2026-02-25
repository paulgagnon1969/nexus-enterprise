import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

const NEXUS_SYSTEM_COMPANY_ID = "cmjr7o4zs000101s6z1rt1ssz";

/**
 * Verify that a user has system-level access.
 *
 * Passes if the user is SUPER_ADMIN, NCC_SYSTEM_DEVELOPER, or has
 * ADMIN/OWNER membership in the NEXUS SYSTEM company.
 */
export async function verifySystemAccess(
  prisma: PrismaService,
  user: { userId: string; globalRole?: string },
): Promise<void> {
  if (user.globalRole === "SUPER_ADMIN") return;
  if (user.globalRole === "NCC_SYSTEM_DEVELOPER") return;

  const membership = await prisma.companyMembership.findFirst({
    where: {
      userId: user.userId,
      companyId: NEXUS_SYSTEM_COMPANY_ID,
      role: { in: ["OWNER", "ADMIN"] },
    },
  });

  if (!membership) {
    throw new ForbiddenException("System admin access required");
  }
}
