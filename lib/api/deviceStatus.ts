// Device Status API - Uses v_device_current_status view
// Provides real-time status of all robots including position, battery, and mode
// Uses PostgreSQL via pg package
//
// Online detection uses GREATEST of multiple timestamps:
//   - h_state.recorded_at (robot mode changes)
//   - h_battery.recorded_at (battery telemetry)
//   - h_ws_traffic.recorded_at (WS message activity)
//   - h_connection_log.connected_at (WS connection events)

import { query } from '@/lib/dbClient';
import type { DeviceStatus, ApiResult } from '@/lib/types/database';

// Shared SQL fragment for computing status_updated_at from multiple sources
const STATUS_QUERY_BASE = `
    SELECT v.device_id, v.device_code, v.device_name, v.last_x, v.last_y, v.last_yaw,
            COALESCE(((hb.raw_payload->'data'->>'battery_percent')::numeric), v.battery_percent) AS battery_percent,
            ((hb.raw_payload->'data'->>'battery_level')::numeric) AS battery_level,
            v.robot_mode, v.robot_activity,
            GREATEST(
                COALESCE(v.status_updated_at, '1970-01-01'::timestamptz),
                COALESCE(hb.recorded_at, '1970-01-01'::timestamptz),
                COALESCE(hwt.recorded_at, '1970-01-01'::timestamptz),
                COALESCE(hcl.connected_at, '1970-01-01'::timestamptz)
            ) AS status_updated_at
    FROM v_device_current_status v
    LEFT JOIN LATERAL (
        SELECT raw_payload, recorded_at FROM h_battery WHERE device_id = v.device_id ORDER BY recorded_at DESC LIMIT 1
    ) hb ON true
    LEFT JOIN LATERAL (
        SELECT recorded_at FROM h_ws_traffic WHERE device_id = v.device_id ORDER BY recorded_at DESC LIMIT 1
    ) hwt ON true
    LEFT JOIN LATERAL (
        SELECT connected_at FROM h_connection_log WHERE device_id = v.device_id ORDER BY connected_at DESC LIMIT 1
    ) hcl ON true
`;

/**
 * Get all devices with their current status
 * Uses the v_device_current_status view which joins position, battery, and state
 */
export async function getAllDeviceStatus(companyId?: number): Promise<ApiResult<DeviceStatus[]>> {
    try {
        const sql = companyId
            ? `${STATUS_QUERY_BASE} WHERE v.device_id IN (SELECT device_id FROM m_device WHERE company_id = $1) ORDER BY v.device_code ASC`
            : `${STATUS_QUERY_BASE} ORDER BY v.device_code ASC`;
        const params = companyId ? [companyId] : undefined;
        const data = await query<DeviceStatus>(sql, params);

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
 * Get single device status by ID
 */
export async function getDeviceStatus(deviceId: number): Promise<ApiResult<DeviceStatus>> {
    try {
        const rows = await query<DeviceStatus>(
            `${STATUS_QUERY_BASE} WHERE v.device_id = $1`,
            [deviceId]
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
 * Get devices by mode (e.g., all MOVING robots)
 */
export async function getDevicesByMode(mode: string, companyId?: number): Promise<ApiResult<DeviceStatus[]>> {
    try {
        let sql = `${STATUS_QUERY_BASE} WHERE v.robot_mode = $1`;
        const params: (string | number)[] = [mode];

        if (companyId) {
            sql += ` AND v.device_id IN (SELECT device_id FROM m_device WHERE company_id = $2)`;
            params.push(companyId);
        }

        const data = await query<DeviceStatus>(sql, params);

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
 * Get devices with low battery (< 30%)
 */
export async function getLowBatteryDevices(companyId?: number): Promise<ApiResult<DeviceStatus[]>> {
    try {
        const sql = companyId
            ? `${STATUS_QUERY_BASE} WHERE v.battery_percent < 50 AND v.device_id IN (SELECT device_id FROM m_device WHERE company_id = $1)`
            : `${STATUS_QUERY_BASE} WHERE v.battery_percent < 50`;
        const params = companyId ? [companyId] : undefined;
        const data = await query<DeviceStatus>(sql, params);

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

// ============================================
// HEARTBEAT (Robot → Dashboard trigger)
// ============================================

export type HeartbeatInput = {
    device_code: string;
    robot_mode?: string;
    robot_activity?: string;
    battery_percent?: number;
    voltage?: number;
};

/**
 * Insert a heartbeat record for a robot.
 * This updates h_state (and optionally h_battery) so that
 * v_device_current_status.status_updated_at reflects the current time,
 * causing the robot to appear ONLINE on the dashboard.
 */
export async function insertHeartbeat(input: HeartbeatInput): Promise<ApiResult<{ device_id: number }>> {
    try {
        // 1. Lookup device_id from device_code
        const devices = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [input.device_code]
        );

        if (devices.length === 0) {
            return {
                data: null,
                error: `Device not found: ${input.device_code}`,
            };
        }

        const deviceId = devices[0].device_id;
        const mode = input.robot_mode ?? 'IDLE';
        const activity = input.robot_activity ?? 'heartbeat';

        // 2. Insert state record into h_state
        await query(
            `INSERT INTO h_state (device_id, robot_mode, robot_activity, is_emergency, recorded_at)
             VALUES ($1, $2, $3, false, NOW())`,
            [deviceId, mode, activity]
        );

        // 3. Optionally insert battery record into h_battery
        if (input.battery_percent !== undefined && input.battery_percent !== null) {
            await query(
                `INSERT INTO h_battery (device_id, battery_percent, voltage, recorded_at)
                 VALUES ($1, $2, $3, NOW())`,
                [deviceId, input.battery_percent, input.voltage ?? null]
            );
        }

        return {
            data: { device_id: deviceId },
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
