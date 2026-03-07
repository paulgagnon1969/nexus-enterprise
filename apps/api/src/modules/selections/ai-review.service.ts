import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ReviewCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  details: string | null;
}

export interface ReviewResult {
  score: number;
  grade: string;
  checks: ReviewCheck[];
  reviewedAt: string;
}

@Injectable()
export class AiReviewService {
  private readonly logger = new Logger(AiReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all review checks against a planning room's selections.
   * Updates the room's aiReview JSON field.
   */
  async reviewRoom(roomId: string, companyId: string): Promise<ReviewResult> {
    const room = await this.prisma.planningRoom.findFirst({
      where: { id: roomId, companyId },
      include: {
        selections: {
          include: { vendorProduct: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!room) throw new Error('Room not found');

    const checks: ReviewCheck[] = [];

    // 1. Dimensional Fit
    checks.push(this.checkDimensionalFit(room));

    // 2. Completeness
    checks.push(this.checkCompleteness(room));

    // 3. Budget (requires project-level allowance — placeholder)
    checks.push(this.checkBudget(room));

    // 4. Clearance
    checks.push(this.checkClearance(room));

    // 5. Vendor Consistency
    checks.push(this.checkVendorConsistency(room));

    // Calculate score: pass=20pts, warn=10pts, fail=0pts per check
    const maxScore = checks.length * 20;
    const rawScore = checks.reduce((sum, c) => {
      if (c.status === 'pass') return sum + 20;
      if (c.status === 'warn') return sum + 10;
      return sum;
    }, 0);
    const score = Math.round((rawScore / maxScore) * 100);
    const grade = this.scoreToGrade(score);

    const result: ReviewResult = {
      score,
      grade,
      checks,
      reviewedAt: new Date().toISOString(),
    };

    // Persist to room
    await this.prisma.planningRoom.update({
      where: { id: roomId },
      data: {
        aiReview: result as any,
        pipelineStatus: {
          ...(room.pipelineStatus as any ?? {}),
          aiReview: { status: 'complete', score },
        },
      },
    });

    return result;
  }

  // ─── Individual Checks ─────────────────────────────────────────

  private checkDimensionalFit(room: any): ReviewCheck {
    const dims = room.extractedDimensions as any;
    if (!dims) {
      return { name: 'dimensional_fit', status: 'warn', details: 'No dimensions available — cannot validate fit' };
    }

    const selections = room.selections ?? [];
    for (const sel of selections) {
      const product = sel.vendorProduct;
      if (!product?.width) continue;
      // Basic check: product width shouldn't exceed room width
      const roomWidthInches = (dims.widthFt ?? 0) * 12;
      if (product.width > roomWidthInches) {
        return {
          name: 'dimensional_fit',
          status: 'fail',
          details: `Product "${product.name}" (${product.width}") exceeds room width (${roomWidthInches}")`,
        };
      }
    }
    return { name: 'dimensional_fit', status: 'pass', details: null };
  }

  private checkCompleteness(room: any): ReviewCheck {
    const selections = room.selections ?? [];
    if (selections.length === 0) {
      return { name: 'completeness', status: 'fail', details: 'No selections added to this room' };
    }

    // Check for gaps in position sequence
    const positions = selections.map((s: any) => s.position).sort((a: number, b: number) => a - b);
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i - 1] > 1) {
        return {
          name: 'completeness',
          status: 'warn',
          details: `Gap in positions: ${positions[i - 1]} → ${positions[i]}. Missing filler or cabinet?`,
        };
      }
    }

    // Check for selections without a vendor product
    const unassigned = selections.filter((s: any) => !s.vendorProductId);
    if (unassigned.length > 0) {
      return {
        name: 'completeness',
        status: 'warn',
        details: `${unassigned.length} position(s) have no product assigned`,
      };
    }

    return { name: 'completeness', status: 'pass', details: null };
  }

  private checkBudget(room: any): ReviewCheck {
    // Phase 4: integrate with project-level material allowance
    const selections = room.selections ?? [];
    const total = selections.reduce((sum: number, sel: any) => {
      return sum + ((sel.vendorProduct?.price ?? 0) * (sel.quantity ?? 1));
    }, 0);

    if (total === 0) {
      return { name: 'budget', status: 'warn', details: 'No pricing data available' };
    }

    return {
      name: 'budget',
      status: 'pass',
      details: `Total: $${total.toFixed(2)}`,
    };
  }

  private checkClearance(room: any): ReviewCheck {
    // Phase 4: validate clearances based on room type and layout
    // For now, pass unless we detect obvious issues
    return { name: 'clearance', status: 'pass', details: null };
  }

  private checkVendorConsistency(room: any): ReviewCheck {
    const selections = room.selections ?? [];
    const catalogIds = new Set<string>();
    for (const sel of selections) {
      if (sel.vendorProduct?.catalogId) {
        catalogIds.add(sel.vendorProduct.catalogId);
      }
    }

    if (catalogIds.size > 1) {
      return {
        name: 'vendor_consistency',
        status: 'warn',
        details: `Mixed vendor lines (${catalogIds.size} catalogs) — may complicate ordering`,
      };
    }

    return { name: 'vendor_consistency', status: 'pass', details: null };
  }

  private scoreToGrade(score: number): string {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
  }
}
