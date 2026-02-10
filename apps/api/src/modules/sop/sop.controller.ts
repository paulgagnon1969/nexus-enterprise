import { Controller, Get, Param } from "@nestjs/common";
import { SopService } from "./sop.service";

@Controller("sops")
export class SopController {
  constructor(private readonly sopService: SopService) {}

  /**
   * List all available SOPs (metadata only, no content).
   * Public endpoint - no auth required.
   */
  @Get()
  async listSops() {
    const sops = await this.sopService.listSops();
    return sops.map(s => ({
      filename: s.filename,
      title: s.frontmatter.title,
      module: s.frontmatter.module,
      revision: s.frontmatter.revision,
      tags: s.frontmatter.tags,
      status: s.frontmatter.status,
      featureId: s.frontmatter.featureId,
      updated: s.frontmatter.updated,
    }));
  }

  /**
   * Get a full SOP document by its featureId.
   * Public endpoint - no auth required.
   */
  @Get("by-feature/:featureId")
  async getByFeatureId(@Param("featureId") featureId: string) {
    const sop = await this.sopService.findByFeatureId(featureId);
    return {
      filename: sop.filename,
      frontmatter: sop.frontmatter,
      content: sop.content,
    };
  }

  /**
   * Get a full SOP document by its slug (filename without .md).
   * Public endpoint - no auth required.
   */
  @Get(":slug")
  async getBySlug(@Param("slug") slug: string) {
    const sop = await this.sopService.findBySlug(slug);
    return {
      filename: sop.filename,
      frontmatter: sop.frontmatter,
      content: sop.content,
    };
  }
}
