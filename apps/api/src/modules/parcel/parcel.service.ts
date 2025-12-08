import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ParcelStatus, Role } from "@prisma/client";

@Injectable()
export class ParcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async listParcels(actor: AuthenticatedUser, projectId?: string, status?: ParcelStatus) {
    const baseWhere: any = {
      companyId: actor.companyId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {})
    };

    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return this.prisma.parcel.findMany({ where: baseWhere });
    }

    // Members: see parcels for projects they are a member of
    return this.prisma.parcel.findMany({
      where: {
        ...baseWhere,
        project: {
          memberships: {
            some: {
              userId: actor.userId
            }
          }
        }
      }
    });
  }

  async createParcel(
    actor: AuthenticatedUser,
    dto: {
      projectId: string;
      name: string;
      parcelCode?: string;
      areaSqFt?: number;
      zoning?: string;
    }
  ) {
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only company OWNER or ADMIN can create parcels");
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: dto.projectId,
        companyId: actor.companyId
      }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    const parcel = await this.prisma.parcel.create({
      data: {
        name: dto.name,
        parcelCode: dto.parcelCode,
        areaSqFt: dto.areaSqFt,
        zoning: dto.zoning,
        status: ParcelStatus.PLANNED,
        companyId: actor.companyId,
        projectId: dto.projectId
      }
    });

    await this.audit.log(actor, "PARCEL_CREATED", {
      companyId: actor.companyId,
      projectId: dto.projectId,
      metadata: { parcelId: parcel.id, name: parcel.name }
    });

    return parcel;
  }

  async updateParcel(
    actor: AuthenticatedUser,
    id: string,
    dto: {
      name?: string;
      parcelCode?: string;
      status?: ParcelStatus;
      areaSqFt?: number;
      zoning?: string;
    }
  ) {
    const parcel = await this.prisma.parcel.findFirst({
      where: {
        id,
        companyId: actor.companyId
      }
    });

    if (!parcel) {
      throw new NotFoundException("Parcel not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only company OWNER or ADMIN can update parcels");
    }

    const updated = await this.prisma.parcel.update({
      where: { id },
      data: {
        ...dto
      }
    });

    await this.audit.log(actor, "PARCEL_UPDATED", {
      companyId: actor.companyId,
      projectId: updated.projectId,
      metadata: { parcelId: updated.id }
    });

    return updated;
  }
}
