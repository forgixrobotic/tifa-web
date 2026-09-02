// Goals API - Abstraction layer for goal operations
// Matches m_goal and t_goal_queue tables from tifa_dump.sql
// Uses PostgreSQL via pg package

import { query } from '@/lib/dbClient';
import type { Goal, GoalQueue, ApiResult } from '@/lib/types/database';

/**
 * Get all goals for a specific map
 */
export async function getGoalsByMap(mapId: number): Promise<ApiResult<Goal[]>> {
    try {
        const data = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw, metadata, created_at
             FROM m_goal
             WHERE map_id = $1
             ORDER BY goal_name ASC`,
            [mapId]
        );

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
 * Get single goal by ID
 */
export async function getGoalById(goalId: number): Promise<ApiResult<Goal>> {
    try {
        const rows = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw, metadata, created_at
             FROM m_goal
             WHERE goal_id = $1`,
            [goalId]
        );

        return {
            data: rows[0] ?? null,
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
 * Get goal queue for a device
 */
export async function getGoalQueue(deviceId: number): Promise<ApiResult<GoalQueue[]>> {
    try {
        const data = await query<GoalQueue>(
            `SELECT goal_queue_id, queue_code, map_id, device_id, requested_by, priority,
                    retry_count, status, fail_reason, created_at, started_at, finished_at, payload
             FROM t_goal_queue
             WHERE device_id = $1
             ORDER BY priority ASC, created_at ASC`,
            [deviceId]
        );

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
 * Get active goal queues (QUEUED or IN_PROGRESS)
 */
export async function getActiveGoalQueues(companyId?: number): Promise<ApiResult<GoalQueue[]>> {
    try {
        let sql = `SELECT goal_queue_id, queue_code, map_id, device_id, requested_by, priority,
                    retry_count, status, fail_reason, created_at, started_at, finished_at, payload
             FROM t_goal_queue
             WHERE status IN ('QUEUED', 'IN_PROGRESS')`;
        const params: number[] = [];

        if (companyId) {
            sql += ` AND device_id IN (SELECT device_id FROM m_device WHERE company_id = $1)`;
            params.push(companyId);
        }

        sql += ` ORDER BY priority ASC`;

        const data = await query<GoalQueue>(sql, params.length > 0 ? params : undefined);

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
 * Count goals by type
 */
export async function countGoalsByType(companyId?: number): Promise<ApiResult<Record<string, number>>> {
    try {
        let sql = `SELECT g.goal_type FROM m_goal g`;
        const params: number[] = [];

        if (companyId) {
            sql += ` JOIN m_map m ON g.map_id = m.map_id WHERE m.company_id = $1`;
            params.push(companyId);
        }

        const data = await query<{ goal_type: string }>(sql, params.length > 0 ? params : undefined);

        const counts: Record<string, number> = {
            TABLE: 0,
            CHARGE: 0,
            HOME: 0,
            CUSTOM: 0,
        };

        data.forEach((item) => {
            if (item.goal_type && item.goal_type in counts) {
                counts[item.goal_type]++;
            }
        });

        return {
            data: counts,
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
 * Create a new goal for a map
 */
export async function createGoal(
    mapId: number | null,
    goalName: string,
    goalCode: string,
    goalType: string,
    x: number,
    y: number,
    yaw: number
): Promise<ApiResult<Goal>> {
    try {
        const result = await query<Goal>(
            `INSERT INTO m_goal (map_id, goal_name, goal_code, goal_type, x, y, yaw, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING *`,
            [mapId, goalName, goalCode || goalName, goalType || 'CUSTOM', x, y, yaw]
        );
        return { data: result[0], error: null };
    } catch (err: unknown) {
        return { data: null, error: (err as Error).message ?? 'Database error' };
    }
}

/**
 * Update an existing goal
 */
export async function updateGoal(
    goalId: number,
    goalName: string,
    goalCode: string,
    goalType: string,
    x: number,
    y: number,
    yaw: number
): Promise<ApiResult<Goal>> {
    try {
        const result = await query<Goal>(
            `UPDATE m_goal 
             SET goal_name = $1, goal_code = $2, goal_type = $3, x = $4, y = $5, yaw = $6
             WHERE goal_id = $7
             RETURNING *`,
            [goalName, goalCode || goalName, goalType || 'CUSTOM', x, y, yaw, goalId]
        );
        return { data: result[0], error: null };
    } catch (err: unknown) {
        return { data: null, error: (err as Error).message ?? 'Database error' };
    }
}

/**
 * Delete a goal (Hard Delete)
 */
export async function deleteGoal(goalId: number): Promise<ApiResult<{ deleted: boolean }>> {
    try {
        await query(`DELETE FROM m_goal WHERE goal_id = $1`, [goalId]);
        return { data: { deleted: true }, error: null };
    } catch (err: unknown) {
        return { data: null, error: (err as Error).message ?? 'Database error' };
    }
}
