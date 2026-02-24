import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ProjectParticleType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Stock template definitions — seeded on app startup for all tenants.
// ---------------------------------------------------------------------------

interface StockPhaseDefinition {
  code: string;       // "Phase - 01"
  name: string;       // "Site Prep"
  activities: string[];
}

interface StockTemplateDefinition {
  name: string;
  description: string;
  vertical: string;
  phases: StockPhaseDefinition[];
}

const LEGACY_STOCK_NAMES = [
  "New Construction Template",
  "Iron Side Residential New Construction",
  "New Construction Project Organization",
];

/**
 * Canonical stock template definition.
 * Source: Iron Side Construction FL "job checklist example.csv"
 *   Column A = group code (1, 2, 3, 4)
 *   Column B = activity name
 * 40 line items in exact CSV order. Do NOT rename, reorder, or add items
 * without consulting the tenant's business process.
 */
const STOCK_TEMPLATES: StockTemplateDefinition[] = [
  {
    name: "Iron Side New Construction",
    description:
      "40-item residential new construction checklist — Iron Side Construction FL.",
    vertical: "residential",
    phases: [
      {
        code: "1",
        name: "Site Prep",
        activities: [
          "Soil Test",
          "Boundary Survey",
          "Land Clearing",
          "Fill Dirt 8 Loads",
          "Rough Plumbing",
          "House Pad",
          "Slab",
          "Termit Pre-treat",
        ],
      },
      {
        code: "2",
        name: "Structure",
        activities: [
          "Pump Service",
          "Block",
          "Pump Lintels",
          "Framing",
          "Window Install",
          "2nd Rough Plumbing",
          "Rough HVAC",
          "Door Installation",
          "Roof",
          "Soffit Install",
          "Stucco",
          "Stucco Grade",
          "Septic Install",
        ],
      },
      {
        code: "3",
        name: "Interior Finishes",
        activities: [
          "Drywall",
          "Cabinet Assembly",
          "HVAC Trim",
          "Plumbing Trim",
          "Soffit Install",
          "Well Install",
          "Mirrors & Shelving",
          "Bathroom Hardware",
          "Shelving",
          "Lighting",
        ],
      },
      {
        code: "4",
        name: "Site Completion",
        activities: [
          "DriveWay Pour",
          "Final Grade",
          "Fill Dirt - Truck #421",
          "BPI Certified Testing",
          "Sod installation",
          "Tree Service",
          "Painting",
          "Flooring labor",
          "Trim labor",
        ],
      },
    ],
  },
];

@Injectable()
export class OrgTemplateService implements OnModuleInit {
  private readonly logger = new Logger(OrgTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Seed stock templates on startup (idempotent)
  // ---------------------------------------------------------------------------

  async onModuleInit() {
    try {
      for (const def of STOCK_TEMPLATES) {
        // If a legacy-named template exists, rename it in-place.
        const legacy = await this.prisma.orgTemplate.findFirst({
          where: { isStock: true, name: { in: LEGACY_STOCK_NAMES } },
        });
        if (legacy) {
          await this.prisma.orgTemplate.update({
            where: { id: legacy.id },
            data: { name: def.name, isStock: true, companyId: null, isActive: true },
          });
        }

        // Remove duplicate stock templates with the same name (keep first).
        const dupes = await this.prisma.orgTemplate.findMany({
          where: { name: def.name, isStock: true },
          orderBy: { createdAt: 'asc' },
        });
        if (dupes.length > 1) {
          for (const dupe of dupes.slice(1)) {
            await this.prisma.orgTemplateNode.deleteMany({ where: { templateId: dupe.id } });
            await this.prisma.orgTemplate.delete({ where: { id: dupe.id } });
            this.logger.log(`Removed duplicate stock template "${def.name}" (${dupe.id})`);
          }
        }

        await this.seedOrResyncStockTemplate(def);
      }
    } catch (err: any) {
      // Non-fatal: stock template seeding must not crash the process.
      // The OrgTemplate table may not exist yet if migrations are pending.
      this.logger.warn(
        `Stock template seeding failed (non-fatal): ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Seed a stock template if it doesn't exist, or resync its nodes if the
   * definition has changed (e.g. codes/names were corrected).
   */
  private async seedOrResyncStockTemplate(def: StockTemplateDefinition) {
    let template = await this.prisma.orgTemplate.findFirst({
      where: { name: def.name, isStock: true },
      include: { nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });

    if (!template) {
      // Fresh seed.
      template = await this.prisma.orgTemplate.create({
        data: {
          companyId: null,
          name: def.name,
          description: def.description,
          vertical: def.vertical,
          isStock: true,
        },
        include: { nodes: true },
      });
    }

    // Check if nodes need resyncing: compare top-level codes.
    const currentPhaseCodes = template.nodes
      .filter((n) => !n.parentNodeId)
      .map((n) => n.code);
    const expectedPhaseCodes = def.phases.map((p) => p.code);
    const needsResync =
      template.nodes.length === 0 ||
      currentPhaseCodes.length !== expectedPhaseCodes.length ||
      currentPhaseCodes.some((c, i) => c !== expectedPhaseCodes[i]);

    if (!needsResync) {
      // Update metadata.
      await this.prisma.orgTemplate.update({
        where: { id: template.id },
        data: { description: def.description },
      });

      // Update phase names and activity names if they've drifted.
      const currentPhases = template.nodes.filter((n) => !n.parentNodeId);
      for (let i = 0; i < currentPhases.length && i < def.phases.length; i++) {
        if (currentPhases[i].name !== def.phases[i].name) {
          await this.prisma.orgTemplateNode.update({
            where: { id: currentPhases[i].id },
            data: { name: def.phases[i].name },
          });
          this.logger.log(
            `Updated phase name "${currentPhases[i].name}" → "${def.phases[i].name}"`,
          );
        }
        // Check activity names under this phase.
        const currentActivities = template.nodes
          .filter((n) => n.parentNodeId === currentPhases[i].id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        for (let j = 0; j < currentActivities.length && j < def.phases[i].activities.length; j++) {
          if (currentActivities[j].name !== def.phases[i].activities[j]) {
            await this.prisma.orgTemplateNode.update({
              where: { id: currentActivities[j].id },
              data: { name: def.phases[i].activities[j] },
            });
            this.logger.log(
              `Updated activity name "${currentActivities[j].name}" → "${def.phases[i].activities[j]}"`,
            );
          }
        }
      }
      return;
    }

    // Wipe existing nodes and recreate from definition.
    if (template.nodes.length > 0) {
      await this.prisma.orgTemplateNode.deleteMany({
        where: { templateId: template.id },
      });
      this.logger.log(
        `Clearing ${template.nodes.length} stale nodes from stock template "${def.name}"`,
      );
    }

    let globalSort = 0;
    for (let pi = 0; pi < def.phases.length; pi++) {
      const phase = def.phases[pi];
      const phaseNode = await this.prisma.orgTemplateNode.create({
        data: {
          templateId: template.id,
          code: phase.code,
          name: phase.name,
          sortOrder: pi + 1,
        },
      });

      for (const actName of phase.activities) {
        await this.prisma.orgTemplateNode.create({
          data: {
            templateId: template.id,
            parentNodeId: phaseNode.id,
            name: actName,
            sortOrder: globalSort++,
          },
        });
      }
    }

    this.logger.log(
      `Synced stock template "${def.name}" (${template.id}) — ${def.phases.length} groups, ${def.phases.reduce((s, p) => s + p.activities.length, 0)} items`,
    );
  }

  // ---------------------------------------------------------------------------
  // Template CRUD
  // ---------------------------------------------------------------------------

  /** List templates visible to the tenant (own + stock). */
  async listTemplates(companyId: string) {
    return this.prisma.orgTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ companyId }, { isStock: true }],
      },
      include: {
        _count: { select: { nodes: true } },
      },
      orderBy: [{ isStock: "desc" }, { name: "asc" }],
    });
  }

  // ---------------------------------------------------------------------------
  // Admin (SUPER_ADMIN) — cross-tenant template management
  // ---------------------------------------------------------------------------

  /** List ALL org templates across all tenants (admin only). */
  async adminListAllTemplates() {
    return this.prisma.orgTemplate.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { nodes: true, projects: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ isStock: "desc" }, { name: "asc" }],
    });
  }

  /** Get full template with nodes (admin — no tenant restriction). */
  async adminGetTemplate(templateId: string) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, isActive: true },
      include: {
        nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        company: { select: { id: true, name: true } },
      },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /** Create a new stock template (admin only). */
  async adminCreateTemplate(body: {
    name: string;
    description?: string | null;
    vertical?: string | null;
  }) {
    return this.prisma.orgTemplate.create({
      data: {
        companyId: null,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        vertical: body.vertical?.trim() || null,
        isStock: true,
      },
    });
  }

  /** Update any template (admin — no tenant restriction). */
  async adminUpdateTemplate(
    templateId: string,
    body: { name?: string; description?: string; vertical?: string; isStock?: boolean },
  ) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    const data: any = {};
    if (body.name != null) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.vertical !== undefined) data.vertical = body.vertical?.trim() || null;
    if (body.isStock !== undefined) data.isStock = body.isStock;

    return this.prisma.orgTemplate.update({ where: { id: templateId }, data });
  }

  /** Hard-delete any template (admin only). */
  async adminDeleteTemplate(templateId: string) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    // Check for projects still referencing this template.
    const projectCount = await this.prisma.project.count({
      where: { orgTemplateId: templateId },
    });

    // Wipe nodes, then delete template.
    await this.prisma.orgTemplateNode.deleteMany({ where: { templateId } });
    await this.prisma.orgTemplate.delete({ where: { id: templateId } });

    return { deleted: true, projectsUnlinked: projectCount };
  }

  /** Add a node to any template (admin — no tenant restriction). */
  async adminAddNode(
    templateId: string,
    body: { name: string; parentNodeId?: string | null; code?: string | null; sortOrder?: number },
  ) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template not found');

    return this.prisma.orgTemplateNode.create({
      data: {
        templateId,
        parentNodeId: body.parentNodeId?.trim() || null,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        sortOrder: body.sortOrder ?? 0,
      },
    });
  }

  /** Update any template node (admin). */
  async adminUpdateNode(
    nodeId: string,
    body: { name?: string; code?: string; sortOrder?: number },
  ) {
    const node = await this.prisma.orgTemplateNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    const data: any = {};
    if (body.name != null) data.name = body.name.trim();
    if (body.code !== undefined) data.code = body.code?.trim() || null;
    if (body.sortOrder != null) data.sortOrder = body.sortOrder;

    return this.prisma.orgTemplateNode.update({ where: { id: nodeId }, data });
  }

  /** Delete any template node (admin). */
  async adminDeleteNode(nodeId: string) {
    const node = await this.prisma.orgTemplateNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node not found');

    await this.prisma.orgTemplateNode.delete({ where: { id: nodeId } });
    return { deleted: true };
  }

  /** Get full template with node tree. */
  async getTemplate(templateId: string, companyId: string) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: {
        id: templateId,
        isActive: true,
        OR: [{ companyId }, { isStock: true }],
      },
      include: {
        nodes: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  /** Create a new template for a tenant. */
  async createTemplate(
    companyId: string,
    actor: AuthenticatedUser,
    body: {
      name: string;
      description?: string | null;
      vertical?: string | null;
    },
  ) {
    return this.prisma.orgTemplate.create({
      data: {
        companyId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        vertical: body.vertical?.trim() || null,
        createdByUserId: actor.userId,
      },
    });
  }

  /** Update template metadata. */
  async updateTemplate(
    templateId: string,
    companyId: string,
    body: {
      name?: string | null;
      description?: string | null;
      vertical?: string | null;
    },
  ) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!template) throw new NotFoundException("Template not found");

    const data: any = {};
    if (body.name != null) data.name = body.name.trim();
    if (body.description !== undefined)
      data.description = body.description?.trim() || null;
    if (body.vertical !== undefined)
      data.vertical = body.vertical?.trim() || null;

    return this.prisma.orgTemplate.update({
      where: { id: templateId },
      data,
    });
  }

  /** Soft-delete a template. */
  async deleteTemplate(templateId: string, companyId: string) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!template) throw new NotFoundException("Template not found");

    return this.prisma.orgTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  /** Add a node to a template. */
  async addNode(
    templateId: string,
    companyId: string,
    body: {
      name: string;
      parentNodeId?: string | null;
      sortOrder?: number | null;
      defaultPctComplete?: number | null;
      defaultDurationDays?: number | null;
    },
  ) {
    const template = await this.prisma.orgTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!template) throw new NotFoundException("Template not found");

    return this.prisma.orgTemplateNode.create({
      data: {
        templateId,
        parentNodeId: body.parentNodeId?.trim() || null,
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
        defaultPctComplete: body.defaultPctComplete ?? 0,
        defaultDurationDays: body.defaultDurationDays ?? null,
      },
    });
  }

  /** Update a node. */
  async updateNode(
    templateId: string,
    nodeId: string,
    companyId: string,
    body: {
      name?: string | null;
      sortOrder?: number | null;
      defaultPctComplete?: number | null;
      defaultDurationDays?: number | null;
    },
  ) {
    const node = await this.prisma.orgTemplateNode.findFirst({
      where: { id: nodeId, templateId, template: { companyId, isActive: true } },
    });
    if (!node) throw new NotFoundException("Node not found");

    const data: any = {};
    if (body.name != null) data.name = body.name.trim();
    if (body.sortOrder != null) data.sortOrder = body.sortOrder;
    if (body.defaultPctComplete != null) data.defaultPctComplete = body.defaultPctComplete;
    if (body.defaultDurationDays !== undefined)
      data.defaultDurationDays = body.defaultDurationDays;

    return this.prisma.orgTemplateNode.update({
      where: { id: nodeId },
      data,
    });
  }

  /** Remove a node (cascades to children via schema onDelete: Cascade). */
  async deleteNode(templateId: string, nodeId: string, companyId: string) {
    const node = await this.prisma.orgTemplateNode.findFirst({
      where: { id: nodeId, templateId, template: { companyId, isActive: true } },
    });
    if (!node) throw new NotFoundException("Node not found");

    await this.prisma.orgTemplateNode.delete({ where: { id: nodeId } });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Apply template to project
  // ---------------------------------------------------------------------------

  /**
   * Walk the OrgTemplateNode tree and create ProjectParticles for each node,
   * preserving the parent→child hierarchy via parentParticleId.
   */
  async applyTemplateToProject(
    projectId: string,
    companyId: string,
    orgTemplateId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException("Project not found");

    const template = await this.prisma.orgTemplate.findFirst({
      where: {
        id: orgTemplateId,
        isActive: true,
        OR: [{ companyId }, { isStock: true }],
      },
      include: {
        nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });
    if (!template) throw new NotFoundException("Template not found");

    // Get or create the "Project Site" unit for this project.
    let unit = await this.prisma.projectUnit.findFirst({
      where: { projectId, label: "Project Site" },
    });
    if (!unit) {
      unit = await this.prisma.projectUnit.create({
        data: { companyId, projectId, label: "Project Site" },
      });
    }

    // Ensure there is a visible root particle named "Project Site" under the unit.
    let rootParticle = await this.prisma.projectParticle.findFirst({
      where: { projectId, unitId: unit.id, parentParticleId: null, name: "Project Site" },
    });
    if (!rootParticle) {
      rootParticle = await this.prisma.projectParticle.create({
        data: {
          companyId,
          projectId,
          unitId: unit.id,
          type: ProjectParticleType.ROOM,
          name: "Project Site",
          fullLabel: "Project Site",
          parentParticleId: null,
          percentComplete: 0,
        },
      });
    }

    // Build node tree in memory.
    const nodesByParent = new Map<string | null, typeof template.nodes>();
    for (const node of template.nodes) {
      const key = node.parentNodeId ?? "__root__";
      const list = nodesByParent.get(key) ?? [];
      list.push(node);
      nodesByParent.set(key, list);
    }

    // Build a lookup from node ID → node (for resolving parent code).
    const nodesById = new Map<string, (typeof template.nodes)[0]>();
    for (const node of template.nodes) {
      nodesById.set(node.id, node);
    }

    // Recursively create particles.
    const createdParticles: any[] = [];

    const createParticles = async (
      parentNodeId: string | null,
      parentParticleId: string | null,
      inheritedGroupCode: string | null,
    ) => {
      const key = parentNodeId ?? "__root__";
      const children = nodesByParent.get(key) ?? [];
      for (const node of children) {
        // Phase nodes carry their own code; activity nodes inherit from parent.
        const groupCode = node.code ?? inheritedGroupCode;

        const particle = await this.prisma.projectParticle.create({
          data: {
            companyId,
            projectId,
            unitId: unit!.id,
            type: ProjectParticleType.ROOM,
            name: node.name,
            fullLabel: node.name,
            parentParticleId,
            percentComplete: node.defaultPctComplete,
            externalGroupCode: groupCode,
            externalGroupDescription: node.name,
          },
        });
        createdParticles.push(particle);
        await createParticles(node.id, particle.id, groupCode);
      }
    };

    await createParticles(null, rootParticle.id, null);

    // Set provenance on project.
    await this.prisma.project.update({
      where: { id: projectId },
      data: { orgTemplateId },
    });

    this.logger.log(
      `Applied template "${template.name}" to project ${projectId}: ${createdParticles.length} particles created`,
    );

    return {
      projectId,
      templateId: orgTemplateId,
      templateName: template.name,
      particlesCreated: createdParticles.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Remove template particles from project
  // ---------------------------------------------------------------------------

  /**
   * Delete all org-tree particles that are NOT attached to PETL items.
   * Preserves the root "Project Site" particle and any particles (including
   * their ancestors) that have SowItems linked.
   */
  async removeTemplateFromProject(projectId: string, companyId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Load all particles for this project.
    const allParticles = await this.prisma.projectParticle.findMany({
      where: { projectId },
      include: { _count: { select: { sowItems: true } } },
    });

    // Find root "Project Site" particle — always keep.
    const rootParticle = allParticles.find(
      (p) => !p.parentParticleId && p.name === 'Project Site',
    );

    // Identify particles with PETL items attached.
    const petlParticleIds = new Set(
      allParticles.filter((p) => p._count.sowItems > 0).map((p) => p.id),
    );

    // Walk up the tree to also keep ancestors of PETL-attached particles.
    const keepIds = new Set<string>();
    if (rootParticle) keepIds.add(rootParticle.id);

    const particleById = new Map(allParticles.map((p) => [p.id, p]));

    const markAncestors = (id: string) => {
      let current = particleById.get(id);
      while (current) {
        if (keepIds.has(current.id)) break;
        keepIds.add(current.id);
        current = current.parentParticleId
          ? particleById.get(current.parentParticleId)
          : undefined;
      }
    };

    for (const pid of petlParticleIds) {
      markAncestors(pid);
    }

    // Everything NOT in keepIds gets deleted.
    const toDelete = allParticles
      .filter((p) => !keepIds.has(p.id))
      .map((p) => p.id);

    if (toDelete.length > 0) {
      // Delete leaf-first to respect the self-referential FK.
      // Build depth map.
      const depthOf = (id: string, seen = new Set<string>()): number => {
        const p = particleById.get(id);
        if (!p || !p.parentParticleId || seen.has(id)) return 0;
        seen.add(id);
        return 1 + depthOf(p.parentParticleId, seen);
      };
      const sorted = [...toDelete].sort(
        (a, b) => depthOf(b) - depthOf(a),
      );

      // Batch delete in depth order.
      for (const id of sorted) {
        await this.prisma.projectParticle.delete({ where: { id } }).catch(() => {
          // Ignore if already deleted via cascade.
        });
      }
    }

    // Clear template reference on project.
    await this.prisma.project.update({
      where: { id: projectId },
      data: { orgTemplateId: null },
    });

    this.logger.log(
      `Removed template from project ${projectId}: deleted ${toDelete.length} particles, kept ${keepIds.size}`,
    );

    return {
      projectId,
      particlesDeleted: toDelete.length,
      particlesKept: keepIds.size,
      petlItemsPreserved: petlParticleIds.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Save project org structure as template
  // ---------------------------------------------------------------------------

  /**
   * Snapshot the current project's particle hierarchy into a new OrgTemplate.
   */
  async saveProjectAsTemplate(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    body: {
      name: string;
      description?: string | null;
      vertical?: string | null;
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
    });
    if (!project) throw new NotFoundException("Project not found");

    // Get all particles for this project (excluding the root "Project Site" particle).
    const particles = await this.prisma.projectParticle.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }],
    });

    // Find the root particle (name = "Project Site", no parent).
    const rootParticle = particles.find(
      (p) => !p.parentParticleId && p.name === "Project Site",
    );

    // Build template.
    const template = await this.prisma.orgTemplate.create({
      data: {
        companyId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        vertical: body.vertical?.trim() || null,
        createdByUserId: actor.userId,
      },
    });

    // Map particle IDs to template node IDs.
    const particleToNode = new Map<string, string>();

    // Only include particles that are children of the root (or have parentParticleId).
    // We skip the root "Project Site" particle itself since it's auto-created.
    const childParticles = particles.filter(
      (p) => p.id !== rootParticle?.id,
    );

    let sortOrder = 0;
    for (const p of childParticles) {
      // Map parentParticleId → parentNodeId.
      let parentNodeId: string | null = null;
      if (p.parentParticleId && particleToNode.has(p.parentParticleId)) {
        parentNodeId = particleToNode.get(p.parentParticleId)!;
      }

      const node = await this.prisma.orgTemplateNode.create({
        data: {
          templateId: template.id,
          parentNodeId,
          name: p.name,
          sortOrder: sortOrder++,
          defaultPctComplete: p.percentComplete,
        },
      });

      particleToNode.set(p.id, node.id);
    }

    this.logger.log(
      `Saved project ${projectId} as template "${template.name}" (${childParticles.length} nodes)`,
    );

    return {
      templateId: template.id,
      name: template.name,
      nodeCount: childParticles.length,
    };
  }
}
