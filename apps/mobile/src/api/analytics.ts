import { apiJson } from "./client";

export interface KpiModuleStats {
  you: number;
  companyAvg: number;
}

export interface PersonalKpis {
  period: string;
  modules: {
    dailyLogs: KpiModuleStats;
    tasks: KpiModuleStats;
    messages: KpiModuleStats;
    timecards: KpiModuleStats;
  };
  completionRate: {
    you: number;
    companyAvg: number;
  };
  ranking: {
    dailyLogPercentile: number;
    label: string;
  };
}

/** Fetch personal KPIs for the authenticated user. */
export async function fetchMyKpis(period = "30d"): Promise<PersonalKpis> {
  return apiJson<PersonalKpis>(`/analytics/me?period=${period}`);
}
