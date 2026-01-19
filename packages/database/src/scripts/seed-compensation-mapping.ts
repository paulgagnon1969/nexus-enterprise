import prisma from "../client";

const SEED_MAPPINGS = [
  // Core crafts
  {
    cpRole: "CARPENTER",
    workerClassCode: null,
    socCode: "47-2031", // Carpenters
    notes: "General carpenter mapping",
  },
  {
    cpRole: "ELECTRICIAN",
    workerClassCode: null,
    socCode: "47-2111", // Electricians
    notes: "General electrician mapping",
  },
  {
    cpRole: "LABORER",
    workerClassCode: null,
    socCode: "47-2061", // Construction Laborers
    notes: "General construction laborer mapping",
  },
  {
    cpRole: "PLUMBER",
    workerClassCode: null,
    socCode: "47-2152", // Plumbers, Pipefitters, and Steamfitters
    notes: "General plumber/pipefitter mapping",
  },
  {
    cpRole: "PIPEFITTER",
    workerClassCode: null,
    socCode: "47-2152",
    notes: "Pipefitter mapping",
  },
  {
    cpRole: "OPERATING_ENGINEER",
    workerClassCode: null,
    socCode: "47-2073", // Operating Engineers and Other Construction Equipment Operators
    notes: "Operating engineer / equipment operator",
  },
  // Example Davis–Bacon union/SU codes you mentioned earlier
  {
    cpRole: "CARP1912-001",
    workerClassCode: null,
    socCode: "47-2031",
    notes: "AZ/NM Davis-Bacon CARPENTER local 1912",
  },
  {
    cpRole: "SUNM2010-012",
    workerClassCode: null,
    socCode: "47-2061",
    notes: "NM Davis-Bacon laborer SU code",
  },
];

async function main() {
  try {
    for (const row of SEED_MAPPINGS) {
      await prisma.compensationClassificationMapping.upsert({
        where: {
          // cpRole + workerClassCode + socCode unique constraint
          CompClass_unique_triplet: {
            cpRole: row.cpRole,
            // Prisma's compound unique input does not accept null; normalize
            // null workerClassCode to an empty string for the purpose of this
            // seed key, and keep the stored column nullable.
            workerClassCode: row.workerClassCode ?? "",
            socCode: row.socCode,
          },
        },
        update: {
          notes: row.notes,
        },
        create: {
          cpRole: row.cpRole,
          workerClassCode: row.workerClassCode,
          socCode: row.socCode,
          notes: row.notes,
        },
      });
    }

    console.log(`Seeded ${SEED_MAPPINGS.length} compensation classification mappings.`);
  } catch (err) {
    console.error("Error seeding compensation classification mappings:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
