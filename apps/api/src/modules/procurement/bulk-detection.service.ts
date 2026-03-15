import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { EmailService } from '../../common/email.service';
import { normalizeMaterialKey } from '@repo/database';
import { $Enums } from '@prisma/client';

// ── Configurable Thresholds ──────────────────────────────────────────────────

const MIN_PROJECTS_PER_MATERIAL = 3;
const MIN_MATERIAL_VALUE_USD = 5_000;
const MIN_QUALIFYING_MATERIALS = 3;
const CLUSTER_RADIUS_MILES = 50;
const OPPORTUNITY_EXPIRY_DAYS = 30;
const UPDATE_VALUE_INCREASE_THRESHOLD = 0.20; // 20% increase triggers re-notification

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lng points in miles */
function haversineMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Build a cluster key from city + state (e.g. "dallas-tx") */
function buildClusterKey(city: string, state: string): string {
  return `${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.toLowerCase()}`;
}

/** Format currency for display */
function fmtCurrency(n: number): string {
  return n >= 1_000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectInfo {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  clusterKey: string;
}

interface MaterialAgg {
  normalizedKey: string;
  description: string;
  categoryCode: string | null;
  selectionCode: string | null;
  activity: string | null;
  unit: string | null;
  projectBreakdown: Array<{
    projectId: string;
    projectName: string;
    qty: number;
    unitCost: number;
  }>;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BulkDetectionService {
  private readonly logger = new Logger(BulkDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CRON — Nightly scan at 3 AM
  // ═══════════════════════════════════════════════════════════════════════════

  @Cron('0 3 * * *')
  async handleNightlyScan() {
    try {
      // Find all companies with active projects
      const companies = await this.prisma.project.findMany({
        where: { status: 'active' },
        select: { companyId: true },
        distinct: ['companyId'],
      });

      this.logger.log(`NexAGG nightly scan: ${companies.length} tenants`);

      for (const { companyId } of companies) {
        try {
          await this.detectOpportunities(companyId);
        } catch (err: any) {
          this.logger.error(`NexAGG scan failed for company ${companyId}: ${err?.message}`);
        }
      }

      // Expire stale opportunities
      await this.expireStaleOpportunities();
    } catch (err: any) {
      this.logger.error(`NexAGG nightly scan failed: ${err?.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE DETECTION — detectOpportunities(companyId)
  // ═══════════════════════════════════════════════════════════════════════════

  async detectOpportunities(companyId: string) {
    const startMs = Date.now();

    // 1. Fetch all active projects with ACTIVE estimates and geocode data
    const projects = await this.prisma.project.findMany({
      where: {
        companyId,
        status: 'active',
        estimateVersions: { some: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
      },
    });

    if (projects.length < MIN_PROJECTS_PER_MATERIAL) {
      this.logger.debug(`NexAGG: company ${companyId} — only ${projects.length} active projects, skipping`);
      return [];
    }

    // 2. Build project info with cluster keys
    const projectInfos: ProjectInfo[] = projects.map((p) => ({
      ...p,
      clusterKey: buildClusterKey(p.city, p.state),
    }));

    // 3. Geographic clustering — group projects by proximity
    const clusters = this.buildGeographicClusters(projectInfos);

    // 4. For each cluster, fetch SowItems and detect opportunities
    const created: string[] = [];

    for (const [clusterKey, clusterProjects] of clusters) {
      if (clusterProjects.length < MIN_PROJECTS_PER_MATERIAL) continue;

      const projectIds = clusterProjects.map((p) => p.id);

      // Fetch SowItems with material content from ACTIVE estimates
      const sowItems = await this.prisma.sowItem.findMany({
        where: {
          estimateVersion: { status: 'ACTIVE', projectId: { in: projectIds } },
          materialAmount: { not: null, gt: 0 },
        },
        select: {
          id: true,
          description: true,
          qty: true,
          unit: true,
          unitCost: true,
          materialAmount: true,
          categoryCode: true,
          selectionCode: true,
          activity: true,
          estimateVersion: {
            select: { projectId: true },
          },
        },
      });

      // 5. Normalize & aggregate by material key across projects
      const materialMap = new Map<string, MaterialAgg>();

      for (const item of sowItems) {
        const key = normalizeMaterialKey(item.description);
        if (!key) continue; // Pure labor line

        const projectId = item.estimateVersion.projectId;
        const projectInfo = clusterProjects.find((p) => p.id === projectId);
        if (!projectInfo) continue;

        const existing = materialMap.get(key);
        if (existing) {
          // Only count each project once per material
          const existingProject = existing.projectBreakdown.find(
            (pb) => pb.projectId === projectId,
          );
          if (existingProject) {
            existingProject.qty += item.qty ?? 0;
            // Weighted average of unit cost
            existingProject.unitCost = item.unitCost ?? existingProject.unitCost;
          } else {
            existing.projectBreakdown.push({
              projectId,
              projectName: projectInfo.name,
              qty: item.qty ?? 0,
              unitCost: item.unitCost ?? 0,
            });
          }
        } else {
          materialMap.set(key, {
            normalizedKey: key,
            description: item.description,
            categoryCode: item.categoryCode,
            selectionCode: item.selectionCode,
            activity: item.activity,
            unit: item.unit,
            projectBreakdown: [
              {
                projectId,
                projectName: projectInfo.name,
                qty: item.qty ?? 0,
                unitCost: item.unitCost ?? 0,
              },
            ],
          });
        }
      }

      // 6. Filter materials that meet thresholds
      const qualifyingMaterials: MaterialAgg[] = [];

      for (const mat of materialMap.values()) {
        if (mat.projectBreakdown.length < MIN_PROJECTS_PER_MATERIAL) continue;

        const totalQty = mat.projectBreakdown.reduce((s, pb) => s + pb.qty, 0);
        const avgUnitCost =
          mat.projectBreakdown.reduce((s, pb) => s + pb.unitCost, 0) /
          mat.projectBreakdown.length;
        const totalValue = totalQty * avgUnitCost;

        if (totalValue >= MIN_MATERIAL_VALUE_USD) {
          qualifyingMaterials.push(mat);
        }
      }

      if (qualifyingMaterials.length < MIN_QUALIFYING_MATERIALS) continue;

      // 7. Check for existing active opportunity in this cluster
      const opportunityId = await this.upsertOpportunity(
        companyId,
        clusterKey,
        clusterProjects,
        qualifyingMaterials,
      );

      if (opportunityId) {
        created.push(opportunityId);
      }
    }

    const elapsed = Date.now() - startMs;
    if (created.length > 0) {
      this.logger.log(
        `NexAGG: company ${companyId} — ${created.length} opportunity(ies) created/updated in ${elapsed}ms`,
      );
    }

    return created;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOGRAPHIC CLUSTERING
  // ═══════════════════════════════════════════════════════════════════════════

  private buildGeographicClusters(
    projects: ProjectInfo[],
  ): Map<string, ProjectInfo[]> {
    const clusters = new Map<string, ProjectInfo[]>();

    // First pass: group by city+state key
    for (const project of projects) {
      const key = project.clusterKey;
      const group = clusters.get(key) ?? [];
      group.push(project);
      clusters.set(key, group);
    }

    // Second pass: merge clusters that are within CLUSTER_RADIUS_MILES
    // (using centroid of each cluster for distance calculation)
    const clusterEntries = Array.from(clusters.entries());
    const merged = new Set<string>();

    for (let i = 0; i < clusterEntries.length; i++) {
      if (merged.has(clusterEntries[i][0])) continue;

      for (let j = i + 1; j < clusterEntries.length; j++) {
        if (merged.has(clusterEntries[j][0])) continue;

        const centroidA = this.clusterCentroid(clusterEntries[i][1]);
        const centroidB = this.clusterCentroid(clusterEntries[j][1]);

        if (
          centroidA && centroidB &&
          haversineMiles(centroidA.lat, centroidA.lng, centroidB.lat, centroidB.lng) <
            CLUSTER_RADIUS_MILES
        ) {
          // Merge j into i
          clusterEntries[i][1].push(...clusterEntries[j][1]);
          merged.add(clusterEntries[j][0]);
          clusters.delete(clusterEntries[j][0]);
        }
      }

      // Update the cluster with merged projects
      clusters.set(clusterEntries[i][0], clusterEntries[i][1]);
    }

    return clusters;
  }

  private clusterCentroid(
    projects: ProjectInfo[],
  ): { lat: number; lng: number } | null {
    const geoProjects = projects.filter((p) => p.latitude && p.longitude);
    if (geoProjects.length === 0) return null;

    const lat = geoProjects.reduce((s, p) => s + p.latitude!, 0) / geoProjects.length;
    const lng = geoProjects.reduce((s, p) => s + p.longitude!, 0) / geoProjects.length;
    return { lat, lng };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPSERT — Create or update an opportunity
  // ═══════════════════════════════════════════════════════════════════════════

  private async upsertOpportunity(
    companyId: string,
    clusterKey: string,
    clusterProjects: ProjectInfo[],
    materials: MaterialAgg[],
  ): Promise<string | null> {
    // Check for existing DETECTED/NOTIFIED/REVIEWING opportunity in this cluster
    const existing = await this.prisma.bulkProcurementOpportunity.findFirst({
      where: {
        companyId,
        clusterKey,
        status: { in: ['DETECTED', 'NOTIFIED', 'REVIEWING'] },
      },
      select: { id: true, estimatedTotalValue: true, status: true },
    });

    // Build aggregated stats
    const contributingProjectIds = new Set<string>();
    let estimatedTotalValue = 0;

    const lineItems = materials.map((mat) => {
      const totalQty = mat.projectBreakdown.reduce((s, pb) => s + pb.qty, 0);
      const avgUnitCost =
        mat.projectBreakdown.reduce((s, pb) => s + pb.unitCost, 0) /
        mat.projectBreakdown.length;
      const cost = totalQty * avgUnitCost;
      estimatedTotalValue += cost;

      for (const pb of mat.projectBreakdown) {
        contributingProjectIds.add(pb.projectId);
      }

      return {
        normalizedKey: mat.normalizedKey,
        description: mat.description,
        categoryCode: mat.categoryCode,
        selectionCode: mat.selectionCode,
        activity: mat.activity,
        unit: mat.unit,
        totalQty,
        avgUnitCost,
        estimatedTotalCost: cost,
        projectCount: mat.projectBreakdown.length,
        projectBreakdownJson: mat.projectBreakdown,
      };
    });

    // Estimate savings (simple tier: 5% for $5-25k, 10% for $25-100k, 15% for $100k+)
    const estimatedSavingsPercent =
      estimatedTotalValue >= 100_000 ? 15 :
      estimatedTotalValue >= 25_000 ? 10 : 5;

    // Build title from top material
    const topMaterial = lineItems.sort((a, b) => b.estimatedTotalCost - a.estimatedTotalCost)[0];
    const clusterLabel = clusterKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${topMaterial.description.slice(0, 50)} + ${lineItems.length - 1} materials — ${contributingProjectIds.size} projects, ${clusterLabel}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + OPPORTUNITY_EXPIRY_DAYS);

    if (existing) {
      // Update existing: only if value increased significantly
      const valueIncrease =
        (estimatedTotalValue - existing.estimatedTotalValue) /
        (existing.estimatedTotalValue || 1);

      // Delete old line items and project links, replace with fresh data
      await this.prisma.$transaction([
        this.prisma.bulkOpportunityLineItem.deleteMany({
          where: { opportunityId: existing.id },
        }),
        this.prisma.bulkOpportunityProject.deleteMany({
          where: { opportunityId: existing.id },
        }),
        this.prisma.bulkProcurementOpportunity.update({
          where: { id: existing.id },
          data: {
            title,
            totalProjectCount: contributingProjectIds.size,
            totalLineItemCount: lineItems.length,
            estimatedTotalValue,
            estimatedSavingsPercent,
            expiresAt,
          },
        }),
        ...this.buildProjectLinks(existing.id, clusterProjects, contributingProjectIds, materials),
        this.prisma.bulkOpportunityLineItem.createMany({
          data: lineItems.map((li) => ({
            opportunityId: existing.id,
            ...li,
          })),
        }),
      ]);

      // Re-notify if value increased > 20%
      if (valueIncrease >= UPDATE_VALUE_INCREASE_THRESHOLD) {
        void this.notifyStakeholders(existing.id, true);
      }

      return existing.id;
    }

    // Create new opportunity
    const opportunity = await this.prisma.bulkProcurementOpportunity.create({
      data: {
        companyId,
        clusterKey,
        title,
        totalProjectCount: contributingProjectIds.size,
        totalLineItemCount: lineItems.length,
        estimatedTotalValue,
        estimatedSavingsPercent,
        expiresAt,
        lineItems: {
          createMany: {
            data: lineItems,
          },
        },
      },
    });

    // Create project links
    const projectLinks = this.buildProjectLinkData(
      opportunity.id,
      clusterProjects,
      contributingProjectIds,
      materials,
    );
    if (projectLinks.length > 0) {
      await this.prisma.bulkOpportunityProject.createMany({
        data: projectLinks,
      });
    }

    // Notify stakeholders
    void this.notifyStakeholders(opportunity.id, false);

    return opportunity.id;
  }

  private buildProjectLinks(
    opportunityId: string,
    clusterProjects: ProjectInfo[],
    contributingProjectIds: Set<string>,
    materials: MaterialAgg[],
  ) {
    const data = this.buildProjectLinkData(opportunityId, clusterProjects, contributingProjectIds, materials);
    if (data.length === 0) return [];
    return [this.prisma.bulkOpportunityProject.createMany({ data })];
  }

  private buildProjectLinkData(
    opportunityId: string,
    clusterProjects: ProjectInfo[],
    contributingProjectIds: Set<string>,
    materials: MaterialAgg[],
  ) {
    return clusterProjects
      .filter((p) => contributingProjectIds.has(p.id))
      .map((p) => {
        const matCount = materials.filter((m) =>
          m.projectBreakdown.some((pb) => pb.projectId === p.id),
        ).length;
        const value = materials.reduce((sum, m) => {
          const pb = m.projectBreakdown.find((pb) => pb.projectId === p.id);
          return sum + (pb ? pb.qty * pb.unitCost : 0);
        }, 0);
        return {
          opportunityId,
          projectId: p.id,
          materialLineCount: matCount,
          estimatedValue: value,
        };
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS — notifyStakeholders(opportunityId)
  // ═══════════════════════════════════════════════════════════════════════════

  async notifyStakeholders(opportunityId: string, isUpdate: boolean) {
    const opp = await this.prisma.bulkProcurementOpportunity.findUnique({
      where: { id: opportunityId },
      include: {
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                teamTreeJson: true,
              },
            },
          },
        },
        lineItems: {
          orderBy: { estimatedTotalCost: 'desc' },
          take: 5,
        },
      },
    });

    if (!opp) return;

    const prefix = isUpdate ? '📦 Updated' : '📦 New';
    const title = `${prefix} bulk buy opportunity`;
    const body = `${opp.title}\nEst. value: ${fmtCurrency(opp.estimatedTotalValue)} · Est. savings: ~${opp.estimatedSavingsPercent}%`;

    // 1. Notify PMs on each contributing project (in-app + push)
    const pmUserIds = new Set<string>();
    for (const link of opp.projects) {
      const teamTree = (link.project.teamTreeJson ?? {}) as Record<string, string | string[]>;
      const pmIds = teamTree['PM'];
      if (typeof pmIds === 'string') pmUserIds.add(pmIds);
      else if (Array.isArray(pmIds)) pmIds.forEach((id) => pmUserIds.add(id));
    }

    // 2. Notify Admins + Owners (in-app + push + email)
    const admins = await this.prisma.companyMembership.findMany({
      where: {
        companyId: opp.companyId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: {
        userId: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    const adminUserIds = new Set(admins.map((a) => a.userId));

    // Combine all users for in-app notifications
    const allUserIds = new Set([...pmUserIds, ...adminUserIds]);

    // Create in-app notifications
    const notifPromises = Array.from(allUserIds).map((userId) =>
      this.notifications.createNotification({
        userId,
        companyId: opp.companyId,
        kind: $Enums.NotificationKind.BULK_PROCUREMENT,
        title,
        body,
        metadata: { opportunityId, isUpdate },
      }),
    );
    await Promise.allSettled(notifPromises);

    // Push notifications to all users
    void this.push.sendToUsers(Array.from(allUserIds), {
      title,
      body,
      data: { type: 'BULK_PROCUREMENT', opportunityId },
      sound: 'default',
    });

    // Email to admins/owners only
    const topMaterials = opp.lineItems.map((li) => ({
      description: li.description,
      totalQty: li.totalQty,
      unit: li.unit ?? '',
      avgUnitCost: li.avgUnitCost,
      projectCount: li.projectCount,
    }));

    for (const admin of admins) {
      void this.email.sendBulkOpportunityAlert({
        toEmail: admin.user.email,
        recipientName: admin.user.firstName ?? undefined,
        opportunityTitle: opp.title,
        clusterLabel: opp.clusterKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        totalProjectCount: opp.totalProjectCount,
        totalMaterialCount: opp.totalLineItemCount,
        estimatedTotalValue: opp.estimatedTotalValue,
        estimatedSavingsPercent: opp.estimatedSavingsPercent,
        topMaterials,
        reviewUrl: `https://staging-ncc.nfsgrp.com/admin/procurement/bulk-opportunities/${opp.id}`,
        isUpdate,
      });
    }

    // Update status to NOTIFIED
    if (opp.status === 'DETECTED') {
      await this.prisma.bulkProcurementOpportunity.update({
        where: { id: opp.id },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      });
    }

    this.logger.log(
      `NexAGG: Notified ${allUserIds.size} users (${pmUserIds.size} PMs, ${adminUserIds.size} admins) for opportunity ${opp.id}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPIRATION — clean up stale opportunities
  // ═══════════════════════════════════════════════════════════════════════════

  private async expireStaleOpportunities() {
    const now = new Date();
    const expired = await this.prisma.bulkProcurementOpportunity.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { in: ['DETECTED', 'NOTIFIED', 'REVIEWING'] },
      },
      data: { status: 'DISMISSED', dismissReason: 'Auto-expired after 30 days' },
    });

    if (expired.count > 0) {
      this.logger.log(`NexAGG: Auto-expired ${expired.count} stale opportunities`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API — list, detail, actions
  // ═══════════════════════════════════════════════════════════════════════════

  async listOpportunities(
    companyId: string,
    filters?: { status?: string; clusterKey?: string },
  ) {
    const where: any = { companyId };
    if (filters?.status) where.status = filters.status;
    if (filters?.clusterKey) where.clusterKey = filters.clusterKey;

    return this.prisma.bulkProcurementOpportunity.findMany({
      where,
      include: {
        _count: { select: { projects: true, lineItems: true } },
      },
      orderBy: { estimatedTotalValue: 'desc' },
    });
  }

  async getOpportunityDetail(opportunityId: string, companyId: string) {
    const opp = await this.prisma.bulkProcurementOpportunity.findFirst({
      where: { id: opportunityId, companyId },
      include: {
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                city: true,
                state: true,
                postalCode: true,
              },
            },
          },
          orderBy: { estimatedValue: 'desc' },
        },
        lineItems: {
          orderBy: { estimatedTotalCost: 'desc' },
        },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        dismissedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return opp;
  }

  async markReviewing(opportunityId: string, userId: string) {
    return this.prisma.bulkProcurementOpportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'REVIEWING',
        reviewedAt: new Date(),
        reviewedByUserId: userId,
      },
    });
  }

  async approve(opportunityId: string, userId: string) {
    return this.prisma.bulkProcurementOpportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByUserId: userId,
      },
    });
  }

  async dismiss(opportunityId: string, userId: string, reason?: string) {
    return this.prisma.bulkProcurementOpportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissedByUserId: userId,
        dismissReason: reason,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERT TO NexBUY — create shopping carts from opportunity
  // ═══════════════════════════════════════════════════════════════════════════

  async convertToNexBuy(opportunityId: string, companyId: string, userId: string) {
    const opp = await this.prisma.bulkProcurementOpportunity.findFirst({
      where: { id: opportunityId, companyId },
      include: {
        projects: { select: { projectId: true } },
        lineItems: true,
      },
    });

    if (!opp) return null;

    // Build a map of projectId → line items that include that project
    const projectLineItems = new Map<string, typeof opp.lineItems>();
    for (const li of opp.lineItems) {
      const breakdown = (li.projectBreakdownJson as any[]) ?? [];
      for (const pb of breakdown) {
        const existing = projectLineItems.get(pb.projectId) ?? [];
        existing.push(li);
        projectLineItems.set(pb.projectId, existing);
      }
    }

    // Create a shopping cart per project
    const cartIds: string[] = [];
    for (const link of opp.projects) {
      const items = projectLineItems.get(link.projectId);
      if (!items?.length) continue;

      const cart = await this.prisma.shoppingCart.create({
        data: {
          companyId,
          projectId: link.projectId,
          createdByUserId: userId,
          label: `NexAGG Bulk — ${opp.clusterKey}`,
          status: 'READY',
          horizon: 'THIS_WEEK',
        },
      });

      // Create cart items from the line items (using project-specific qty)
      for (const li of items) {
        const breakdown = (li.projectBreakdownJson as any[]) ?? [];
        const pb = breakdown.find((b: any) => b.projectId === link.projectId);
        if (!pb) continue;

        await this.prisma.shoppingCartItem.create({
          data: {
            cartId: cart.id,
            normalizedKey: li.normalizedKey,
            description: li.description,
            unit: li.unit,
            unitPrice: pb.unitCost ?? li.avgUnitCost,
            projectNeedQty: pb.qty,
            cartQty: pb.qty,
          },
        });
      }

      cartIds.push(cart.id);
    }

    // Update opportunity status
    await this.prisma.bulkProcurementOpportunity.update({
      where: { id: opp.id },
      data: { status: 'PURCHASING' },
    });

    this.logger.log(
      `NexAGG: Converted opportunity ${opp.id} to ${cartIds.length} shopping carts`,
    );

    return { cartIds, cartCount: cartIds.length };
  }
}
