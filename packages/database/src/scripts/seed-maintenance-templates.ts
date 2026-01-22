import {
  prisma,
  AssetType,
  MaintenanceIntervalUnit,
  MaintenanceMeterType,
  MaintenanceTriggerStrategy,
  Role,
} from "../index";

const PROFILE_TRUCK_SERVICE_A = "TRUCK_SERVICE_A";
const PROFILE_GENERATOR_PM_A = "GENERATOR_PM_A";

async function upsertReviewSettingsForCompany(companyId: string): Promise<void> {
  const existing = await prisma.maintenanceReviewSettings.findUnique({
    where: { companyId },
  });

  if (existing) {
    return;
  }

  const now = new Date();

  await prisma.maintenanceReviewSettings.create({
    data: {
      companyId,
      intervalValue: 1,
      intervalUnit: MaintenanceIntervalUnit.WEEK,
      nextReviewAt: now,
      isActive: true,
    },
  });
}

type RuleSeed = {
  name: string;
  description?: string;
  triggerStrategy: MaintenanceTriggerStrategy;
  timeIntervalValue?: number;
  timeIntervalUnit?: MaintenanceIntervalUnit;
  meterType?: MaintenanceMeterType;
  meterIntervalAmount?: number;
  leadTimeDays?: number;
  defaultAssigneeRole?: Role;
  priority?: number;
};

async function upsertTemplateWithRulesForCompany(params: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  assetType?: AssetType;
  rules: RuleSeed[];
}): Promise<void> {
  const { companyId, code, name, description, assetType, rules } = params;

  const template = await prisma.assetMaintenanceTemplate.upsert({
    where: {
      companyId_code: {
        companyId,
        code,
      },
    },
    update: {
      name,
      description,
      assetType,
      isActive: true,
    },
    create: {
      companyId,
      code,
      name,
      description,
      assetType,
      isActive: true,
    },
  });

  // Replace existing rules with the seeded ones for determinism.
  await prisma.assetMaintenanceRule.deleteMany({
    where: { templateId: template.id },
  });

  let index = 1;
  for (const rule of rules) {
    await prisma.assetMaintenanceRule.create({
      data: {
        templateId: template.id,
        name: rule.name,
        description: rule.description,
        triggerStrategy: rule.triggerStrategy,
        timeIntervalValue: rule.timeIntervalValue,
        timeIntervalUnit: rule.timeIntervalUnit,
        meterType: rule.meterType,
        meterIntervalAmount: rule.meterIntervalAmount,
        leadTimeDays: rule.leadTimeDays,
        defaultAssigneeRole: rule.defaultAssigneeRole,
        priority: rule.priority ?? index,
        isActive: true,
      },
    });
    index += 1;
  }
}

async function seedForCompany(companyId: string): Promise<void> {
  await upsertReviewSettingsForCompany(companyId);

  // Truck Service A: 6 months or 250 hours, 14 day lead time.
  await upsertTemplateWithRulesForCompany({
    companyId,
    code: PROFILE_TRUCK_SERVICE_A,
    name: "Truck Service A",
    description: "Full service for service trucks (oil, filters, brakes, inspection).",
    assetType: AssetType.EQUIPMENT,
    rules: [
      {
        name: "Truck Service A - Full Service",
        description: "Oil, filters, brakes, general inspection.",
        triggerStrategy: MaintenanceTriggerStrategy.TIME_OR_METER,
        timeIntervalValue: 6,
        timeIntervalUnit: MaintenanceIntervalUnit.MONTH,
        meterType: MaintenanceMeterType.HOURS,
        meterIntervalAmount: 250,
        leadTimeDays: 14,
        defaultAssigneeRole: Role.EM,
        priority: 1,
      },
    ],
  });

  // Generator PM A: 3 months or 200 hours, 7 day lead time.
  await upsertTemplateWithRulesForCompany({
    companyId,
    code: PROFILE_GENERATOR_PM_A,
    name: "Generator PM A",
    description: "Preventative maintenance for towable generators.",
    assetType: AssetType.RENTAL,
    rules: [
      {
        name: "Generator PM A - Standard",
        description: "Check fluids, filters, belts, and perform load test.",
        triggerStrategy: MaintenanceTriggerStrategy.TIME_OR_METER,
        timeIntervalValue: 3,
        timeIntervalUnit: MaintenanceIntervalUnit.MONTH,
        meterType: MaintenanceMeterType.HOURS,
        meterIntervalAmount: 200,
        leadTimeDays: 7,
        defaultAssigneeRole: Role.EM,
        priority: 1,
      },
    ],
  });
}

async function main(): Promise<void> {
  const companyIdEnv = process.env.COMPANY_ID;

  if (companyIdEnv) {
    // Seed only the specified company.
    // eslint-disable-next-line no-console
    console.log(`Seeding maintenance templates for company ${companyIdEnv}`);
    await seedForCompany(companyIdEnv);
  } else {
    // Seed all companies that currently have assets referencing the known maintenance profiles.
    const companies = await prisma.company.findMany({
      where: {
        assets: {
          some: {
            maintenanceProfileCode: {
              in: [PROFILE_TRUCK_SERVICE_A, PROFILE_GENERATOR_PM_A],
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Found ${companies.length} companies with maintenance-profiled assets.`);

    for (const company of companies) {
      // eslint-disable-next-line no-console
      console.log(`Seeding maintenance templates for company ${company.id} (${company.name})`);
      await seedForCompany(company.id);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void prisma.$disconnect().finally(() => {
    process.exit(1);
  });
});
