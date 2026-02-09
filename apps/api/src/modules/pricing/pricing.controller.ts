import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import * as fs from "node:fs";
import * as path from "node:path";
import { JwtAuthGuard, Role, GlobalRole, getEffectiveRoleLevel } from "../auth/auth.guards";
import {
  importPriceListFromFile,
  getCurrentGoldenPriceList,
  getCurrentGoldenPriceListTable,
  getGoldenPriceListUploads,
  ensureCompanyPriceListForCompany,
} from "./pricing.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { importGoldenComponentsFromFile } from "@repo/database";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";
import { getImportQueue } from "../../infra/queue/import-queue";
import { GcsService } from "../../infra/storage/gcs.service";

@Controller("pricing")
export class PricingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
  ) {}

  // SUPER_ADMINs can always upload. Within a company, OWNER/ADMIN can upload.
  // Additionally, MEMBER profiles with sufficient hierarchy (e.g. EXECUTIVE/FINANCE)
  // may be allowed in the future via profileCode.
  // Legacy/local CSV upload endpoint for Golden PETL. In cloud environments
  // we prefer the URI-based flow (see price-list/import-from-uri), but this
  // remains for localhost/dev where API and worker share a filesystem.
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

      // Golden Price List is system-wide: only SUPER_ADMINs can upload from
      // the Nexus System context. Tenant admins must use the company
      // cost book (COMPANY_PRICE_LIST) endpoint instead.
      if (user.globalRole !== GlobalRole.SUPER_ADMIN) {
        throw new BadRequestException(
          "Only Nexus System administrators can upload the Golden price list.",
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

      // Additionally, upload the Golden PETL CSV to object storage so the
      // worker can reliably access it even when API and worker do not share a
      // filesystem (e.g. separate Cloud Run services).
      let fileUri: string | null = null;
      try {
        const safeName = (filePart.filename || fileName).replace(/[^a-zA-Z0-9_.-]/g, "_");
        const keyParts = [
          "golden-petl",
          companyId ?? "system",
          `${Date.now()}`,
          safeName,
        ].filter(Boolean);
        const key = keyParts.join("/");

        fileUri = await this.gcs.uploadBuffer({
          key,
          buffer: fileBuffer,
          contentType: filePart.mimetype || "text/csv",
        });

        // eslint-disable-next-line no-console
        console.log("[pricing] uploadPriceList: uploaded CSV to GCS", {
          companyId,
          key,
          fileUri,
        });
      } catch (err) {
        // If storage upload fails (e.g. bucket not configured in dev), we
        // continue with filesystem-only csvPath so local workflows keep
        // working. In cloud, GCS must be configured for reliable Golden PETL.
        // eslint-disable-next-line no-console
        console.error("[pricing] uploadPriceList: GCS upload failed", err);
      }

      if (!companyId || !createdByUserId) {
        throw new BadRequestException("Missing company context for price list import");
      }

      // Create an async ImportJob that the background worker will process,
      // rather than importing the PETL synchronously in this request.
      const job = await this.prisma.importJob.create({
        data: {
          companyId,
          projectId: null,
          createdByUserId,
          type: "PRICE_LIST",
          status: "QUEUED",
          progress: 0,
          message: "Queued Golden PETL (Price List) import",
          csvPath: destPath,
          // If we successfully uploaded to GCS, also record the URI so the
          // worker can download the CSV even when csvPath is not visible in
          // its container.
          fileUri: fileUri,
        },
      });

      // Enqueue the job on the shared import queue so the worker can process it
      // in the background. The worker will call importPriceListFromFile and
      // record the GoldenPriceUpdateLog entry.
      const queue = getImportQueue();
      await queue.add(
        "process",
        { importJobId: job.id },
        {
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );

      return { jobId: job.id };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing] uploadPriceList: error", err);
      throw err;
    }
  }

  // URI-based Golden PETL import entrypoint. The client first uploads the CSV
  // to object storage (e.g. via /uploads), then calls this endpoint with the
  // resulting gs:// URI. We create a PRICE_LIST ImportJob that the worker will
  // materialize to a local tmp file and process.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/import-from-uri")
  async uploadPriceListFromUri(@Req() req: FastifyRequest) {
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

    // Golden Price List is system-wide: only SUPER_ADMINs can upload from
    // the Nexus System context. Tenant admins must use the company
    // cost book (COMPANY_PRICE_LIST) endpoint instead.
    if (user.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new BadRequestException(
        "Only Nexus System administrators can upload the Golden price list.",
      );
    }

    const anyFastReq: any = req as any;
    const body: any = anyFastReq.body || {};
    const rawFileUri: unknown = body.fileUri;
    const fileUri =
      typeof rawFileUri === "string" && rawFileUri.trim().length > 0
        ? rawFileUri.trim()
        : null;

    if (!fileUri) {
      throw new BadRequestException("fileUri is required");
    }

    const companyId = user.companyId;
    const createdByUserId = user.userId;

    if (!companyId || !createdByUserId) {
      throw new BadRequestException("Missing company context for price list import");
    }

    const job = await this.prisma.importJob.create({
      data: {
        companyId,
        projectId: null,
        createdByUserId,
        type: "PRICE_LIST",
        status: "QUEUED",
        progress: 0,
        message: "Queued Golden PETL (Price List) import from URI",
        csvPath: null,
        fileUri,
      },
    });

    const queue = getImportQueue();
    await queue.add(
      "process",
      { importJobId: job.id },
      {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    return { jobId: job.id };
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

  // Seed or fetch a tenant CompanyPriceList from the current Golden Price List.
  // This is used when an organization first needs a Cost Book.
  @UseGuards(JwtAuthGuard)
  @Post("company-price-list/seed-from-golden")
  async seedCompanyPriceList(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for cost book seeding");
    }

    const level = getEffectiveRoleLevel({
      globalRole: user.globalRole ?? null,
      role: user.role ?? null,
      profileCode: user.profileCode ?? null,
    });

    // Tenant cost book is tenant-managed (BETA intent):
    // - OWNER/ADMIN can manage.
    // - FINANCE/EXECUTIVE work-function profiles can manage.
    // - SUPER_ADMIN can manage.
    const canManageCostBook =
      user.globalRole === GlobalRole.SUPER_ADMIN ||
      user.role === Role.OWNER ||
      user.role === Role.ADMIN ||
      user.profileCode === "FINANCE" ||
      user.profileCode === "EXECUTIVE" ||
      // Fallback for legacy callers that don't have profileCode populated yet.
      level >= 80;

    if (!canManageCostBook) {
      throw new BadRequestException(
        "You do not have permission to create or reseed the company cost book.",
      );
    }

    const costBook = await ensureCompanyPriceListForCompany(user.companyId);

    return {
      companyPriceListId: costBook.id,
      basePriceListId: costBook.basePriceListId,
      label: costBook.label,
      revision: costBook.revision,
      effectiveDate: costBook.effectiveDate,
      currency: costBook.currency,
      isActive: costBook.isActive,
      createdAt: costBook.createdAt,
    };
  }

  // Tenant-level CSV import endpoint that updates a company's Cost Book
  // (CompanyPriceList) without touching the system-wide Golden.
  @UseGuards(JwtAuthGuard)
  @Post("company-price-list/import")
  async uploadCompanyPriceList(@Req() req: FastifyRequest) {
    try {
      const anyReq: any = req as any;
      const user = anyReq.user as AuthenticatedUser | undefined;

      if (!user?.companyId) {
        throw new BadRequestException("Missing company context for cost book import");
      }

      const level = getEffectiveRoleLevel({
        globalRole: user.globalRole ?? null,
        role: user.role ?? null,
        profileCode: user.profileCode ?? null,
      });

      const canManageCostBook =
        user.globalRole === GlobalRole.SUPER_ADMIN ||
        user.role === Role.OWNER ||
        user.role === Role.ADMIN ||
        user.profileCode === "FINANCE" ||
        user.profileCode === "EXECUTIVE" ||
        // Fallback for legacy callers that don't have profileCode populated yet.
        level >= 80;

      if (!canManageCostBook) {
        throw new BadRequestException(
          "You do not have permission to upload a tenant cost book.",
        );
      }

      const { file: filePart } = await readSingleFileFromMultipart(req, {
        fieldName: "file",
      });

      if (!filePart.mimetype.includes("csv")) {
        throw new BadRequestException("Only CSV uploads are supported for cost books");
      }

      const uploadsRoot = path.resolve(process.cwd(), "uploads/pricing");
      if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
      }

      const fileBuffer = await filePart.toBuffer();
      const ext = path.extname(filePart.filename || "") || ".csv";
      const fileName = `company-pricelist-${user.companyId}-${Date.now()}${ext}`;
      const destPath = path.join(uploadsRoot, fileName);

      fs.writeFileSync(destPath, fileBuffer);

      const companyId = user.companyId;
      const createdByUserId = user.userId;

      if (!companyId || !createdByUserId) {
        throw new BadRequestException("Missing company context for cost book import");
      }

      const job = await this.prisma.importJob.create({
        data: {
          companyId,
          projectId: null,
          createdByUserId,
          type: "COMPANY_PRICE_LIST",
          status: "QUEUED",
          progress: 0,
          message: "Queued tenant cost book import",
          csvPath: destPath,
        },
      });

      const queue = getImportQueue();
      await queue.add(
        "process",
        { importJobId: job.id },
        {
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );

      return { jobId: job.id };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pricing] uploadCompanyPriceList: error", err);
      throw err;
    }
  }

  // List distinct CAT codes from the tenant cost book.
  @UseGuards(JwtAuthGuard)
  @Get("company-price-list/cats")
  async listCompanyPriceListCats(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for cost book cats");
    }

    // Ensure a cost book exists (seed from Golden on-demand).
    let costBook;
    try {
      costBook = await ensureCompanyPriceListForCompany(user.companyId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[pricing] company-price-list/cats: ensureCompanyPriceListForCompany failed", {
        companyId: user.companyId,
        message: err?.message ?? String(err),
      });
      throw new BadRequestException(err?.message ?? "Failed to initialize company cost book");
    }

    const rows = await this.prisma.companyPriceListItem.findMany({
      where: {
        companyPriceListId: costBook.id,
        cat: { not: null },
      },
      distinct: ["cat"],
      select: { cat: true },
      orderBy: { cat: "asc" },
    });

    const cats = rows
      .map((r) => String(r.cat ?? "").trim())
      .filter(Boolean);

    return { companyPriceListId: costBook.id, cats };
  }

  // List distinct Activity values from the tenant cost book.
  @UseGuards(JwtAuthGuard)
  @Get("company-price-list/activities")
  async listCompanyPriceListActivities(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for cost book activities");
    }

    // Ensure a cost book exists (seed from Golden on-demand).
    let costBook;
    try {
      costBook = await ensureCompanyPriceListForCompany(user.companyId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[pricing] company-price-list/activities: ensureCompanyPriceListForCompany failed", {
        companyId: user.companyId,
        message: err?.message ?? String(err),
      });
      throw new BadRequestException(err?.message ?? "Failed to initialize company cost book");
    }

    const rows = await this.prisma.companyPriceListItem.findMany({
      where: {
        companyPriceListId: costBook.id,
        activity: { not: null },
      },
      distinct: ["activity"],
      select: { activity: true },
      orderBy: { activity: "asc" },
      take: 500,
    });

    const activities = rows
      .map((r) => String(r.activity ?? "").trim())
      .filter(Boolean);

    return { companyPriceListId: costBook.id, activities };
  }

  // Search tenant cost book (CompanyPriceListItem) by cat/sel/activity/description.
  @UseGuards(JwtAuthGuard)
  @Post("company-price-list/search")
  async searchCompanyPriceList(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for cost book search");
    }

    const anyBody: any = (anyReq.body ?? {}) as any;
    const q = typeof anyBody.query === "string" ? anyBody.query.trim() : "";

    // Back-compat: allow old `{ cat: "03" }` payloads.
    const cat = typeof anyBody.cat === "string" ? anyBody.cat.trim() : "";

    const catsRaw = anyBody.cats;
    const cats = Array.isArray(catsRaw)
      ? catsRaw
          .map((v: any) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean)
      : [];

    const sel = typeof anyBody.sel === "string" ? anyBody.sel.trim() : "";
    const activity = typeof anyBody.activity === "string" ? anyBody.activity.trim() : "";
    const limitRaw = anyBody.limit;

    // Browsing specific CAT(s) in the UI often needs more than 200 rows so the user
    // can scroll above/below the highlighted match. Keep the unfiltered cap low.
    const hasCatFilter = cats.length > 0 || !!cat;
    const maxLimit = hasCatFilter ? 2000 : 200;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(maxLimit, Math.floor(limitRaw)))
        : 50;

    // Ensure a cost book exists (seed from Golden on-demand).
    let costBook;
    try {
      costBook = await ensureCompanyPriceListForCompany(user.companyId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[pricing] company-price-list/search: ensureCompanyPriceListForCompany failed", {
        companyId: user.companyId,
        message: err?.message ?? String(err),
      });
      throw new BadRequestException(err?.message ?? "Failed to initialize company cost book");
    }

    const where: any = {
      companyPriceListId: costBook.id,
    };

    const and: any[] = [];

    const catsToUse = cats.length > 0 ? cats : cat ? [cat] : [];
    if (catsToUse.length > 0) {
      and.push({
        OR: catsToUse.map((c) => ({ cat: { equals: c, mode: "insensitive" } })),
      });
    }

    if (sel) {
      and.push({ sel: { equals: sel, mode: "insensitive" } });
    }

    if (activity) {
      and.push({ activity: { equals: activity, mode: "insensitive" } });
    }

    if (q) {
      and.push({
        OR: [
          { description: { contains: q, mode: "insensitive" } },
          { cat: { contains: q, mode: "insensitive" } },
          { sel: { contains: q, mode: "insensitive" } },
          { activity: { contains: q, mode: "insensitive" } },
          { groupCode: { contains: q, mode: "insensitive" } },
          { groupDescription: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const items = await this.prisma.companyPriceListItem.findMany({
      where,
      orderBy: [
        { cat: "asc" },
        { sel: "asc" },
        { description: "asc" },
      ],
      take: limit,
      include: {
        division: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return {
      companyPriceListId: costBook.id,
      query: q || null,
      filters: {
        cat: cat || null,
        cats: cats.length > 0 ? cats : null,
        sel: sel || null,
        activity: activity || null,
      },
      items,
    };
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

    // Additionally, upload the Golden components CSV to object storage so the
    // worker can access it even when API and worker do not share a filesystem
    // (e.g. separate Cloud Run services).
    let fileUri: string | null = null;
    try {
      const safeName = (filePart.filename || fileName).replace(/[^a-zA-Z0-9_.-]/g, "_");
      const keyParts = [
        "golden-components",
        companyId ?? "system",
        `${Date.now()}`,
        safeName,
      ].filter(Boolean);
      const key = keyParts.join("/");

      fileUri = await this.gcs.uploadBuffer({
        key,
        buffer: fileBuffer,
        contentType: filePart.mimetype || "text/csv",
      });

      // eslint-disable-next-line no-console
      console.log("[pricing] uploadPriceListComponents: uploaded CSV to GCS", {
        companyId,
        key,
        fileUri,
      });
    } catch (err) {
      // If storage upload fails (e.g. bucket not configured in dev), we
      // continue with filesystem-only csvPath so local workflows keep
      // working. In cloud, GCS must be configured for reliable Golden
      // components imports.
      // eslint-disable-next-line no-console
      console.error("[pricing] uploadPriceListComponents: GCS upload failed", err);
    }

    // Create an async ImportJob that the background worker will process,
    // following the same PETL pattern as price-list/import.
    const job = await this.prisma.importJob.create({
      data: {
        companyId,
        projectId: null,
        createdByUserId,
        type: "PRICE_LIST_COMPONENTS",
        status: "QUEUED",
        progress: 0,
        message: "Queued Golden components import",
        csvPath: destPath,
        fileUri,
      },
    });

    const queue = getImportQueue();
    await queue.add(
      "process",
      { importJobId: job.id },
      {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    return { jobId: job.id };
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

  // Lightweight coverage summary for Golden components so the Financial page
  // can render the coverage card without loading the full components payload.
  @UseGuards(JwtAuthGuard)
  @Post("price-list/components/summary")
  async goldenComponentsSummary(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for Golden components");
    }

    const priceList = await this.prisma.priceList.findFirst({
      where: { kind: "GOLDEN", isActive: true },
      orderBy: { revision: "desc" },
    });

    if (!priceList) {
      return {
        priceList: null,
        coverage: {
          itemsWithComponents: 0,
          totalComponents: 0,
        },
        lastComponentsUpload: null,
      };
    }

    const [itemCount, itemsWithComponents, totalComponents] = await Promise.all([
      this.prisma.priceListItem.count({ where: { priceListId: priceList.id } }),
      this.prisma.priceListItem.count({
        where: {
          priceListId: priceList.id,
          components: { some: {} },
        },
      }),
      this.prisma.priceListComponent.count({
        where: {
          priceListItem: { priceListId: priceList.id },
        },
      }),
    ]);

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
        itemCount,
      },
      coverage: {
        itemsWithComponents,
        totalComponents,
      },
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
      const projectName = log.project?.name ?? log.projectId ?? "";
      const estimateLabel =
        (log.estimateVersion?.description || log.estimateVersion?.fileName || log.estimateVersionId) ??
        null;
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
        source: log.source,
      };
    });
  }
}
