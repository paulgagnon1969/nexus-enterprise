import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  MaintenanceTriggerStrategy,
  MaintenanceIntervalUnit,
  MaintenanceMeterType,
  MaintenanceTodoStatus,
} from "@prisma/client";

/**
 * Full lifecycle management for asset maintenance:
 * - Templates & rules (company-wide maintenance profiles)
 * - Per-asset schedules (apply template to asset)
 * - Maintenance todos (auto-generated, completable)
 * - Meter readings (hours/miles/cycles with auto-trigger)
 * - Cron: daily scan for time-based maintenance due
 */
@Injectable()
export class AssetMaintenanceService {
  private readonly logger = new Logger(AssetMaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════
  //  TEMPLATES & RULES
  // ═══════════════════════════════════════════════════════════════════

  async listTemplates(companyId: string) {
    return this.prisma.assetMaintenanceTemplate.findMany({
      where: { companyId, isActive: true },
      include: { rules: { where: { isActive: true }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async getTemplate(companyId: string, templateId: string) {
    const tmpl = await this.prisma.assetMaintenanceTemplate.findFirst({
      where: { id: templateId, companyId },
      include: { rules: { orderBy: { name: "asc" } } },
    });
    if (!tmpl) throw new NotFoundException(`Template ${templateId} not found`);
    return tmpl;
  }

  async createTemplate(
    companyId: string,
    data: {
      code: string;
      name: string;
      description?: string;
      assetType?: string;
      rules?: Array<{
        name: string;
        description?: string;
        triggerStrategy: MaintenanceTriggerStrategy;
        timeIntervalValue?: number;
        timeIntervalUnit?: MaintenanceIntervalUnit;
        meterType?: MaintenanceMeterType;
        meterIntervalAmount?: number;
        leadTimeDays?: number;
        priority?: number;
      }>;
    },
  ) {
    return this.prisma.assetMaintenanceTemplate.create({
      data: {
        companyId,
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        assetType: (data.assetType as any) ?? null,
        rules: data.rules?.length
          ? {
              create: data.rules.map((r) => ({
                name: r.name,
                description: r.description ?? null,
                triggerStrategy: r.triggerStrategy,
                timeIntervalValue: r.timeIntervalValue ?? null,
                timeIntervalUnit: r.timeIntervalUnit ?? null,
                meterType: r.meterType ?? null,
                meterIntervalAmount: r.meterIntervalAmount ?? null,
                leadTimeDays: r.leadTimeDays ?? null,
                priority: r.priority ?? null,
              })),
            }
          : undefined,
      },
      include: { rules: true },
    });
  }

  async updateTemplate(
    companyId: string,
    templateId: string,
    data: { name?: string; description?: string; isActive?: boolean },
  ) {
    const tmpl = await this.prisma.assetMaintenanceTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!tmpl) throw new NotFoundException(`Template ${templateId} not found`);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.assetMaintenanceTemplate.update({
      where: { id: templateId },
      data: updateData,
      include: { rules: true },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  APPLY TEMPLATE TO ASSET
  // ═══════════════════════════════════════════════════════════════════

  async applyTemplate(companyId: string, assetId: string, templateId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    const template = await this.prisma.assetMaintenanceTemplate.findFirst({
      where: { id: templateId, companyId, isActive: true },
      include: { rules: { where: { isActive: true } } },
    });
    if (!template) throw new NotFoundException(`Template ${templateId} not found or inactive`);

    const now = new Date();
    const created: any[] = [];

    for (const rule of template.rules) {
      // Skip if schedule already exists for this asset+rule
      const existing = await this.prisma.assetMaintenanceSchedule.findUnique({
        where: { assetId_ruleId: { assetId, ruleId: rule.id } },
      });
      if (existing) continue;

      const nextTimeDueAt = this.computeNextTimeDue(now, rule.timeIntervalValue, rule.timeIntervalUnit);
      const nextMeterDueAt = rule.meterIntervalAmount ?? null;

      const schedule = await this.prisma.assetMaintenanceSchedule.create({
        data: {
          assetId,
          ruleId: rule.id,
          nextTimeDueAt,
          nextMeterDueAt,
        },
      });
      created.push(schedule);
    }

    // Update the asset's maintenance profile reference
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { maintenanceProfileCode: template.code },
    });

    this.logger.log(
      `Applied template "${template.name}" to asset ${asset.name}: ${created.length} schedule(s) created`,
    );

    return { templateId, assetId, schedulesCreated: created.length, schedules: created };
  }

  async getAssetMaintenanceInfo(companyId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    const schedules = await this.prisma.assetMaintenanceSchedule.findMany({
      where: { assetId },
      include: {
        rule: { select: { id: true, name: true, description: true, triggerStrategy: true, meterType: true } },
        todos: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { dueDate: "asc" },
          take: 5,
        },
      },
    });

    const recentTodos = await this.prisma.maintenanceTodo.findMany({
      where: { assetId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { schedules, recentTodos };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MAINTENANCE TODOS
  // ═══════════════════════════════════════════════════════════════════

  async listTodos(
    companyId: string,
    filters?: { assetId?: string; status?: MaintenanceTodoStatus; overdue?: boolean },
  ) {
    const where: any = { companyId };
    if (filters?.assetId) where.assetId = filters.assetId;
    if (filters?.status) where.status = filters.status;
    if (filters?.overdue) {
      where.status = { in: ["PENDING", "IN_PROGRESS"] };
      where.dueDate = { lt: new Date() };
    }

    return this.prisma.maintenanceTodo.findMany({
      where,
      orderBy: { dueDate: "asc" },
      include: {
        asset: { select: { id: true, name: true, code: true, assetType: true } },
        rule: { select: { id: true, name: true } },
      },
    });
  }

  async updateTodo(
    companyId: string,
    todoId: string,
    data: {
      status?: MaintenanceTodoStatus;
      completedByUserId?: string;
      assignedToUserId?: string;
      notes?: string;
      maintenanceCost?: number;
      meterReading?: number;
    },
  ) {
    const todo = await this.prisma.maintenanceTodo.findFirst({
      where: { id: todoId, companyId },
      include: {
        schedule: true,
        asset: { select: { id: true, companyId: true, baseRate: true } },
      },
    });
    if (!todo) throw new NotFoundException(`Maintenance todo ${todoId} not found`);

    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assignedToUserId !== undefined) updateData.assignedToUserId = data.assignedToUserId;
    if (data.notes !== undefined) updateData.description = data.notes;

    // Handle completion
    if (data.status === "COMPLETED") {
      updateData.completedAt = new Date();
      updateData.completedByUserId = data.completedByUserId ?? null;

      // Advance the schedule
      if (todo.scheduleId && todo.schedule) {
        const schedule = todo.schedule;
        const rule = await this.prisma.assetMaintenanceRule.findUnique({
          where: { id: schedule.ruleId },
        });

        if (rule) {
          const now = new Date();
          const nextTimeDue = this.computeNextTimeDue(
            now,
            rule.timeIntervalValue,
            rule.timeIntervalUnit,
          );

          const scheduleUpdate: any = {
            lastServiceDate: now,
            nextTimeDueAt: nextTimeDue,
          };

          // If meter reading provided, update meter-based schedule
          if (data.meterReading != null && rule.meterIntervalAmount) {
            scheduleUpdate.lastServiceMeter = data.meterReading;
            scheduleUpdate.nextMeterDueAt = data.meterReading + rule.meterIntervalAmount;
          }

          await this.prisma.assetMaintenanceSchedule.update({
            where: { id: schedule.id },
            data: scheduleUpdate,
          });
        }
      }

      // Record maintenance transaction if cost provided
      if (data.maintenanceCost != null && data.maintenanceCost > 0 && todo.assetId) {
        await this.prisma.assetTransaction.create({
          data: {
            assetId: todo.assetId,
            companyId,
            kind: "MAINTENANCE",
            totalCost: data.maintenanceCost,
            notes: `Maintenance: ${todo.title}`,
            createdById: data.completedByUserId ?? null,
          },
        });
      }
    }

    return this.prisma.maintenanceTodo.update({
      where: { id: todoId },
      data: updateData,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  METER READINGS
  // ═══════════════════════════════════════════════════════════════════

  async recordMeterReading(
    companyId: string,
    assetId: string,
    meterType: MaintenanceMeterType,
    value: number,
    source?: string,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    const reading = await this.prisma.assetMeterReading.create({
      data: {
        companyId,
        assetId,
        meterType,
        value,
        source: source ?? null,
      },
    });

    // Check if any meter-based schedules are now due
    const triggeredTodos = await this.checkMeterTriggers(companyId, assetId, meterType, value);

    this.logger.log(
      `Meter reading: ${asset.name} ${meterType}=${value} (triggered ${triggeredTodos} todo(s))`,
    );

    return { reading, triggeredTodos };
  }

  async getMeterHistory(companyId: string, assetId: string, limit = 50) {
    return this.prisma.assetMeterReading.findMany({
      where: { companyId, assetId },
      orderBy: { recordedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Check if a meter reading triggers any maintenance schedules.
   * Creates MaintenanceTodo for each crossed threshold.
   */
  private async checkMeterTriggers(
    companyId: string,
    assetId: string,
    meterType: MaintenanceMeterType,
    currentValue: number,
  ): Promise<number> {
    // Find schedules for this asset that have meter-based triggers matching this meter type
    const schedules = await this.prisma.assetMaintenanceSchedule.findMany({
      where: { assetId },
      include: {
        rule: true,
        todos: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        },
      },
    });

    let triggered = 0;

    for (const schedule of schedules) {
      const rule = schedule.rule;

      // Only trigger for matching meter type
      if (rule.meterType !== meterType) continue;

      // Skip if no meter threshold set
      if (schedule.nextMeterDueAt == null) continue;

      // Skip if threshold not reached
      if (currentValue < schedule.nextMeterDueAt) continue;

      // Skip if there's already a pending todo for this schedule
      if (schedule.todos.length > 0) continue;

      // Create maintenance todo
      await this.prisma.maintenanceTodo.create({
        data: {
          companyId,
          assetId,
          scheduleId: schedule.id,
          ruleId: rule.id,
          title: `${rule.name} — meter threshold reached (${currentValue} ${meterType.toLowerCase()})`,
          description: rule.description ?? undefined,
          status: MaintenanceTodoStatus.PENDING,
          dueDate: new Date(Date.now() + (rule.leadTimeDays ?? 7) * 24 * 60 * 60 * 1000),
          priority: rule.priority ?? null,
          kind: "METER_TRIGGERED",
          assignedToRole: rule.defaultAssigneeRole ?? null,
        },
      });

      triggered++;
    }

    return triggered;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CRON: Daily maintenance check (6 AM)
  // ═══════════════════════════════════════════════════════════════════

  @Cron("0 0 6 * * *")
  async handleMaintenanceCron() {
    try {
      await this.checkTimeBasedMaintenance();
    } catch (err: any) {
      this.logger.error(`Maintenance cron failed: ${err?.message}`);
    }
  }

  /**
   * Scan all schedules with time-based triggers and create todos for those now due.
   */
  async checkTimeBasedMaintenance() {
    const now = new Date();

    const dueSchedules = await this.prisma.assetMaintenanceSchedule.findMany({
      where: {
        nextTimeDueAt: { lte: now },
      },
      include: {
        rule: true,
        asset: { select: { id: true, name: true, companyId: true, isActive: true } },
        todos: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        },
      },
    });

    let created = 0;

    for (const schedule of dueSchedules) {
      // Skip inactive assets
      if (!schedule.asset.isActive) continue;

      // Skip if there's already a pending todo
      if (schedule.todos.length > 0) continue;

      const rule = schedule.rule;

      await this.prisma.maintenanceTodo.create({
        data: {
          companyId: schedule.asset.companyId,
          assetId: schedule.asset.id,
          scheduleId: schedule.id,
          ruleId: rule.id,
          title: `${rule.name} — scheduled maintenance for ${schedule.asset.name}`,
          description: rule.description ?? undefined,
          status: MaintenanceTodoStatus.PENDING,
          dueDate: new Date(now.getTime() + (rule.leadTimeDays ?? 7) * 24 * 60 * 60 * 1000),
          priority: rule.priority ?? null,
          kind: "TIME_TRIGGERED",
          assignedToRole: rule.defaultAssigneeRole ?? null,
        },
      });

      created++;
    }

    if (created > 0) {
      this.logger.log(`Maintenance cron: created ${created} todo(s) from ${dueSchedules.length} due schedule(s)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private computeNextTimeDue(
    from: Date,
    intervalValue?: number | null,
    intervalUnit?: MaintenanceIntervalUnit | null,
  ): Date | null {
    if (!intervalValue || !intervalUnit) return null;

    const next = new Date(from);
    switch (intervalUnit) {
      case "DAY":
        next.setDate(next.getDate() + intervalValue);
        break;
      case "WEEK":
        next.setDate(next.getDate() + intervalValue * 7);
        break;
      case "MONTH":
        next.setMonth(next.getMonth() + intervalValue);
        break;
      case "YEAR":
        next.setFullYear(next.getFullYear() + intervalValue);
        break;
    }
    return next;
  }
}
