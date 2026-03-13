import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class CndaTemplatesService {
  private readonly logger = new Logger(CndaTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List all active CNDA templates. */
  async list() {
    return this.prisma.cndaTemplate.findMany({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        htmlContent: true,
        isDefault: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Get a single template by ID. */
  async getById(id: string) {
    return this.prisma.cndaTemplate.findUnique({ where: { id } });
  }

  /** Create a new CNDA template. */
  async create(userId: string, data: { name: string; htmlContent: string; isDefault?: boolean }) {
    // If this is being set as default, unset any existing default
    if (data.isDefault) {
      await this.prisma.cndaTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.cndaTemplate.create({
      data: {
        name: data.name,
        htmlContent: data.htmlContent,
        isDefault: data.isDefault ?? false,
        createdById: userId,
      },
    });
  }

  /** Update an existing CNDA template. */
  async update(id: string, data: { name?: string; htmlContent?: string; isDefault?: boolean; active?: boolean }) {
    // If setting as default, unset existing defaults
    if (data.isDefault) {
      await this.prisma.cndaTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.cndaTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.htmlContent !== undefined && { htmlContent: data.htmlContent }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  /** Seed the default CNDA+ template if none exists. */
  async seedDefaultIfNeeded(systemUserId: string) {
    const existing = await this.prisma.cndaTemplate.findFirst({
      where: { isDefault: true },
    });
    if (existing) return existing;

    this.logger.log("Seeding default Standard CNDA+ template");
    return this.create(systemUserId, {
      name: "Standard CNDA+",
      htmlContent: DEFAULT_CNDA_HTML,
      isDefault: true,
    });
  }
}

/** The standard CNDA+ agreement text (migrated from the frontend hardcoded constant). */
const DEFAULT_CNDA_HTML = `
<h2 style="margin-top:0">Confidentiality and Non-Disclosure Agreement Plus (CNDA+)</h2>
<p><strong>Between:</strong> Nexus Group LLC ("Disclosing Party") and the undersigned Recipient.</p>

<h3>Key Provisions</h3>
<ul>
  <li><strong>Confidentiality (Art. 1–3):</strong> All information disclosed is presumed confidential. Recipient must protect it with at least the same standard of care as their own most sensitive information.</li>
  <li><strong>Non-Use (Art. 3.2):</strong> Information may only be used for evaluating a potential business relationship with Nexus. No competitive use, product development, or solicitation.</li>
  <li><strong>No Reverse Engineering (Art. 4):</strong> Absolute prohibition on reverse engineering, decompiling, deconstructing, or recreating any Nexus technology, architecture, or module design.</li>
  <li><strong>IP Ownership (Art. 5):</strong> All intellectual property remains the sole property of Nexus. No license is granted by this disclosure.</li>
  <li><strong>Document Protection (Art. 6):</strong> Recipients must not circumvent watermarks, serial numbers, copy prevention, or other technical protections. All access is logged with forensic serial numbers.</li>
  <li><strong>Non-Solicitation (Art. 7):</strong> Recipient shall not solicit or recruit Nexus employees or contractors for 24 months.</li>
  <li><strong>Remedies (Art. 9):</strong> Nexus may seek injunctive relief without bond. Breach may result in liquidated damages of $250,000 per incident plus actual damages.</li>
  <li><strong>Duration (Art. 10):</strong> Obligations survive for 5 years from disclosure; trade secrets are protected indefinitely.</li>
  <li><strong>Governing Law:</strong> State of Texas, venue in Comal County.</li>
</ul>

<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px">
  <strong>⚠ Important:</strong> By accepting below, you agree to be bound by the full CNDA+ agreement.
  Your acceptance is recorded with your IP address, timestamp, and browser information as
  evidence of electronic consent per Article 13.
</p>
`.trim();
