-- CreateTable
CREATE TABLE "HelpItem" (
    "id" TEXT NOT NULL,
    "helpKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "sopId" TEXT,
    "sopSection" TEXT,
    "videoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpItem_helpKey_key" ON "HelpItem"("helpKey");

-- CreateIndex
CREATE INDEX "HelpItem_helpKey_idx" ON "HelpItem"("helpKey");

-- CreateIndex
CREATE INDEX "HelpItem_isActive_idx" ON "HelpItem"("isActive");
