// Dashboard API - Abstraction layer for dashboard statistics

import { getRobotCount, getRecentRobots } from './robots';
import { getBatteryStats } from './battery';
import { getCommandLogs, getErrorCount } from './commands';
import type { DashboardStats, ApiResult } from '@/lib/types/database';

/**
 * Get all dashboard statistics in one call
 * @param companyId - If provided, filters all stats to this company. undefined = all companies (SUPER_ADMIN).
 */
export async function getDashboardStats(companyId?: number): Promise<ApiResult<DashboardStats>> {
    try {
        // Fetch all stats in parallel, scoped by company
        const [
            robotCountResult,
            batteryStatsResult,
            errorCountResult,
            commandsResult,
            recentRobotsResult,
        ] = await Promise.all([
            getRobotCount(companyId),
            getBatteryStats(companyId),
            getErrorCount(companyId),
            getCommandLogs(20, undefined, companyId),
            getRecentRobots(5, companyId),
        ]);

        const stats: DashboardStats = {
            robotCount: robotCountResult.data ?? 0,
            avgBattery: batteryStatsResult.data?.avgBattery ?? null,
            errorCount: errorCountResult.data ?? 0,
            batteryBuckets: batteryStatsResult.data?.buckets ?? { critical: 0, warning: 0, healthy: 0 },
            latestCommands: commandsResult.data ?? [],
            recentRobots: recentRobotsResult.data ?? [],
        };

        return { data: stats, error: null };
    } catch (err) {
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

