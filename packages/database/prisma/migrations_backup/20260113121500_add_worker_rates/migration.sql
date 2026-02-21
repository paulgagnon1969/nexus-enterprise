-- Add additional rate fields for workers

ALTER TABLE "Worker" 
  ADD COLUMN "billRate" DOUBLE PRECISION,
  ADD COLUMN "cpRate" DOUBLE PRECISION,
  ADD COLUMN "cpRole" TEXT;