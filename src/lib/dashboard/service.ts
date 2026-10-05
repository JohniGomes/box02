import { getDashboardMetrics, type DashboardMetrics } from "@/lib/db/repositories/dashboardMetrics";

export async function getDashboardMetricsService(): Promise<DashboardMetrics> {
  return getDashboardMetrics();
}
