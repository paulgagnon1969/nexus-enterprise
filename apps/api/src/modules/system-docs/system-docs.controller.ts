import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

interface SystemDocModuleEntry {
  id: string;
  title: string;
  file: string;
}

function getModulesIndex(): SystemDocModuleEntry[] {
  const modulesDir = path.resolve(process.cwd(), "../../docs/system/modules");
  const indexPath = path.join(modulesDir, "index.json");

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const raw = fs.readFileSync(indexPath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as SystemDocModuleEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

function assertSystemAccess(user: AuthenticatedUser | undefined) {
  if (!user) {
    throw new Error("Missing user in request context");
  }
  if (user.globalRole !== GlobalRole.SUPER_ADMIN && user.globalRole !== GlobalRole.SUPPORT) {
    throw new Error("You do not have permission to access Nexus System docs.");
  }
}

@Controller("system-docs")
export class SystemDocsController {
  @UseGuards(JwtAuthGuard)
  @Get("modules")
  async listModules(@Req() req: FastifyRequest) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    assertSystemAccess(user);

    const modules = getModulesIndex();
    return modules;
  }

  @UseGuards(JwtAuthGuard)
  @Get("modules/:id")
  async getModule(@Req() req: FastifyRequest, @Param("id") id: string) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    assertSystemAccess(user);

    const modules = getModulesIndex();
    const entry = modules.find((m) => m.id === id);
    if (!entry) {
      return { id, title: id, content: "Module docs not found." };
    }

    const modulesDir = path.resolve(process.cwd(), "../../docs/system/modules");
    const docPath = path.join(modulesDir, entry.file);

    if (!fs.existsSync(docPath)) {
      return { id: entry.id, title: entry.title, content: "Module file not found." };
    }

    const content = fs.readFileSync(docPath, "utf8");
    return {
      id: entry.id,
      title: entry.title,
      content,
    };
  }
}
