import { apiJson } from "./client";
import type {
  PlanSetListItem,
  PlanSetDetail,
  SheetImageResponse,
  ImageTier,
} from "../types/api";

/** List all plan sets (drawing uploads) for a project */
export async function listPlanSets(
  projectId: string,
): Promise<PlanSetListItem[]> {
  return apiJson<PlanSetListItem[]>(
    `/projects/${encodeURIComponent(projectId)}/plan-sheets`,
  );
}

/** Get a single plan set with all sheet records */
export async function getPlanSet(
  projectId: string,
  uploadId: string,
): Promise<PlanSetDetail> {
  return apiJson<PlanSetDetail>(
    `/projects/${encodeURIComponent(projectId)}/plan-sheets/${encodeURIComponent(uploadId)}`,
  );
}

/** Get a signed image URL for a specific sheet at a given tier */
export async function getSheetImageUrl(
  projectId: string,
  uploadId: string,
  sheetId: string,
  tier: ImageTier = "standard",
): Promise<SheetImageResponse> {
  return apiJson<SheetImageResponse>(
    `/projects/${encodeURIComponent(projectId)}/plan-sheets/${encodeURIComponent(uploadId)}/sheets/${encodeURIComponent(sheetId)}/image?tier=${tier}`,
  );
}
