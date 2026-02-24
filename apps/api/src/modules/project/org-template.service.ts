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

interface StockTemplateDefinition {
  name: string;
  description: string;
  vertical: string;
  phases: { name: string; activities: string[] }[];
}

const STOCK_TEMPLATES: StockTemplateDefinition[] = [
  {
    name: "New Construction Template",
    description:
      "4-phase residential new construction template with site prep, structure, finishes, and exterior phases.",
    vertical: "residential",
    phases: [
      {
        name: "Phase 1 – Site Prep",
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
        name: "Phase 2 – Structure",
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
        name: "Phase 3 – Finishes",
        activities: [
          "Drywall",
          "Cabinet Assembly",
          "HVAC Trim",
          "Plumbing Trim",
          "Soffit Install",
          "Well Install",
          "Mirros & Shelving",
          "Bathroom Hardware",
          "Shelving",
          "Lighting",
        ],
      },
      {
        name: "Phase 4 – Exterior",
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
        await this.seedStockTemplate(def);
      }
    } catch (err: any) {
      // Non-fatal: stock template seeding must not crash the process.
      // The OrgTemplate table may not exist yet if migrations are pending.
      this.logger.warn(
        `Stock template seeding failed (non-fatal): ${err?.message ?? err}`,
      );
    }
  }

  private async seedStockTemplate(def: StockTemplateDefinition) {
    // Skip if already seeded (match by name + isStock).
    const existing = await this.prisma.orgTemplate.findFirst({
      where: { name: def.name, isStock: true },
    });
    if (existing) return;

    const template = await this.prisma.orgTemplate.create({
      data: {
        companyId: null,
        name: def.name,
        description: def.description,
        vertical: def.vertical,
        isStock: true,
      },
    });

    let globalSort = 0;
    for (let pi = 0; pi < def.phases.length; pi++) {
      const phase = def.phases[pi];
      const phaseNode = await this.prisma.orgTemplateNode.create({
        data: {
          templateId: template.id,
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
      `Seeded stock template "${def.name}" (${template.id}) with ${def.phases.length} phases`,
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

    // Build node tree in memory.
    const nodesByParent = new Map<string | null, typeof template.nodes>();
    for (const node of template.nodes) {
      const key = node.parentNodeId ?? "__root__";
      const list = nodesByParent.get(key) ?? [];
      list.push(node);
      nodesByParent.set(key, list);
    }

    // Recursively create particles.
    const createdParticles: any[] = [];

    const createParticles = async (
      parentNodeId: string | null,
      parentParticleId: string | null,
    ) => {
      const key = parentNodeId ?? "__root__";
      const children = nodesByParent.get(key) ?? [];
      for (const node of children) {
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
          },
        });
        createdParticles.push(particle);
        await createParticles(node.id, particle.id);
      }
    };

    await createParticles(null, null);

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
