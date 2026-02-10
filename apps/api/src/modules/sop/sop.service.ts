"use strict";

import { Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

export interface SopFrontmatter {
  title: string;
  module: string;
  revision: string;
  tags: string[];
  status: string;
  created: string;
  updated: string;
  author: string;
  featureId?: string;
}

export interface SopDocument {
  filename: string;
  frontmatter: SopFrontmatter;
  content: string;
}

@Injectable()
export class SopService {
  private readonly sopDir: string;

  constructor() {
    // SOPs are stored in docs/sops-staging relative to the monorepo root.
    // In production, this path may need to be configured via environment variable.
    this.sopDir = process.env.SOP_DIR || path.resolve(__dirname, "../../../../../../docs/sops-staging");
  }

  /**
   * Parse YAML frontmatter from markdown content.
   * Returns the frontmatter object and the remaining content.
   */
  private parseFrontmatter(raw: string): { frontmatter: Partial<SopFrontmatter>; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = raw.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, content: raw };
    }

    const yamlBlock = match[1];
    const content = match[2];

    // Simple YAML parsing for our known frontmatter fields
    const frontmatter: Partial<SopFrontmatter> = {};

    for (const line of yamlBlock.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle array values like [sop, onboarding, auth]
      if (value.startsWith("[") && value.endsWith("]")) {
        const arrayContent = value.slice(1, -1);
        (frontmatter as any)[key] = arrayContent.split(",").map(s => s.trim());
      } else {
        (frontmatter as any)[key] = value;
      }
    }

    return { frontmatter, content };
  }

  /**
   * List all SOP documents in the staging directory.
   */
  async listSops(): Promise<SopDocument[]> {
    const files = fs.readdirSync(this.sopDir).filter(f => f.endsWith(".md") && f !== "README.md");
    const sops: SopDocument[] = [];

    for (const file of files) {
      const filePath = path.join(this.sopDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { frontmatter, content } = this.parseFrontmatter(raw);

      sops.push({
        filename: file,
        frontmatter: frontmatter as SopFrontmatter,
        content,
      });
    }

    return sops;
  }

  /**
   * Find an SOP by its featureId.
   */
  async findByFeatureId(featureId: string): Promise<SopDocument> {
    const sops = await this.listSops();
    const sop = sops.find(s => s.frontmatter.featureId === featureId);

    if (!sop) {
      throw new NotFoundException(`No SOP found for feature: ${featureId}`);
    }

    return sop;
  }

  /**
   * Find an SOP by filename (without extension).
   */
  async findBySlug(slug: string): Promise<SopDocument> {
    const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
    const filePath = path.join(this.sopDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`SOP not found: ${slug}`);
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, content } = this.parseFrontmatter(raw);

    return {
      filename,
      frontmatter: frontmatter as SopFrontmatter,
      content,
    };
  }
}
