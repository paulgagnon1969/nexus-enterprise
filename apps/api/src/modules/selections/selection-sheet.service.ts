import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import type { GenerateSheetDto } from './dto';

@Injectable()
export class SelectionSheetService {
  private readonly logger = new Logger(SelectionSheetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForProject(projectId: string, companyId: string) {
    return this.prisma.selectionSheet.findMany({
      where: { projectId, companyId },
      select: {
        id: true,
        roomId: true,
        version: true,
        documentId: true,
        generatedAt: true,
        room: { select: { id: true, name: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async getById(sheetId: string, companyId: string) {
    const sheet = await this.prisma.selectionSheet.findFirst({
      where: { id: sheetId, companyId },
    });
    if (!sheet) throw new NotFoundException('Selection sheet not found');
    return sheet;
  }

  async generate(
    companyId: string,
    projectId: string,
    roomId: string,
    actor: AuthenticatedUser,
    dto: GenerateSheetDto,
  ) {
    // Fetch room with all selections and their vendor products
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId, projectId },
      include: {
        selections: {
          include: { vendorProduct: { include: { catalog: true } } },
          orderBy: { position: 'asc' },
        },
        project: { select: { name: true, addressLine1: true, city: true, state: true } },
      },
    });
    if (!room) throw new NotFoundException('Planning room not found');

    // Calculate next version
    const lastSheet = await this.prisma.selectionSheet.findFirst({
      where: { roomId, companyId },
      orderBy: { version: 'desc' },
    });
    const version = (lastSheet?.version ?? 0) + 1;

    // Generate HTML eDoc
    const htmlContent = this.buildHtmlEDoc(room, dto.title);
    const csvContent = this.buildCsv(room);

    // Update pipeline status
    await this.prisma.planningRoom.update({
      where: { id: roomId },
      data: {
        pipelineStatus: {
          ...(room.pipelineStatus as any ?? {}),
          sheetGeneration: {
            status: 'complete',
            version,
            generatedAt: new Date().toISOString(),
          },
        },
      },
    });

    return this.prisma.selectionSheet.create({
      data: {
        companyId,
        projectId,
        roomId,
        version,
        htmlContent,
        csvContent,
        generatedById: actor.userId,
      },
    });
  }

  /** Build a self-contained HTML eDoc with product gallery and pricing. */
  private buildHtmlEDoc(room: any, titleOverride?: string): string {
    const title = titleOverride ?? `${room.name} — Selection Sheet`;
    const project = room.project;
    const selections = room.selections ?? [];

    const totalPrice = selections.reduce((sum: number, sel: any) => {
      const price = sel.vendorProduct?.price ?? 0;
      return sum + price * (sel.quantity ?? 1);
    }, 0);

    const productRows = selections
      .map((sel: any) => {
        const p = sel.vendorProduct;
        if (!p) return '';
        const dims = [p.width, p.height, p.depth]
          .filter(Boolean)
          .map((d: number) => `${d}"`)
          .join(' × ');
        const lineTotal = ((p.price ?? 0) * (sel.quantity ?? 1)).toFixed(2);
        return `
          <tr>
            <td>${sel.position}</td>
            <td>${p.name}</td>
            <td>${p.sku}</td>
            <td>${dims}</td>
            <td>${sel.quantity ?? 1}</td>
            <td>$${(p.price ?? 0).toFixed(2)}</td>
            <td>$${lineTotal}</td>
            <td>${sel.status}</td>
          </tr>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="ncc:type" content="selection-sheet">
  <meta name="ncc:room" content="${room.name}">
  <meta name="ncc:version" content="${room.selectionSheets?.length ?? 1}">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #1e293b; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; }
    .total { font-size: 1.125rem; font-weight: 700; text-align: right; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    ${project?.name ?? ''} · ${project?.addressLine1 ?? ''}, ${project?.city ?? ''} ${project?.state ?? ''}<br>
    Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>Product</th><th>SKU</th><th>Dimensions</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Status</th></tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>
  <div class="total">Total: $${totalPrice.toFixed(2)}</div>
</body>
</html>`;
  }

  /** Build a vendor-formatted CSV quote sheet. */
  private buildCsv(room: any): string {
    const selections = room.selections ?? [];
    const header = 'Position,SKU,Product,Category,Width,Height,Depth,Qty,Unit Price,Total,Status';
    const rows = selections.map((sel: any) => {
      const p = sel.vendorProduct;
      if (!p) return '';
      const total = ((p.price ?? 0) * (sel.quantity ?? 1)).toFixed(2);
      return [
        sel.position,
        `"${p.sku}"`,
        `"${p.name}"`,
        p.category,
        p.width ?? '',
        p.height ?? '',
        p.depth ?? '',
        sel.quantity ?? 1,
        (p.price ?? 0).toFixed(2),
        total,
        sel.status,
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }
}
