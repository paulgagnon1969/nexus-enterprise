import prisma from "./client";

async function main() {
  const manual = await prisma.manual.findFirst({ where: { code: "NCC-CONTRACTOR-HANDBOOK" } });
  if (!manual) {
    console.log("Manual NCC-CONTRACTOR-HANDBOOK not found");
    return;
  }

  const updated = await prisma.manual.update({
    where: { id: manual.id },
    data: {
      isPublic: true,
      publicSlug: "contractor-handbook",
    },
  });

  console.log("✓ Updated manual:");
  console.log("  Code:", updated.code);
  console.log("  isPublic:", updated.isPublic);
  console.log("  publicSlug:", updated.publicSlug);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
