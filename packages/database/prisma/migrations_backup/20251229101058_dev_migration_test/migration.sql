-- CreateTable
CREATE TABLE "DevMigrationTest" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevMigrationTest_pkey" PRIMARY KEY ("id")
);
