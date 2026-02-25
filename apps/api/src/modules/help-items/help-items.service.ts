import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface CreateHelpItemDto {
  helpKey: string;
  title: string;
  brief: string;
  sopId?: string;
  sopSection?: string;
  videoUrl?: string;
  isActive?: boolean;
}

export interface UpdateHelpItemDto {
  helpKey?: string;
  title?: string;
  brief?: string;
  sopId?: string | null;
  sopSection?: string | null;
  videoUrl?: string | null;
  isActive?: boolean;
}

@Injectable()
export class HelpItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all help items (for admin UI)
   */
  async findAll() {
    return this.prisma.helpItem.findMany({
      orderBy: { helpKey: "asc" },
    });
  }

  /**
   * Fetch help items by keys (for overlay - only active items)
   */
  async findByKeys(keys: string[]) {
    if (!keys || keys.length === 0) return [];
    
    return this.prisma.helpItem.findMany({
      where: {
        helpKey: { in: keys },
        isActive: true,
      },
    });
  }

  /**
   * Get a single help item by ID
   */
  async findById(id: string) {
    const item = await this.prisma.helpItem.findUnique({
      where: { id },
    });
    if (!item) {
      throw new NotFoundException(`HelpItem ${id} not found`);
    }
    return item;
  }

  /**
   * Create a new help item
   */
  async create(dto: CreateHelpItemDto) {
    return this.prisma.helpItem.create({
      data: {
        helpKey: dto.helpKey,
        title: dto.title,
        brief: dto.brief,
        sopId: dto.sopId,
        sopSection: dto.sopSection,
        videoUrl: dto.videoUrl,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Update an existing help item
   */
  async update(id: string, dto: UpdateHelpItemDto) {
    // Ensure it exists
    await this.findById(id);
    
    return this.prisma.helpItem.update({
      where: { id },
      data: {
        ...(dto.helpKey !== undefined && { helpKey: dto.helpKey }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.brief !== undefined && { brief: dto.brief }),
        ...(dto.sopId !== undefined && { sopId: dto.sopId }),
        ...(dto.sopSection !== undefined && { sopSection: dto.sopSection }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Delete a help item
   */
  async delete(id: string) {
    // Ensure it exists
    await this.findById(id);
    
    return this.prisma.helpItem.delete({
      where: { id },
    });
  }
}
