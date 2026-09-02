import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/api/dashboard';
import { getDeviceStatus } from '@/lib/api/deviceStatus';
import { getBatteryHistory } from '@/lib/api/battery';
import { getCurrentUser } from '@/lib/api/auth';
import { query } from '@/lib/dbClient';
import type { RobotSummary } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

async function getCompanyId(): Promise<number | undefined> {
    const user = await getCurrentUser();
    if (user.data?.role === 'super_admin') return undefined;
    return user.data?.companyId;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const deviceId = searchParams.get('deviceId');

    // Get per-robot summary stats
    if (action === 'robot-summary' && deviceId) {
        const parsedDeviceId = parseInt(deviceId, 10);

        const [deviceStatusResult, batteryHistoryResult] = await Promise.all([
            getDeviceStatus(parsedDeviceId),
            getBatteryHistory(parsedDeviceId, 50),
        ]);

        const status = deviceStatusResult.data;
        const batteryHistory = batteryHistoryResult.data ?? [];

        // Determine if robot is online (status update within 5 minutes)
        let isOnline = false;
        if (status?.status_updated_at) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            isOnline = new Date(status.status_updated_at) > fiveMinutesAgo;
        }

        // Count errors for this robot
        let errorCount = 0;
        try {
            const errorRows = await query<{ count: string }>(
                `SELECT COUNT(*) as count 
                 FROM h_command_log 
                 WHERE device_id = $1 AND status != 'success'`,
                [parsedDeviceId]
            );
            errorCount = parseInt(errorRows[0]?.count ?? '0', 10);
        } catch {
            // Ignore error, default to 0
        }

        const summary: RobotSummary = {
            device_id: parsedDeviceId,
            device_name: status?.device_name ?? null,
            device_code: status?.device_code ?? '',
            battery_percent: status?.battery_percent ?? null,
            robot_mode: status?.robot_mode ?? null,
            robot_activity: status?.robot_activity ?? null,
            last_updated: status?.status_updated_at ?? null,
            is_online: isOnline,
            error_count: errorCount,
            battery_history: batteryHistory.map(b => ({
                percent: b.battery_percent ?? 0,
                recorded_at: b.recorded_at,
            })),
        };

        return NextResponse.json({ data: summary, error: null });
    }

    // Dashboard stats — scoped by company
    const companyId = await getCompanyId();
    const result = await getDashboardStats(companyId);
    return NextResponse.json(result);
}

