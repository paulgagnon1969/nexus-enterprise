import { apiJson } from "./client";
import type { ProjectListItem } from "../types/api";

export interface CreateProjectRequest {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  addressLine2?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  primaryContactName?: string;
  primaryContactPhone?: string;
  primaryContactEmail?: string;
}

/**
 * Create a new project. The creator automatically becomes the project OWNER
 * and a PM review task is created if the creator is not a company OWNER/ADMIN.
 */
export async function createProject(data: CreateProjectRequest): Promise<ProjectListItem> {
  return apiJson<ProjectListItem>("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface ProjectParticipant {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

/**
 * Add a member to a project. Requires company OWNER/ADMIN or project OWNER.
 */
export async function addProjectMember(
  projectId: string,
  userId: string,
  role: string,
): Promise<void> {
  await apiJson(`/projects/${encodeURIComponent(projectId)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
}

/**
 * Fetch participants for a project.
 */
export async function fetchProjectParticipants(
  projectId: string,
): Promise<ProjectParticipant[]> {
  return apiJson<ProjectParticipant[]>(
    `/projects/${encodeURIComponent(projectId)}/participants`,
  );
}
