-- CreateEnum
CREATE TYPE "DrawingUploadStatus" AS ENUM ('UPLOADING', 'EXTRACTING_TEXT', 'EXTRACTING_BOM', 'MATCHING', 'READY', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ProjectDrawingUpload" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "fileSizeBytes" BIGINT,
    "status" "DrawingUploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    "extractedTextJson" JSONB,
    "aiModelUsed" TEXT,
    "aiTokensUsed" INTEGER,
    "aiExtractionMs" INTEGER,
    "totalBomLines" INTEGER NOT NULL DEFAULT 0,
    "matchedBomLines" INTEGER NOT NULL DEFAULT 0,
    "unmatchedBomLines" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generatedEstimateVersionId" TEXT,

    CONSTRAINT "ProjectDrawingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingBomLine" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "csiDivision" TEXT,
    "csiDivisionName" TEXT,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "sourcePage" INTEGER,
    "sourceSheet" TEXT,
    "matchedCostBookItemId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchMethod" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "isManualPrice" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDrawingUpload_project_created_idx" ON "ProjectDrawingUpload"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectDrawingUpload_company_idx" ON "ProjectDrawingUpload"("companyId");

-- CreateIndex
CREATE INDEX "DrawingBomLine_upload_line_idx" ON "DrawingBomLine"("uploadId", "lineNo");

-- CreateIndex
CREATE INDEX "DrawingBomLine_upload_division_idx" ON "DrawingBomLine"("uploadId", "csiDivision");

-- CreateIndex
CREATE INDEX "DrawingBomLine_cost_book_match_idx" ON "DrawingBomLine"("matchedCostBookItemId");

-- AddForeignKey
ALTER TABLE "ProjectDrawingUpload" ADD CONSTRAINT "ProjectDrawingUpload_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDrawingUpload" ADD CONSTRAINT "ProjectDrawingUpload_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingBomLine" ADD CONSTRAINT "DrawingBomLine_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "ProjectDrawingUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingBomLine" ADD CONSTRAINT "DrawingBomLine_matchedCostBookItemId_fkey" FOREIGN KEY ("matchedCostBookItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
