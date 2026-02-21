-- Add defaultHoursPerDay (hours per day used to convert hourly ↔ day rate)
ALTER TABLE "Worker" ADD COLUMN "defaultHoursPerDay" DOUBLE PRECISION;
