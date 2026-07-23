import { NextResponse } from 'next/server';
import { getPaginatedCommandLogs } from '@/lib/api/commands';
import { getCurrentUser } from '@/lib/api/auth';
import { query } from '@/lib/dbClient';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'commands';
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '10', 10); // Default 10 per page
    const search = searchParams.get('search') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const deviceIdStr = searchParams.get('deviceId');
    const deviceId = deviceIdStr ? parseInt(deviceIdStr, 10) : undefined;

    // Get current user and scope by company_id unless SUPER_ADMIN (Task 3.4)
    const userRes = await getCurrentUser();
    const user = userRes.data;
    let companyId: number | undefined;

    if (user && user.role?.toLowerCase() !== 'super_admin') {
        companyId = user.companyId ?? 1;
    }

    if (type === 'commands') {
        const result = await getPaginatedCommandLogs({
            page,
            limit,
            search,
            status,
            deviceId,
            companyId,
        });
        return NextResponse.json(result);
    }

    if (type === 'traffic') {
        try {
            const offset = (Math.max(1, page) - 1) * limit;
            const whereClauses: string[] = [];
            const params: (string | number)[] = [];

            if (deviceId !== undefined) {
                params.push(deviceId);
                whereClauses.push(`device_id = $${params.length}`);
            }

            if (companyId !== undefined) {
                params.push(companyId);
                whereClauses.push(`device_id IN (SELECT device_id FROM m_device WHERE company_id = $${params.length})`);
            }

            if (search) {
                params.push(`%${search}%`);
                whereClauses.push(`(code ILIKE $${params.length} OR direction ILIKE $${params.length})`);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const countSql = `SELECT COUNT(*) as count FROM h_ws_traffic ${whereSql}`;
            const countRows = await query<{ count: string }>(countSql, params);
            const totalRows = parseInt(countRows[0]?.count ?? '0', 10);
            const totalPages = Math.ceil(totalRows / limit) || 1;

            const dataSql = `
                SELECT h_ws_traffic_id, device_id, direction, code, payload, remote_addr, recorded_at
                FROM h_ws_traffic
                ${whereSql}
                ORDER BY recorded_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;
            const rows = await query(dataSql, [...params, limit, offset]);

            return NextResponse.json({
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
            });
        } catch (err: unknown) {
            return NextResponse.json({ data: [], error: err instanceof Error ? err.message : 'Database error' }, { status: 500 });
        }
    }

    if (type === 'connections') {
        try {
            const offset = (Math.max(1, page) - 1) * limit;
            const whereClauses: string[] = [];
            const params: (string | number)[] = [];

            if (deviceId !== undefined) {
                params.push(deviceId);
                whereClauses.push(`device_id = $${params.length}`);
            }

            if (companyId !== undefined) {
                params.push(companyId);
                whereClauses.push(`device_id IN (SELECT device_id FROM m_device WHERE company_id = $${params.length})`);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const countSql = `SELECT COUNT(*) as count FROM h_connection_log ${whereSql}`;
            const countRows = await query<{ count: string }>(countSql, params);
            const totalRows = parseInt(countRows[0]?.count ?? '0', 10);
            const totalPages = Math.ceil(totalRows / limit) || 1;

            const dataSql = `
                SELECT h_connection_log_id, device_id, connection_type, remote_addr, local_addr, connected_at, disconnected_at
                FROM h_connection_log
                ${whereSql}
                ORDER BY connected_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}
            `;
            const rows = await query(dataSql, [...params, limit, offset]);

            return NextResponse.json({
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
            });
        } catch (err: unknown) {
            return NextResponse.json({ data: [], error: err instanceof Error ? err.message : 'Database error' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'Invalid log type' }, { status: 400 });
}
