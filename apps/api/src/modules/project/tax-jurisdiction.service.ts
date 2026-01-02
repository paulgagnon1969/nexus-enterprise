import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

// NOTE: Temporary stub implementation for nex-net branch.
// The underlying Prisma TaxJurisdiction model and TAPOUT baseline profile
// are not wired up here, so we provide a minimal, non-crashing service
// that callers can safely depend on without blocking API startup.

@Injectable()
export class TaxJurisdictionService {
  constructor(private readonly prisma: PrismaService) {}

  // For now, do not attempt to create or resolve real tax jurisdictions in
  // this branch. Payroll/tax integration can wire this back up when ready.
  async resolveOrCreateForProject(companyId: string, project: any): Promise<any> {
    return null;
  }

  // Minimal summary object so callers have a predictable shape even when
  // tax jurisdictions are not implemented.
  async getProjectTaxSummary(projectId: string, companyId: string) {
    return {
      projectId,
      hasJurisdiction: false,
      needsReview: true,
      locationLabel: null,
      rates: null,
      source: null,
    };
  }
}
