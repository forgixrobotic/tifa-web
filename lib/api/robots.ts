// Robot API - Abstraction layer for robot/device operations
// Uses PostgreSQL via pg package

import { query } from '@/lib/dbClient';
import type { Robot, DeviceInfo, CreateRobotInput, UpdateRobotInput, ApiResult } from '@/lib/types/database';

// Removed ALLOWED_DEVICE_CODES filtering so all registered devices appear

/**
 * Get all robots with optional search filter
 */
export async function getRobots(search?: string): Promise<ApiResult<Robot[]>> {
    try {
        const params: (string | number)[] = [];

        let sql = `
            SELECT device_id, device_name, device_code, company_id, active_map_id, 
                   robot_local_ip, robot_local_ssid, created_at, updated_at
            FROM m_device
            WHERE 1=1
        `;

        if (search?.trim()) {
            sql += ` AND (device_name ILIKE $1 OR device_code ILIKE $1)`;
            params.push(`%${search.trim()}%`);
        }

        sql += ` ORDER BY created_at DESC`;

        const data = await query<Robot>(sql, params);

        // Override device_name for TFUI1 for UI display
        const transformedData = data.map(robot => ({
            ...robot,
            device_name: robot.device_code === 'TFUI1' ? 'TIFA' : robot.device_name
        }));

        return {
            data: transformedData,
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
 * Get single robot by ID
 */
export async function getRobotById(id: number): Promise<ApiResult<DeviceInfo>> {
    try {
        const rows = await query<DeviceInfo>(
            `SELECT device_id, device_name, device_code, company_id, active_map_id, 
                    robot_local_ip, robot_local_ssid
             FROM m_device
             WHERE device_id = $1`,
            [id]
        );

        const device = rows[0] ?? null;

        // Override device_name for TFUI1 for UI display
        if (device && device.device_code === 'TFUI1') {
            device.device_name = 'TIFA';
        }

        return {
            data: device,
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
 * Get recent robots (limited)
 */
export async function getRecentRobots(limit: number = 5): Promise<ApiResult<Robot[]>> {
    try {
        const data = await query<Robot>(
            `SELECT device_id, device_name, device_code, robot_local_ip, robot_local_ssid, 
                    company_id, active_map_id, created_at, updated_at
             FROM m_device
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );

        // Override device_name for TFUI1 for UI display
        const transformedData = data.map(robot => ({
            ...robot,
            device_name: robot.device_code === 'TFUI1' ? 'TIFA' : robot.device_name
        }));

        return {
            data: transformedData,
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
 * Create a new robot
 */
export async function createRobot(input: CreateRobotInput): Promise<ApiResult<{ device_id: number }>> {
    try {
        const rows = await query<{ device_id: number }>(
            `INSERT INTO m_device (device_name, device_code, robot_local_ip, robot_local_ssid)
             VALUES ($1, $2, $3, $4)
             RETURNING device_id`,
            [
                input.device_name,
                input.device_code,
                input.robot_local_ip || null,
                input.robot_local_ssid || null,
            ]
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
 * Update an existing robot
 */
export async function updateRobot(id: number, input: UpdateRobotInput): Promise<ApiResult<null>> {
    try {
        await query(
            `UPDATE m_device 
             SET device_name = COALESCE($1, device_name),
                 device_code = COALESCE($2, device_code),
                 robot_local_ip = COALESCE($3, robot_local_ip),
                 robot_local_ssid = COALESCE($4, robot_local_ssid),
                 updated_at = NOW()
             WHERE device_id = $5`,
            [
                input.device_name,
                input.device_code,
                input.robot_local_ip,
                input.robot_local_ssid,
                id,
            ]
        );

        return {
            data: null,
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
 * Delete a robot
 */
export async function deleteRobot(id: number): Promise<ApiResult<null>> {
    try {
        await query(
            `DELETE FROM m_device WHERE device_id = $1`,
            [id]
        );

        return {
            data: null,
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
 * Count total robots (only whitelisted fleet)
 */
export async function getRobotCount(): Promise<ApiResult<number>> {
    try {
        const rows = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM m_device`
        );

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
