import prisma from "./client";

export type MarketWageBands = {
  stateCode: string;
  year: number;
  socCode: string;
  occupationName: string;
  hourlyMean: number | null;
  hourlyP10: number | null;
  hourlyP25: number | null;
  hourlyMedian: number | null;
  hourlyP75: number | null;
  hourlyP90: number | null;
};

export async function getMarketWageBands(opts: {
  stateCode: string;
  socCode: string;
  year?: number;
}): Promise<MarketWageBands | null> {
  const stateCode = opts.stateCode.toUpperCase();
  const socCode = opts.socCode;

  // Resolve snapshot: either explicit year, or latest year for this state.
  const snapshot = opts.year
    ? await prisma.stateOccupationalWageSnapshot.findFirst({
        where: { stateCode, year: opts.year, source: "BLS_OES" },
        orderBy: { year: "desc" },
      })
    : await prisma.stateOccupationalWageSnapshot.findFirst({
        where: { stateCode, source: "BLS_OES" },
        orderBy: { year: "desc" },
      });

  if (!snapshot) {
    return null;
  }

  const wage = await prisma.stateOccupationalWage.findFirst({
    where: {
      snapshotId: snapshot.id,
      socCode,
    },
  });

  if (!wage) return null;

  return {
    stateCode: snapshot.stateCode,
    year: snapshot.year,
    socCode,
    occupationName: wage.occupationName,
    hourlyMean: wage.hourlyMean ?? null,
    hourlyP10: wage.hourlyP10 ?? null,
    hourlyP25: wage.hourlyP25 ?? null,
    hourlyMedian: wage.hourlyMedian ?? null,
    hourlyP75: wage.hourlyP75 ?? null,
    hourlyP90: wage.hourlyP90 ?? null,
  };
}

export async function getMarketWageBandsForWorker(opts: {
  stateCode: string;
  cpRole?: string | null;
  workerClassCode?: string | null;
  year?: number;
}): Promise<MarketWageBands | null> {
  const { stateCode, cpRole, workerClassCode, year } = opts;

  const mapping = await prisma.compensationClassificationMapping.findFirst({
    where: {
      OR: [
        cpRole ? { cpRole } : undefined,
        workerClassCode ? { workerClassCode } : undefined,
      ].filter(Boolean) as any,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!mapping) {
    return null;
  }

  return getMarketWageBands({ stateCode, socCode: mapping.socCode, year });
}
