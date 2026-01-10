import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NttStatus, NttSubjectType, TaskStatus } from "@prisma/client";
import {
  canManageNttTicket,
  canReadNttTicket,
  isNexusSystemPrivileged,
} from "./ntt.permissions";

export interface CreateNttTicketInput {
  companyId: string;
  initiatorUserId: string;
  subjectType: NttSubjectType;
  summary: string;
  description: string;
  pagePath?: string;
  pageLabel?: string;
  contextJson?: Record<string, any>;
  tagCodes?: string[];
}

export interface CreateNttTaskInput {
  title: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate?: Date;
}

@Injectable()
export class NttService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(input: CreateNttTicketInput) {
    const {
      companyId,
      initiatorUserId,
      subjectType,
      summary,
      description,
      pagePath,
      pageLabel,
      contextJson,
      tagCodes,
    } = input;

    const thread = await this.prisma.messageThread.create({
      data: {
        companyId,
        subject: summary,
        type: "BOARD",
        createdById: initiatorUserId,
      },
    });

    const ticket = await this.prisma.nttTicket.create({
      data: {
        companyId,
        initiatorUserId,
        subjectType,
        summary,
        description,
        status: NttStatus.NEW,
        pagePath,
        pageLabel,
        contextJson: contextJson ?? undefined,
        noteThreadId: thread.id,
      },
    });

    if (tagCodes && tagCodes.length > 0) {
      const tags = await this.prisma.tag.findMany({
        where: { companyId, code: { in: tagCodes } },
      });

      if (tags.length > 0) {
        await this.prisma.tagAssignment.createMany({
          data: tags.map(tag => ({
            tagId: tag.id,
            companyId,
            entityType: "ntt_ticket",
            entityId: ticket.id,
          })),
        });
      }
    }

    return ticket;
  }

  async findByIdOrThrow(id: string) {
    return this.prisma.nttTicket.findUniqueOrThrow({
      where: { id },
      include: {
        company: true,
        initiator: true,
      },
    });
  }

  async updateStatus(
    id: string,
    nextStatus: NttStatus,
    actor: AuthenticatedUser,
    resolutionNote?: string,
  ) {
    const ticket = await this.findByIdOrThrow(id);

    if (!canManageNttTicket(actor)) {
      throw new Error("Forbidden: NTT management requires Nexus System role");
    }

    const resolvedAt =
      nextStatus === NttStatus.RESOLVED || nextStatus === NttStatus.CLOSED
        ? new Date()
        : undefined;

    const updated = await this.prisma.nttTicket.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(resolutionNote ? { description: resolutionNote } : {}),
        ...(resolvedAt ? { resolvedAt } : {}),
      },
    });

    return updated;
  }

  async publishNoteAsFaq(params: {
    ticketId: string;
    noteId: string;
    actor: AuthenticatedUser;
    title: string;
    category?: string;
    audience?: string;
  }) {
    const { ticketId, noteId, actor, title, category, audience } = params;

    if (!canManageNttTicket(actor)) {
      throw new Error("Forbidden: only Nexus System can publish FAQ");
    }

    const ticket = await this.findByIdOrThrow(ticketId);

    const note = await this.prisma.message.findFirstOrThrow({
      where: { id: noteId, threadId: ticket.noteThreadId ?? undefined },
    });

    // Placeholder: integrate with FAQ model when available.
    return {
      ok: true,
      noteId: note.id,
      ticketId: ticket.id,
    };
  }

  async listTicketsForUser(user: AuthenticatedUser, opts: { mineOnly?: boolean } = {}) {
    const { mineOnly } = opts;

    if (!isNexusSystemPrivileged(user)) {
      return this.prisma.nttTicket.findMany({
        where: { initiatorUserId: user.userId },
        orderBy: { createdAt: "desc" },
      });
    }

    if (mineOnly) {
      return this.prisma.nttTicket.findMany({
        where: { initiatorUserId: user.userId },
        orderBy: { createdAt: "desc" },
      });
    }

    return this.prisma.nttTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async listTasksForTicket(ticketId: string, actor: AuthenticatedUser) {
    const ticket = await this.findByIdOrThrow(ticketId);

    if (!canReadNttTicket(actor, ticket)) {
      throw new Error("Forbidden");
    }

    return this.prisma.task.findMany({
      where: {
        companyId: ticket.companyId,
        relatedEntityType: "ntt_ticket",
        relatedEntityId: ticket.id,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createTaskForTicket(ticketId: string, actor: AuthenticatedUser, input: CreateNttTaskInput) {
    const ticket = await this.findByIdOrThrow(ticketId);

    if (!canManageNttTicket(actor)) {
      throw new Error("Forbidden: only Nexus System can create NTT-linked tasks");
    }

    // For now, attach NTT tasks to the first project in the company, if any.
    const project = await this.prisma.project.findFirst({
      where: { companyId: ticket.companyId },
      orderBy: { createdAt: "asc" },
    });

    if (!project) {
      throw new Error("No project found for this company to attach the task to");
    }

    return this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        status: TaskStatus.TODO,
        priority: (input.priority as any) ?? undefined,
        dueDate: input.dueDate ?? null,
        companyId: ticket.companyId,
        projectId: project.id,
        assigneeId: null,
        createdByUserId: actor.userId,
        relatedEntityType: "ntt_ticket",
        relatedEntityId: ticket.id,
      },
    });
  }

  async listMessagesForTicket(ticketId: string, actor: AuthenticatedUser) {
    const ticket = await this.findByIdOrThrow(ticketId);

    if (!canReadNttTicket(actor, ticket)) {
      throw new Error("Forbidden");
    }

    if (!ticket.noteThreadId) {
      return { threadId: null, messages: [] };
    }

    const thread = await this.prisma.messageThread.findUnique({
      where: { id: ticket.noteThreadId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
          },
        },
      },
    });

    if (!thread) {
      return { threadId: ticket.noteThreadId, messages: [] };
    }

    return {
      threadId: thread.id,
      messages: thread.messages,
    };
  }
}
