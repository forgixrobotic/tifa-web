// Battery API - Abstraction layer for battery operations
// Matches h_battery table from tifa_dump.sql

import { query } from '@/lib/dbClient';
import type { BatteryRow, BatteryBuckets, ApiResult } from '@/lib/types/database';


/**
 * Get battery history for a specific device
 */
export async function getBatteryHistory(
    deviceId: number,
    limit: number = 50
): Promise<ApiResult<BatteryRow[]>> {
    try {
        const rows = await query<BatteryRow>(
            `SELECT h_battery_id,
                    device_id,
                    COALESCE(((raw_payload->'data')->>'battery_percent')::numeric, battery_percent) AS battery_percent,
                    voltage,
                    recorded_at,
                    raw_payload
             FROM h_battery
             WHERE device_id = $1
             ORDER BY recorded_at DESC
             LIMIT $2`,
            [deviceId, limit]
        );

        return { data: rows, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Get latest battery readings across all devices
 */
export async function getLatestBatteries(
    limit: number = 200,
    companyId?: number
): Promise<ApiResult<BatteryRow[]>> {
    try {
        let sql = `
            SELECT hb.h_battery_id,
                    hb.device_id,
                    COALESCE(((hb.raw_payload->'data'->>'battery_percent')::numeric), hb.battery_percent) AS battery_percent,
                    hb.voltage,
                    hb.recorded_at,
                    hb.raw_payload
             FROM h_battery hb
        `;
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (companyId) {
            sql += ` JOIN m_device d ON hb.device_id = d.device_id WHERE d.company_id = $${paramIdx++}`;
            params.push(companyId);
        }

        sql += ` ORDER BY hb.recorded_at DESC LIMIT $${paramIdx}`;
        params.push(limit);

        const rows = await query<BatteryRow>(sql, params);

        return { data: rows, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Get latest battery for a specific device
 */
export async function getLatestBattery(
    deviceId: number
): Promise<ApiResult<BatteryRow>> {
    try {
        const rows = await query<BatteryRow>(
            `SELECT h_battery_id,
                    device_id,
                    COALESCE(((raw_payload->'data')->>'battery_percent')::numeric, battery_percent) AS battery_percent,
                    voltage,
                    recorded_at,
                    raw_payload
             FROM h_battery
             WHERE device_id = $1
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [deviceId]
        );

        const row = rows[0] ?? null;
        return { data: row, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Calculate battery statistics (average and buckets)
 */
export async function getBatteryStats(companyId?: number): Promise<ApiResult<{ avgBattery: number | null; buckets: BatteryBuckets }>> {
    const { data: batteryData, error } = await getLatestBatteries(200, companyId);

    if (error || !batteryData) {
        return {
            data: { avgBattery: null, buckets: { critical: 0, warning: 0, healthy: 0 } },
            error,
        };
    }

    if (batteryData.length === 0) {
        return {
            data: { avgBattery: null, buckets: { critical: 0, warning: 0, healthy: 0 } },
            error: null,
        };
    }

    const sum = batteryData.reduce(
        (acc, cur) => acc + Number(cur.battery_percent ?? 0),
        0
    );
    const avgBattery = Math.round(sum / batteryData.length);

    const buckets: BatteryBuckets = { critical: 0, warning: 0, healthy: 0 };
    batteryData.forEach((item) => {
        const value = Number(item.battery_percent ?? 0);
        if (value <= 30) buckets.critical += 1;
        else if (value <= 60) buckets.warning += 1;
        else buckets.healthy += 1;
    });

    return {
        data: { avgBattery, buckets },
        error: null,
    };
}

/**
 * Hourly battery data for activity monitor overlay.
 * Returns average battery_percent per hour for today (Jakarta time).
 */
export type HourlyBatteryData = {
    hour: number;
    avg_battery: number;
    label: string;
};

export async function getHourlyBatteryData(
    deviceId: number,
    range: '1d' | '1w' | '1m' | '3m' = '1d'
): Promise<ApiResult<HourlyBatteryData[]>> {
    try {
        const tz = 'Asia/Jakarta';

        if (range === '1d') {
            const rows = await query<{ hr: string; avg_bat: string }>(
                `SELECT
                    EXTRACT(HOUR FROM recorded_at AT TIME ZONE $1)::int AS hr,
                    ROUND(AVG(
                        COALESCE(
                            ((raw_payload->'data'->>'battery_percent')::numeric),
                            battery_percent
                        )
                    ), 1) AS avg_bat
                 FROM h_battery
                 WHERE device_id = $2
                   AND recorded_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1)
                 GROUP BY hr
                 ORDER BY hr`,
                [tz, deviceId]
            );

            // Determine current hour in Jakarta timezone
            const jakartaNow = new Date(Date.now() + 7 * 60 * 60 * 1000 + new Date().getTimezoneOffset() * 60000);
            const currentHour = jakartaNow.getHours();

            const batMap = new Map<number, number>();
            rows.forEach(r => batMap.set(Number(r.hr), Number(r.avg_bat)));

            // Find last known battery before today to start the line smoothly
            let lastKnownBat = -1;
            const lastBatRow = await query<{ battery_percent: number }>(
                `SELECT COALESCE(((raw_payload->'data'->>'battery_percent')::numeric), battery_percent) as battery_percent
                 FROM h_battery 
                 WHERE device_id = $1 AND recorded_at < (DATE_TRUNC('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2)
                 ORDER BY recorded_at DESC LIMIT 1`,
                [deviceId, tz]
            );
            if (lastBatRow.length > 0) {
                lastKnownBat = Number(lastBatRow[0].battery_percent);
            }

            const result: HourlyBatteryData[] = [];
            for (let i = 0; i <= currentHour; i++) {
                const val = batMap.get(i);
                if (val !== undefined) {
                    lastKnownBat = val;
                }
                result.push({
                    hour: i,
                    avg_battery: lastKnownBat, 
                    label: `${i.toString().padStart(2, '0')}:00`,
                });
            }
            return { data: result, error: null };
        } else {
            // For weekly/monthly/3-month, aggregate per day
            const intervalMap: Record<string, string> = {
                '1w': '7 days',
                '1m': '30 days',
                '3m': '90 days',
            };
            const interval = intervalMap[range] ?? '7 days';
            const days = range === '1w' ? 7 : range === '1m' ? 30 : 90;

            const rows = await query<{ d: string; avg_bat: string }>(
                `SELECT
                    (recorded_at AT TIME ZONE $1)::date::text AS d,
                    ROUND(AVG(
                        COALESCE(
                            ((raw_payload->'data'->>'battery_percent')::numeric),
                            battery_percent
                        )
                    ), 1) AS avg_bat
                 FROM h_battery
                 WHERE device_id = $2
                   AND recorded_at >= (NOW() - INTERVAL '${interval}')
                 GROUP BY d
                 ORDER BY d`,
                [tz, deviceId]
            );

            const batMap = new Map<string, number>();
            rows.forEach(r => batMap.set(r.d, Number(r.avg_bat)));

            const jakartaOffset = 7 * 60;
            const now = new Date();
            const localNow = new Date(now.getTime() + (jakartaOffset + now.getTimezoneOffset()) * 60000);

            // Find last known battery before the range to start the line smoothly
            let lastKnownBat = -1;
            const lastBatRow = await query<{ battery_percent: number }>(
                `SELECT COALESCE(((raw_payload->'data'->>'battery_percent')::numeric), battery_percent) as battery_percent
                 FROM h_battery 
                 WHERE device_id = $1 AND recorded_at < (NOW() - INTERVAL '${interval}')
                 ORDER BY recorded_at DESC LIMIT 1`,
                [deviceId]
            );
            if (lastBatRow.length > 0) {
                lastKnownBat = Number(lastBatRow[0].battery_percent);
            }

            const result: HourlyBatteryData[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(localNow.getTime() - i * 24 * 60 * 60 * 1000);
                const dateKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                
                const val = batMap.get(dateKey);
                if (val !== undefined) {
                    lastKnownBat = val;
                }
                
                result.push({
                    hour: days - 1 - i,
                    avg_battery: lastKnownBat,
                    label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
                });
            }
            return { data: result, error: null };
        }
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}
