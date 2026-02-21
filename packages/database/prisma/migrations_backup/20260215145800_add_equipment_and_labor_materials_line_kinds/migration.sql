-- Add new values to ProjectBillLineItemKind enum
ALTER TYPE "ProjectBillLineItemKind" ADD VALUE IF NOT EXISTS 'EQUIPMENT';
ALTER TYPE "ProjectBillLineItemKind" ADD VALUE IF NOT EXISTS 'LABOR_AND_MATERIALS';
