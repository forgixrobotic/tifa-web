import { query } from '@/lib/dbClient';
import type { CommandLog, ActivityData, ApiResult } from '@/lib/types/database';

export interface PaginationMeta {
    page: number;
    limit: number;
    totalRows: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: PaginationMeta;
    error: string | null;
}

/**
 * Get paginated command logs with 10 items per page by default
 */
export async function getPaginatedCommandLogs(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    deviceId?: number;
    companyId?: number;
}): Promise<PaginatedResult<CommandLog>> {
    try {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.max(1, Math.min(100, options.limit ?? 10)); // Default 10 per page
        const offset = (page - 1) * limit;

        const whereClauses: string[] = [];
        const params: (string | number)[] = [];

        if (options.deviceId !== undefined) {
            params.push(options.deviceId);
            whereClauses.push(`device_id = $${params.length}`);
        }

        if (options.companyId !== undefined) {
            params.push(options.companyId);
            whereClauses.push(`device_id IN (SELECT device_id FROM m_device WHERE company_id = $${params.length})`);
        }

        if (options.status) {
            params.push(options.status);
            whereClauses.push(`status = $${params.length}`);
        }

        if (options.search) {
            params.push(`%${options.search}%`);
            whereClauses.push(`(command_code ILIKE $${params.length} OR status_message ILIKE $${params.length})`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total matching rows
        const countSql = `SELECT COUNT(*) as count FROM h_command_log ${whereSql}`;
        const countRows = await query<{ count: string }>(countSql, params);
        const totalRows = parseInt(countRows[0]?.count ?? '0', 10);
        const totalPages = Math.ceil(totalRows / limit) || 1;

        // Fetch paginated rows
        const dataSql = `
            SELECT h_command_log_id, device_id, command_code, command_payload, 
                   status, status_message, created_at
            FROM h_command_log
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const dataParams = [...params, limit, offset];
        const rows = await query<CommandLog>(dataSql, dataParams);

        return {
            data: rows,
            pagination: {
                page,
                limit,
                totalRows,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: [],
            pagination: { page: 1, limit: 10, totalRows: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Get command logs with optional device filter
 */
export async function getCommandLogs(limit: number = 5, deviceId?: number, companyId?: number): Promise<ApiResult<CommandLog[]>> {
    try {
        const params: (string | number)[] = [];
        let deviceFilter = '';
        let companyJoin = '';
        if (deviceId !== undefined) {
            deviceFilter = `AND device_id = $${params.length + 1}`;
            params.push(deviceId);
        }
        if (companyId !== undefined) {
            companyJoin = `AND device_id IN (SELECT device_id FROM m_device WHERE company_id = $${params.length + 1})`;
            params.push(companyId);
        }
        
        const sql = `
            WITH ordered_logs AS (
                SELECT h_command_log_id, device_id, command_code, NULL as command_payload, 
                       status, status_message, created_at,
                       LAG(command_code) OVER (PARTITION BY device_id ORDER BY created_at ASC) as prev_code
                FROM h_command_log
                WHERE created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Jakarta')
                  ${deviceFilter}
                  ${companyJoin}
            )
            SELECT h_command_log_id, device_id, command_code, command_payload, 
                   status, status_message, created_at
            FROM ordered_logs
            WHERE command_code != 'TELEOP' OR prev_code != 'TELEOP' OR prev_code IS NULL
            ORDER BY created_at DESC 
            LIMIT $${params.length + 1}
        `;
        params.push(limit);

        const data = await query<CommandLog>(sql, params);

        return {
            data,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Count actual error commands in the last 24 hours.
 * Excludes 'success' and 'SENT' (pending) statuses — only counts real failures.
 */
export async function getErrorCount(companyId?: number): Promise<ApiResult<number>> {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        let sql = `SELECT COUNT(*) as count 
             FROM h_command_log 
             WHERE status NOT IN ('success', 'SENT')
             AND created_at >= $1`;
        const params: (string | number)[] = [since];

        if (companyId) {
            sql += ` AND device_id IN (SELECT device_id FROM m_device WHERE company_id = $2)`;
            params.push(companyId);
        }

        const rows = await query<{ count: string }>(sql, params);

        return {
            data: parseInt(rows[0]?.count ?? '0', 10),
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: 0,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Get activity data with configurable time range.
 * - '1d'  → last 24 hours, aggregated by hour (24 bars)
 * - '1w'  → last 7 days, aggregated by day (7 bars)
 * - '1m'  → last 30 days, aggregated by day (30 bars)
 * - '3m'  → last 90 days, aggregated by day (90 bars)
 */
export type ActivityRange = '1d' | '1w' | '1m' | '3m';

export async function getActivityData(
    deviceId: number,
    range: ActivityRange = '1d'
): Promise<ApiResult<ActivityData[]>> {
    try {
        const tz = 'Asia/Jakarta'; // UTC+7 — user's local timezone

        if (range === '1d') {
            // Query only TODAY's data (from midnight Jakarta time) so we never
            // mix yesterday's activity into today's hour slots.
            // We also only return hours 0..currentHour to avoid showing empty
            // "future" slots that confuse the user.
            const rows = await query<{ hr: string; cnt: string }>(
                `SELECT 
                    EXTRACT(HOUR FROM created_at AT TIME ZONE $1)::int AS hr,
                    COUNT(*)::int AS cnt
                 FROM h_command_log
                 WHERE device_id = $2
                   AND created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1)
                 GROUP BY hr
                 ORDER BY hr`,
                [tz, deviceId]
            );

            // Determine current hour in Jakarta timezone
            const jakartaNow = new Date(Date.now() + 7 * 60 * 60 * 1000 + new Date().getTimezoneOffset() * 60000);
            const currentHour = jakartaNow.getHours();

            // Build array from hour 0 to currentHour only
            const countMap = new Map<number, number>();
            rows.forEach(r => countMap.set(Number(r.hr), Number(r.cnt)));

            const hourlyCounts: ActivityData[] = [];
            for (let i = 0; i <= currentHour; i++) {
                hourlyCounts.push({
                    hour: i,
                    count: countMap.get(i) ?? 0,
                    label: `${i.toString().padStart(2, '0')}:00`,
                });
            }

            return { data: hourlyCounts, error: null };
        } else {
            // Aggregate by day
            const intervalMap: Record<string, string> = {
                '1w': '7 days',
                '1m': '30 days',
                '3m': '90 days',
            };
            const interval = intervalMap[range] ?? '7 days';
            const days = range === '1w' ? 7 : range === '1m' ? 30 : 90;

            const rows = await query<{ d: string; cnt: string }>(
                `SELECT 
                    (created_at AT TIME ZONE $1)::date::text AS d,
                    COUNT(*)::int AS cnt
                 FROM h_command_log
                 WHERE device_id = $2
                   AND created_at >= (NOW() - INTERVAL '${interval}')
                 GROUP BY d
                 ORDER BY d`,
                [tz, deviceId]
            );

            const countMap = new Map<string, number>();
            rows.forEach(r => countMap.set(r.d, Number(r.cnt)));

            // Build daily array from (days-1) ago to today
            const now = new Date();
            // Adjust 'now' to Jakarta time for correct date labels
            const jakartaOffset = 7 * 60; // UTC+7 in minutes
            const localNow = new Date(now.getTime() + (jakartaOffset + now.getTimezoneOffset()) * 60000);

            const dailyCounts: ActivityData[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(localNow.getTime() - i * 24 * 60 * 60 * 1000);
                const dateKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                dailyCounts.push({
                    hour: days - 1 - i, // index
                    count: countMap.get(dateKey) ?? 0,
                    label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
                });
            }

            return { data: dailyCounts, error: null };
        }
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

