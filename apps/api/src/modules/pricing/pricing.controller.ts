import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as fs from "node:fs";
import * as path from "node:path";
import { JwtAuthGuard } from "../auth/auth.guards";
import { Role, GlobalRole } from "@prisma/client";
import { getEffectiveRoleLevel } from "../auth/auth.guards";
import {
  importPriceListFromFile,
  getCurrentGoldenPriceList,
  getCurrentGoldenPriceListTable,
  getGoldenPriceListUploads,
} from "./pricing.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { importGoldenComponentsFromFile } from "@repo/database";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";

@Controller("pricing")
export class PricingController {
  constructor(private readonly prisma: PrismaService) {}

  // SUPER_ADMINs can always upload. Within a company, OWNER/ADMIN can upload.
  // Additionally, MEMBER profiles with sufficient hierarchy (e.g. EXECUTIVE/FINANCE)
  // may be allowed in the future via profileCode.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/import")
  async uploadPriceList(@Req() req: FastifyRequest) {
    // Temporary debug logging to trace Golden pricelist uploads in dev.
    // Remove or downgrade to proper logging once the pipeline is stable.
    // eslint-disable-next-line no-console
    console.log("[pricing] uploadPriceList: incoming request");

    try {
      const anyReq: any = req as any;
      const user = anyReq.user as AuthenticatedUser | undefined;

      if (!user) {
        throw new BadRequestException("Missing user in request context");
      }

      const level = getEffectiveRoleLevel({
        globalRole: user.globalRole ?? null,
        role: user.role ?? null,
        profileCode: user.profileCode ?? null,
      });
      // eslint-disable-next-line no-console
      console.log("[pricing] uploadPriceList: user=%s level=%d", user.email, level);

      // Require OWNER (90) / ADMIN (80) or SUPER_ADMIN (100) for now.
      if (level < 80) {
        throw new BadRequestException(
          "You do not have permission to upload the Golden price list.",
        );
      }

      // Use shared helper to read the single CSV file from multipart.
      const { file: filePart } = await readSingleFileFromMultipart(req, {
        fieldName: "file",
      });
      // eslint-disable-next-line no-console
      console.log(
        "[pricing] uploadPriceList: finished reading parts (hasFile=%s)",
        !!filePart,
      );

      if (!filePart.mimetype.includes("csv")) {
        throw new BadRequestException("Only CSV uploads are supported for price lists");
      }

      const uploadsRoot = path.resolve(process.cwd(), "uploads/pricing");
      if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
      }

      // eslint-disable-next-line no-console
      console.log("[pricing] uploadPriceList: calling filePart.toBuffer()...");
      const fileBuffer = await filePart.toBuffer();
      // eslint-disable-next-line no-console
      console.log("[pricing] uploadPriceList: toBuffer() resolved, size=%d", fileBuffer.length);
      const ext = path.extname(filePart.filename || "") || ".csv";
      const fileName = `pricelist-${Date.now()}${ext}`;
      const destPath = path.join(uploadsRoot, fileName);

      fs.writeFileSync(destPath, fileBuffer);
      // eslint-disable-next-line no-console
      console.log(
        "[pricing] uploadPriceList: wrote CSV to %s (%d bytes)",
        destPath,
        fileBuffer.length,
      );

      const companyId = user.companyId;
      const createdByUserId = user.userId;

      if (!companyId || !createdByUserId) {
        throw new BadRequestException("Missing company context for price list import");
      }

      // For now, process the Golden price list import synchronously in this
      // request instead of relying on the background worker/Redis. This avoids
      // cross-service filesystem and Redis connectivity issues in Cloud Run.
      const result = await importPriceListFromFile(destPath);

      // Record a completed ImportJob so the UI can show "last PETL upload" with
      // a timestamp and user, parallel to the Golden Components path.
      await this.prisma.importJob.create({
        data: {
          companyId,
          projectId: null,
          createdByUserId,
          type: "PRICE_LIST",
          status: "SUCCEEDED",
          progress: 100,
          message: `Imported Golden PETL (Price List) revision ${result.revision} with ${result.itemCount} items.`,
          csvPath: destPath,
          resultJson: result as any,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing] uploadPriceList: error", err);
      throw err;
    }
  }

  // Anyone authenticated can see which Golden price list is active; RBAC is enforced on upload.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/current")
  async currentGolden(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    const current = await getCurrentGoldenPriceList();
    if (!current || !user?.companyId) {
      return current;
    }

    const lastJob = await this.prisma.importJob.findFirst({
      where: {
        companyId: user.companyId,
        type: "PRICE_LIST",
        status: "SUCCEEDED",
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    const lastPriceListUpload = lastJob
      ? {
          at: (lastJob.finishedAt ?? lastJob.createdAt) ?? lastJob.createdAt,
          byName: lastJob.createdBy
            ? `${lastJob.createdBy.firstName ?? ""} ${lastJob.createdBy.lastName ?? ""}`.trim() ||
              lastJob.createdBy.email
            : null,
          byEmail: lastJob.createdBy?.email ?? null,
        }
      : null;

    return {
      ...current,
      lastPriceListUpload,
    };
  }

  // Raw table view of the active Golden price list, including
  // divisionCode / divisionName columns for each Cat.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/table")
  async goldenTable() {
    const table = await getCurrentGoldenPriceListTable();
    return table;
  }

  // Recent Golden price list uploads (by PriceList.createdAt), so the
  // Financial page can show an "N latest uploads" panel.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/uploads")
  async goldenUploads() {
    const uploads = await getGoldenPriceListUploads(10);
    return uploads;
  }

  // Import Golden price list component breakdowns from a CSV file. This will
  // create a PRICE_LIST_COMPONENTS ImportJob that is processed by the worker.
  // The CSV is expected to contain Cat, Sel, Activity, Desc, Component Code,
  // Qty, Material, Labor, and Equipment columns.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/components/import")
  async uploadPriceListComponents(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new BadRequestException("Missing user in request context");
    }

    const level = getEffectiveRoleLevel({
      globalRole: user.globalRole ?? null,
      role: user.role ?? null,
      profileCode: user.profileCode ?? null,
    });

    // Reuse same permission model as price-list/import.
    if (level < 80) {
      throw new BadRequestException(
        "You do not have permission to upload Golden components.",
      );
    }

    // Use shared helper to read the single CSV file from multipart.
    const { file: filePart } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
    });

    if (!filePart.mimetype.includes("csv")) {
      throw new BadRequestException(
        "Only CSV uploads are supported for Golden components",
      );
    }

    const uploadsRoot = path.resolve(process.cwd(), "uploads/pricing");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const fileBuffer = await filePart.toBuffer();
    const ext = path.extname(filePart.filename || "") || ".csv";
    const fileName = `pricelist-components-${Date.now()}${ext}`;
    const destPath = path.join(uploadsRoot, fileName);

    fs.writeFileSync(destPath, fileBuffer);

    const companyId = user.companyId;
    const createdByUserId = user.userId;

    if (!companyId || !createdByUserId) {
      throw new BadRequestException(
        "Missing company context for Golden components import",
      );
    }

    // Process Golden components synchronously here to avoid depending on the
    // background worker/Redis in Cloud Run for this path.
    const result = await importGoldenComponentsFromFile(destPath);

    // Record a completed import job so the UI can show "last uploaded by" info
    // even though we are not using the background worker for this path.
    await this.prisma.importJob.create({
      data: {
        companyId,
        projectId: null,
        createdByUserId,
        type: "PRICE_LIST_COMPONENTS",
        status: "SUCCEEDED",
        progress: 100,
        message: `Imported Golden components for ${result.itemCount} items (${result.componentCount} components).`,
        csvPath: destPath,
        resultJson: result as any,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    return result;
  }

  // Division mapping lookup: returns CSI divisions and Cat -> Division mappings
  // so the frontend can group Xactimate line items by construction division.
  @UseGuards(JwtAuthGuard)
  @Post("division-mapping")
  async divisionMapping() {
    const divisions = await this.prisma.division.findMany({
      orderBy: { sortOrder: "asc" },
    });

    const catMappingsRaw = await this.prisma.catDivision.findMany({
      orderBy: { cat: "asc" },
      include: { division: true },
    });

    const catMappings = catMappingsRaw.map((row) => ({
      cat: row.cat,
      divisionCode: row.divisionCode,
      divisionName: row.division?.name ?? null,
    }));

    return { divisions, catMappings };
  }

  // Fetch Golden price list components for the active Golden revision.
  // Optionally filter by activity (e.g. "M", "+", "-", "&").
  @UseGuards(JwtAuthGuard)
  @Post("price-list/components")
  async goldenComponents(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for Golden components");
    }

    const anyFastReq: any = req as any;
    const body: any = anyFastReq.body || {};
    const activityRaw: unknown = body.activity;
    const activity = typeof activityRaw === "string" && activityRaw.trim()
      ? activityRaw.trim().toUpperCase()
      : undefined;

    const priceList = await this.prisma.priceList.findFirst({
      where: { kind: "GOLDEN", isActive: true },
      orderBy: { revision: "desc" },
    });

    if (!priceList) {
      return { priceList: null, items: [], lastComponentsUpload: null };
    }

    const where: any = { priceListId: priceList.id };
    if (activity) {
      where.activity = activity;
    }

    const items = await this.prisma.priceListItem.findMany({
      where,
      include: {
        division: true,
        components: true,
      },
      orderBy: [
        { cat: "asc" },
        { sel: "asc" },
        { activity: "asc" },
        { lineNo: "asc" },
      ],
    });

    // Look up the most recent components import job for this company so the
    // UI can show "last uploaded by" with a timestamp.
    const lastJob = await this.prisma.importJob.findFirst({
      where: {
        companyId: user.companyId,
        type: "PRICE_LIST_COMPONENTS",
        status: "SUCCEEDED",
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const lastComponentsUpload = lastJob
      ? {
          at: (lastJob.finishedAt ?? lastJob.createdAt) ?? lastJob.createdAt,
          byName: lastJob.createdBy
            ? `${lastJob.createdBy.firstName ?? ""} ${lastJob.createdBy.lastName ?? ""}`.trim() ||
              lastJob.createdBy.email
            : null,
          byEmail: lastJob.createdBy?.email ?? null,
        }
      : null;

    return {
      priceList: {
        id: priceList.id,
        label: priceList.label,
        revision: priceList.revision,
      },
      items: items.map((it) => ({
        id: it.id,
        cat: it.cat,
        sel: it.sel,
        activity: it.activity,
        description: it.description,
        unit: it.unit,
        unitPrice: it.unitPrice,
        lastKnownUnitPrice: it.lastKnownUnitPrice,
        divisionCode: it.divisionCode,
        divisionName: it.division?.name ?? null,
        components: it.components,
      })),
      lastComponentsUpload,
    };
  }

  // Golden price list revision history: per-company log of updates when
  // Xact RAW estimates reprice Golden items.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/history")
  async goldenHistory(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for Golden history");
    }

    const logs = await this.prisma.goldenPriceUpdateLog.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: true,
        estimateVersion: true,
        user: true,
      },
    });

    return logs.map((log) => {
      const projectName = log.project?.name ?? log.projectId;
      const estimateLabel =
        log.estimateVersion?.description || log.estimateVersion?.fileName ||
        log.estimateVersionId;
      const userName = log.user
        ? `${log.user.firstName ?? ""} ${log.user.lastName ?? ""}`.trim() || log.user.email
        : null;

      return {
        id: log.id,
        createdAt: log.createdAt,
        projectId: log.projectId,
        projectName,
        estimateVersionId: log.estimateVersionId,
        estimateLabel,
        updatedCount: log.updatedCount,
        avgDelta: log.avgDelta,
        avgPercentDelta: log.avgPercentDelta,
        userId: log.userId,
        userName,
      };
    });
  }
}
