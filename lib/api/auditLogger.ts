import { query } from '@/lib/dbClient';
import type { PaginatedResult } from '@/lib/api/commands';

export interface AuditLog {
    h_audit_log_id: number;
    user_id?: number | null;
    user_email?: string | null;
    company_id?: number | null;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    details?: Record<string, unknown> | null;
    ip_address?: string | null;
    created_at: string;
}

export interface RecordAuditParams {
    userId?: number | null;
    userEmail?: string | null;
    companyId?: number | null;
    action: string;
    resourceType: string;
    resourceId?: string | number | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
}

/**
 * Safely record an immutable audit log entry into h_audit_log table.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<boolean> {
    try {
        const sql = `
            INSERT INTO h_audit_log (
                user_id, user_email, company_id, action, resource_type, resource_id, details, ip_address, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `;

        const detailsJson = params.details ? JSON.stringify(params.details) : null;
        const resourceIdStr = params.resourceId !== undefined && params.resourceId !== null ? String(params.resourceId) : null;
        const ipStr = params.ipAddress || '127.0.0.1';

        await query(sql, [
            params.userId ?? null,
            params.userEmail ?? null,
            params.companyId ?? null,
            params.action,
            params.resourceType,
            resourceIdStr,
            detailsJson,
            ipStr,
        ]);

        return true;
    } catch (err) {
        console.error('[auditLogger] Failed to record audit log:', err);
        return false;
    }
}

/**
 * Fetch paginated audit logs with optional company filtering (Multi-Tenant RBAC)
 */
export async function getPaginatedAuditLogs(options: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    companyId?: number;
}): Promise<PaginatedResult<AuditLog>> {
    try {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.max(1, Math.min(100, options.limit ?? 10)); // Default 10 per page
        const offset = (page - 1) * limit;

        const whereClauses: string[] = [];
        const params: (string | number)[] = [];

        if (options.companyId !== undefined) {
            params.push(options.companyId);
            whereClauses.push(`company_id = $${params.length}`);
        }

        if (options.action) {
            params.push(options.action);
            whereClauses.push(`action = $${params.length}`);
        }

        if (options.search) {
            params.push(`%${options.search}%`);
            whereClauses.push(`(user_email ILIKE $${params.length} OR action ILIKE $${params.length} OR resource_type ILIKE $${params.length})`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total matching rows
        const countSql = `SELECT COUNT(*) as count FROM h_audit_log ${whereSql}`;
        const countRows = await query<{ count: string }>(countSql, params);
        const totalRows = parseInt(countRows[0]?.count ?? '0', 10);
        const totalPages = Math.ceil(totalRows / limit) || 1;

        // Fetch paginated rows
        const dataSql = `
            SELECT h_audit_log_id, user_id, user_email, company_id, action, resource_type, 
                   resource_id, details, ip_address, created_at
            FROM h_audit_log
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        const dataParams = [...params, limit, offset];
        const rows = await query<AuditLog>(dataSql, dataParams);

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
