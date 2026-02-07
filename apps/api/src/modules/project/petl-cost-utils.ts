/**
 * PETL Activity-Based Cost Calculation Utilities
 *
 * Used for splitting line item costs based on activity type when creating
 * standalone Change Orders (CO) or modifying reconciliation entries.
 */

import { PetlActivity } from "@prisma/client";

export interface CostComponents {
  workersWage: number | null;
  laborBurden: number | null;
  laborOverhead: number | null;
  material: number | null;
  equipment: number | null;
}

export interface CalculatedCosts {
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  totalCost: number;
}

/**
 * Calculate cost breakdown based on activity type.
 *
 * Activity cost rules (matching Xactimate symbols):
 * - REMOVE_AND_REPLACE (&): full labor + material + equipment
 * - REMOVE (-): labor only (wage + burden + overhead)
 * - REPLACE (+): labor + equipment (no material)
 * - DETACH_AND_RESET (R): labor only (same as REMOVE)
 * - MATERIALS (M): material cost only
 * - REPAIR (F): labor + material (no equipment)
 * - INSTALL_ONLY (I): labor + equipment (same as REPLACE)
 *
 * All calculated values can be overridden by the user in the UI.
 */
export function calculateCostByActivity(
  source: CostComponents,
  activity: PetlActivity,
): CalculatedCosts {
  const laborTotal =
    (source.workersWage ?? 0) +
    (source.laborBurden ?? 0) +
    (source.laborOverhead ?? 0);

  const material = source.material ?? 0;
  const equipment = source.equipment ?? 0;

  switch (activity) {
    case PetlActivity.REMOVE_AND_REPLACE:
      return {
        laborCost: laborTotal,
        materialCost: material,
        equipmentCost: equipment,
        totalCost: laborTotal + material + equipment,
      };

    case PetlActivity.REMOVE:
      return {
        laborCost: laborTotal,
        materialCost: 0,
        equipmentCost: 0,
        totalCost: laborTotal,
      };

    case PetlActivity.REPLACE:
      return {
        laborCost: laborTotal,
        materialCost: 0,
        equipmentCost: equipment,
        totalCost: laborTotal + equipment,
      };

    case PetlActivity.DETACH_AND_RESET:
      // DnR is labor only - same logic as REMOVE
      // For more accurate DnR pricing, look up comparable CAT in cost book
      // and strip material (handled at call site if needed)
      return {
        laborCost: laborTotal,
        materialCost: 0,
        equipmentCost: 0,
        totalCost: laborTotal,
      };

    case PetlActivity.MATERIALS:
      return {
        laborCost: 0,
        materialCost: material,
        equipmentCost: 0,
        totalCost: material,
      };

    case PetlActivity.REPAIR:
      // Repair is labor + material (typically reduced labor rate)
      return {
        laborCost: laborTotal,
        materialCost: material,
        equipmentCost: 0,
        totalCost: laborTotal + material,
      };

    case PetlActivity.INSTALL_ONLY:
      // Install only is labor + equipment (same as REPLACE)
      return {
        laborCost: laborTotal,
        materialCost: 0,
        equipmentCost: equipment,
        totalCost: laborTotal + equipment,
      };

    default:
      // Fallback: return full R&R costs
      return {
        laborCost: laborTotal,
        materialCost: material,
        equipmentCost: equipment,
        totalCost: laborTotal + material + equipment,
      };
  }
}

/**
 * Extract cost components from a RawXactRow or similar source.
 */
export function extractCostComponents(row: {
  workersWage?: number | null;
  laborBurden?: number | null;
  laborOverhead?: number | null;
  material?: number | null;
  equipment?: number | null;
}): CostComponents {
  return {
    workersWage: row.workersWage ?? null,
    laborBurden: row.laborBurden ?? null,
    laborOverhead: row.laborOverhead ?? null,
    material: row.material ?? null,
    equipment: row.equipment ?? null,
  };
}

/**
 * Calculate the next CO sequence number for a given parent line item.
 * Returns 1 if no existing COs, otherwise max + 1.
 */
export function getNextCoSequenceNo(existingSequences: (number | null)[]): number {
  const validSequences = existingSequences.filter((n): n is number => n != null);
  if (validSequences.length === 0) return 1;
  return Math.max(...validSequences) + 1;
}

/**
 * Format a CO line number for display.
 * Example: sourceLineNo=15, coSeq=2 -> "15-CO2"
 */
export function formatCoLineNumber(
  sourceLineNo: number | null | undefined,
  coSequenceNo: number | null | undefined,
): string {
  if (sourceLineNo == null || coSequenceNo == null) {
    return "CO";
  }
  return `${sourceLineNo}-CO${coSequenceNo}`;
}
