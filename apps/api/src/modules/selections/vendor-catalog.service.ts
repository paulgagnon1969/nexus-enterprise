import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class VendorCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** List all catalogs visible to the tenant (system + tenant-owned). */
  async listCatalogs(companyId: string) {
    return this.prisma.vendorCatalog.findMany({
      where: {
        isActive: true,
        OR: [
          { companyId: null }, // system-level catalogs
          { companyId },       // tenant-owned catalogs
        ],
      },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { vendorName: 'asc' },
    });
  }

  /** List products in a catalog, optionally filtered by category and search. */
  async listProducts(
    catalogId: string,
    filters?: { category?: string; search?: string },
  ) {
    const where: any = { catalogId, isActive: true };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.vendorProduct.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Get a single product by ID. */
  async getProduct(productId: string) {
    const product = await this.prisma.vendorProduct.findUnique({
      where: { id: productId },
      include: { catalog: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
