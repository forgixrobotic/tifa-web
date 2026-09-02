import { NextResponse } from 'next/server';
import { getCommandLogs, getErrorCount, getActivityData } from '@/lib/api/commands';
import { getActivityLogs as getActivityLogsFromDB } from '@/lib/api/activityLog';
import { query } from '@/lib/dbClient';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const deviceId = searchParams.get('deviceId');
    const limit = parseInt(searchParams.get('limit') ?? '5', 10);

    if (action === 'error-count') {
        const result = await getErrorCount();
        return NextResponse.json(result);
    }

    if (action === 'activity' && deviceId) {
        const range = (searchParams.get('range') ?? '1d') as '1d' | '1w' | '1m' | '3m';
        const result = await getActivityData(parseInt(deviceId, 10), range);
        return NextResponse.json(result);
    }

    // Get robot-specific error count
    if (action === 'robot-error-count' && deviceId) {
        try {
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const rows = await query<{ count: string }>(
                `SELECT COUNT(*) as count 
                 FROM h_command_log 
                 WHERE device_id = $1 AND status NOT IN ('success', 'SENT')
                 AND created_at >= $2`,
                [parseInt(deviceId, 10), since]
            );
            return NextResponse.json({
                data: parseInt(rows[0]?.count ?? '0', 10),
                error: null
            });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json({ data: 0, error: error.message });
        }
    }

    // Get command logs filtered by time range (for Activity Log page)
    if (action === 'logs-by-range') {
        const range = searchParams.get('range') ?? '1d';
        const filterDeviceId = searchParams.get('deviceId');
        const now = new Date();
        let startDate: Date;
        switch (range) {
            case '1w': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case '1m': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
            case '3m': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
            default: startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
        }
        try {
            let sql = `SELECT h_command_log_id, device_id, command_code, NULL as command_payload,
                        status, status_message, created_at
                 FROM h_command_log
                 WHERE created_at >= $1`;
            const params: (string | number)[] = [startDate.toISOString()];

            if (filterDeviceId) {
                sql += ` AND device_id = $2`;
                params.push(parseInt(filterDeviceId, 10));
            }

            sql += ` ORDER BY created_at DESC`;

            const rows = await query(sql, params);
            return NextResponse.json({ data: rows, error: null });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json({ data: null, error: error.message }, { status: 500 });
        }
    }

    if (action === 'daily-logs') {
        const filterDeviceId = searchParams.get('deviceId');
        try {
            let sql = `SELECT date, SUM(total_commands) as total_commands, SUM(op_count) as op_count, 
                              SUM(move_count) as move_count, SUM(error_count) as error_count
                       FROM h_command_log_daily
                       WHERE 1=1`;
            const params: (string | number)[] = [];
            if (filterDeviceId) {
                sql += ` AND device_id = $1`;
                params.push(parseInt(filterDeviceId, 10));
            }
            sql += ` GROUP BY date ORDER BY date DESC LIMIT 30`;
            const rows = await query(sql, params);
            return NextResponse.json({ data: rows, error: null });
        } catch (err: unknown) {
            return NextResponse.json({ data: null, error: (err as Error).message }, { status: 500 });
        }
    }

    if (action === 'monthly-logs') {
        const filterDeviceId = searchParams.get('deviceId');
        try {
            let sql = `SELECT to_char(date, 'YYYY-MM') as month, 
                              SUM(total_commands) as total_commands, SUM(op_count) as op_count, 
                              SUM(move_count) as move_count, SUM(error_count) as error_count
                       FROM h_command_log_daily
                       WHERE 1=1`;
            const params: (string | number)[] = [];
            if (filterDeviceId) {
                sql += ` AND device_id = $1`;
                params.push(parseInt(filterDeviceId, 10));
            }
            sql += ` GROUP BY to_char(date, 'YYYY-MM') ORDER BY month DESC LIMIT 12`;
            const rows = await query(sql, params);
            return NextResponse.json({ data: rows, error: null });
        } catch (err: unknown) {
            return NextResponse.json({ data: null, error: (err as Error).message }, { status: 500 });
        }
    }

    // Get activity logs with sentiment analysis
    if (action === 'activity-logs') {
        const result = await getActivityLogsFromDB(
            limit,
            deviceId ? parseInt(deviceId, 10) : undefined
        );
        return NextResponse.json(result);
    }

    const result = await getCommandLogs(limit, deviceId ? parseInt(deviceId, 10) : undefined);
    return NextResponse.json(result);
}
