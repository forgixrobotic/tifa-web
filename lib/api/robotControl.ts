// Robot Control API - Server-side functions for robot navigation commands
// Uses m_goal, m_map, t_goal_queue tables + WebSocket client
// Command payload format matches h_command_log.command_payload in database

import { randomUUID } from 'crypto';
import { query, queryWithCount, transaction } from '@/lib/dbClient';
import { sendRobotCommand, getWsUiId, type RobotNavCommandPayload, type TeleopCommandPayload, type TeleopDoneCommandPayload, type MappingCommandPayload, type TalkCommandPayload, type MapSelectedCommandPayload, type MapDataCommandPayload } from '@/lib/wsClient';
import type { Goal, GoalQueue, ApiResult } from '@/lib/types/database';

// ============================================
// TYPES
// ============================================

export type SendToTableTaskInput = { goal_id: number; tray: number; };

export type SendToTableInput = {
    device_id: number;
    tasks: SendToTableTaskInput[];
    map_id: number;
    robot_id: string;    // e.g. "TFRB1" — from rbDevice.device_code
    origin_id: string;   // e.g. "TFWB_a3f8" — unique per browser session
    speed?: string;      // 'S' | 'F' | 'VF' — navigation speed level
};

export type SendToTableResult = {
    queue_id: number;
    ws_sent: boolean;
    ws_error?: string;
};

// ============================================
// ROBOT ONLINE CHECK
// ============================================

/**
 * Check if a robot is currently online by verifying its last status update.
 * A robot is considered online if it has reported status within the last 5 minutes
 * from any of these sources: h_state, h_battery, h_ws_traffic, h_connection_log.
 * 
 * @param robotId - The robot's device_code (e.g. "TFRB1")
 * @returns { online: boolean, deviceId: number | null, lastSeen: string | null }
 */
export async function isRobotOnline(robotId: string): Promise<{ online: boolean; deviceId: number | null; lastSeen: string | null }> {
    try {
        const rows = await query<{ device_id: number; status_updated_at: string | null }>(
            `SELECT d.device_id,
                    GREATEST(
                        COALESCE((SELECT recorded_at FROM h_state WHERE device_id = d.device_id ORDER BY recorded_at DESC LIMIT 1), '1970-01-01'::timestamptz),
                        COALESCE((SELECT recorded_at FROM h_battery WHERE device_id = d.device_id ORDER BY recorded_at DESC LIMIT 1), '1970-01-01'::timestamptz),
                        COALESCE((SELECT recorded_at FROM h_ws_traffic WHERE device_id = d.device_id ORDER BY recorded_at DESC LIMIT 1), '1970-01-01'::timestamptz),
                        COALESCE((SELECT connected_at FROM h_connection_log WHERE device_id = d.device_id ORDER BY connected_at DESC LIMIT 1), '1970-01-01'::timestamptz)
                    ) AS status_updated_at
             FROM m_device d
             WHERE d.device_code = $1
             LIMIT 1`,
            [robotId]
        );

        if (rows.length === 0) {
            return { online: false, deviceId: null, lastSeen: null };
        }

        const { device_id, status_updated_at } = rows[0];
        if (!status_updated_at) {
            return { online: false, deviceId: device_id, lastSeen: null };
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const lastUpdate = new Date(status_updated_at);
        const isOnline = lastUpdate > fiveMinutesAgo;

        return { online: isOnline, deviceId: device_id, lastSeen: status_updated_at };
    } catch (err) {
        console.error('[robotControl] Failed to check robot online status:', err);
        // On error, allow the command through (fail-open) to avoid blocking operations
        return { online: true, deviceId: null, lastSeen: null };
    }
}

// ============================================
// GET TABLE GOALS
// ============================================

/**
 * Get all navigable goals for a specific map (TABLE + CUSTOM types)
 * These represent the destinations the robot can navigate to
 */
export async function getTableGoals(mapId: number): Promise<ApiResult<Goal[]>> {
    try {
        const data = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw, metadata, created_at
             FROM m_goal
             WHERE map_id = $1 AND goal_type IN ('TABLE', 'CUSTOM')
             ORDER BY goal_name ASC`,
            [mapId]
        );

        return { data, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Get ALL goals for a given map (all types: TABLE, HOME, CHARGE, CUSTOM)
 */
export async function getAllGoalsForMap(mapId: number): Promise<ApiResult<Goal[]>> {
    try {
        const data = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw, metadata, created_at
             FROM m_goal
             WHERE map_id = $1
             ORDER BY goal_type ASC, goal_name ASC`,
            [mapId]
        );

        return { data, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// SEND ROBOT TO TABLE
// ============================================

/**
 * Send robot to a specific table:
 * 1. Validate goal exists and is a TABLE type
 * 2. Fetch home_base goal for the map
 * 3. Build command payload matching database format
 * 4. Insert command into t_goal_queue
 * 5. Send command via WebSocket
 * 6. Log command in h_command_log
 */
export async function sendRobotToTable(input: SendToTableInput): Promise<ApiResult<SendToTableResult>> {
    const { device_id, tasks, map_id, robot_id } = input;

    if (!tasks || tasks.length === 0) {
        return { data: null, error: 'At least one task must be provided' };
    }

    // Validate tray (1-3)
    for (const task of tasks) {
        if (task.tray < 1 || task.tray > 3) {
            return { data: null, error: `Tray must be between 1 and 3 (got ${task.tray})` };
        }
    }

    try {
        const goalIds = tasks.map(t => t.goal_id);
        const placeholders = goalIds.map((_, i) => `$${i + 1}`).join(', ');

        // 1. Fetch goals to validate
        const goalRows = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw
             FROM m_goal
             WHERE goal_id IN (${placeholders})`,
            goalIds
        );

        const goalMap = new Map<number, Goal>();
        goalRows.forEach(g => goalMap.set(g.goal_id, g));

        for (const task of tasks) {
            if (!goalMap.has(task.goal_id)) {
                return { data: null, error: `Goal with id ${task.goal_id} not found` };
            }
        }

        // 2. Fetch HOME goal for home_base (default to 0,0,0 if not found)
        const homeRows = await query<Goal>(
            `SELECT x, y, yaw FROM m_goal
             WHERE map_id = $1 AND goal_type = 'HOME'
             LIMIT 1`,
            [map_id]
        );
        const homeBase = homeRows[0]
            ? { x: homeRows[0].x ?? 0, y: homeRows[0].y ?? 0, yaw: homeRows[0].yaw ?? 0 }
            : { x: 0, y: 0, yaw: 0 };

        // 3. Build command payload (matching database h_command_log format exactly)
        const messageId = randomUUID();
        const timestamp = new Date().toISOString();

        const commandPayload: RobotNavCommandPayload = {
            code: 'OP',
            data: {
                type: 'OP',
                map_id: String(map_id),
                robot_id: robot_id,
                home_base: homeBase,
                tray_tasks: tasks.map(task => {
                    const goal = goalMap.get(task.goal_id)!;
                    return {
                        dest: {
                            x: Number(goal.x ?? 0),
                            y: Number(goal.y ?? 0),
                            yaw: Number(goal.yaw ?? 0),
                        },
                        tray: Number(task.tray),
                        goal_id: Number(task.goal_id),
                    };
                }),
                reqested_by: 1, // hardcode to 1 to exactly match PM's working payload instead of device_id
            },
            origin: 'UI',
            origin_id: input.origin_id, // unique per browser session
            timestamp,
            message_id: messageId,
        };

        // 4. Atomic transaction: insert goal_queue → WS send → rollback on WS failure
        const queueCode = `OP-${device_id}-${Date.now()}`;

        const { queueId, wsResult } = await transaction(async (client) => {
            // a. Insert t_goal_queue (QUEUED)
            const insertResult = await client.query<{ goal_queue_id: number }>(
                `INSERT INTO t_goal_queue (queue_code, map_id, device_id, priority, retry_count, status, payload, created_at)
                 VALUES ($1, $2, $3, 1, 0, 'QUEUED', $4, NOW())
                 RETURNING goal_queue_id`,
                [queueCode, map_id, device_id, JSON.stringify(commandPayload)]
            );

            const qId = insertResult.rows[0]?.goal_queue_id;
            if (!qId) {
                throw new Error('Failed to insert goal queue');
            }

            // b. Send WebSocket command to robot
            const wResult = await sendRobotCommand(commandPayload);

            // c. If WS failed → rollback entire transaction (prevent ghost QUEUED)
            if (!wResult.sent) {
                throw new Error(`WebSocket send failed: ${wResult.error ?? 'connection not available'}`);
            }

            // d. Log command in h_command_log (only if WS succeeded)
            await client.query(
                `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [device_id, 'OP', JSON.stringify(commandPayload), 'SENT',
                 `Robot sent to ${tasks.length} destinations`]
            );

            return { queueId: qId, wsResult: wResult };
        });

        return {
            data: {
                queue_id: queueId,
                ws_sent: wsResult.sent,
                ws_error: wsResult.error,
            },
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// SEND ROBOT TO HOMEBASE / CHARGING (MOVE)
// ============================================

export type SendToMoveInput = {
    device_id: number;
    goal_id: number;
    goal_type: 'HOMEBASE' | 'CHARGING';
    map_id: number;
    robot_id: string;    // e.g. "TFRB1"
    origin_id: string;   // e.g. "TFWB_a3f8"
};

/**
 * Send robot a single MOVE command (e.g. for Homebase or Charging):
 * 1. Validate goal exists
 * 2. Fetch home_base goal for the map
 * 3. Build MOVE command payload
 * 4. Insert command into t_goal_queue
 * 5. Send command via WebSocket
 * 6. Log command in h_command_log
 */
export async function sendRobotToMove(input: SendToMoveInput): Promise<ApiResult<SendToTableResult>> {
    const { device_id, goal_id, goal_type, map_id, robot_id } = input;

    try {
        // 1. Fetch the target goal
        const goalRows = await query<Goal>(
            `SELECT goal_id, map_id, goal_code, goal_name, goal_type, x, y, yaw
             FROM m_goal
             WHERE goal_id = $1`,
            [goal_id]
        );
        const targetGoal = goalRows[0];
        if (!targetGoal) {
            return { data: null, error: `Goal with id ${goal_id} not found` };
        }

        // 2. Fetch HOME goal for home_base reference
        const homeRows = await query<Goal>(
            `SELECT x, y, yaw FROM m_goal
             WHERE map_id = $1 AND goal_type = 'HOME'
             LIMIT 1`,
            [map_id]
        );
        const homeBase = homeRows[0]
            ? { x: homeRows[0].x ?? 0, y: homeRows[0].y ?? 0, yaw: homeRows[0].yaw ?? 0 }
            : { x: 0, y: 0, yaw: 0 };

        // 3. Build command payload (matches RobotMoveCommandPayload)
        const messageId = randomUUID();
        const timestamp = new Date().toISOString();

        const commandPayload = {
            code: 'MOVE' as const,
            data: {
                type: goal_type,
                robot_id: robot_id,
                dest: {
                    x: Number(targetGoal.x ?? 0),
                    y: Number(targetGoal.y ?? 0),
                    yaw: Number(targetGoal.yaw ?? 0),
                },
                sequence: Number(goal_id),
                home_base: homeBase,
            },
            origin: 'UI' as const,
            origin_id: input.origin_id, // unique per browser session
            timestamp,
            message_id: messageId,
        };

        // 4. Atomic transaction: insert goal_queue → WS send → rollback on WS failure
        const queueCode = `MOVE-${device_id}-${Date.now()}`;

        const { queueId, wsResult } = await transaction(async (client) => {
            const insertResult = await client.query<{ goal_queue_id: number }>(
                `INSERT INTO t_goal_queue (queue_code, map_id, device_id, priority, retry_count, status, payload, created_at)
                 VALUES ($1, $2, $3, 1, 0, 'QUEUED', $4, NOW())
                 RETURNING goal_queue_id`,
                [queueCode, map_id, device_id, JSON.stringify(commandPayload)]
            );

            const qId = insertResult.rows[0]?.goal_queue_id;
            if (!qId) throw new Error('Failed to insert goal queue');

            const wResult = await sendRobotCommand(commandPayload);
            if (!wResult.sent) {
                throw new Error(`WebSocket send failed: ${wResult.error ?? 'connection not available'}`);
            }

            await client.query(
                `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [device_id, 'MOVE', JSON.stringify(commandPayload), 'SENT',
                 `Robot MOVE command sent to ${goal_type}`]
            );

            return { queueId: qId, wsResult: wResult };
        });

        return {
            data: {
                queue_id: queueId,
                ws_sent: wsResult.sent,
                ws_error: wsResult.error,
            },
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// ACTIVE ROBOT TASKS (today only, auto-reset daily)
// ============================================

/**
 * Auto-reset: mark old QUEUED/IN_PROGRESS tasks from previous days as CANCELLED.
 * This runs before fetching active tasks to ensure daily reset.
 */
async function resetOldTasks(deviceId: number): Promise<number> {
    try {
        const result = await queryWithCount(
            `UPDATE t_goal_queue
             SET status = 'CANCELLED',
                 fail_reason = 'Auto-cancelled: daily reset',
                 finished_at = NOW()
             WHERE device_id = $1
               AND status IN ('QUEUED', 'IN_PROGRESS')
               AND created_at < CURRENT_DATE`,
            [deviceId]
        );
        return result.rowCount ?? 0;
    } catch {
        return 0;
    }
}

/**
 * Get active tasks for today only (QUEUED or IN_PROGRESS, created today).
 * Old tasks are auto-cancelled before fetching.
 */
export async function getActiveRobotTasks(deviceId: number): Promise<ApiResult<GoalQueue[]>> {
    try {
        // Auto-reset old tasks from previous days
        await resetOldTasks(deviceId);

        const data = await query<GoalQueue>(
            `SELECT goal_queue_id, queue_code, map_id, device_id, requested_by, priority,
                    retry_count, status, fail_reason, created_at, started_at, finished_at, payload
             FROM t_goal_queue
             WHERE device_id = $1
               AND status IN ('QUEUED', 'IN_PROGRESS')
               AND created_at >= CURRENT_DATE
             ORDER BY created_at DESC`,
            [deviceId]
        );

        return { data, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Manually mark a task as DONE.
 * - QUEUED: allowed (command stuck, manual override / cleanup)
 * - IN_PROGRESS: allowed but validates robot is IDLE first
 * - DONE/FAILED/CANCELLED: rejected (already finished)
 */
export async function markTaskAsDone(goalQueueId: number): Promise<ApiResult<boolean>> {
    try {
        const queueRows = await query<{ device_id: number; status: string }>(
            `SELECT device_id, status FROM t_goal_queue WHERE goal_queue_id = $1`,
            [goalQueueId]
        );

        if (queueRows.length === 0) {
            return { data: null, error: 'Task not found' };
        }

        const { device_id, status } = queueRows[0];

        // Reject only tasks that are already finalized
        if (status === 'DONE' || status === 'FAILED' || status === 'CANCELLED') {
            return { data: null, error: `Task sudah berstatus '${status}', tidak bisa diubah lagi` };
        }

        // Validate robot state: check h_state for all non-final statuses
        const stateRows = await query<{ robot_mode: string; recorded_at: string }>(
            `SELECT robot_mode, recorded_at
             FROM h_state WHERE device_id = $1
             ORDER BY recorded_at DESC LIMIT 1`,
            [device_id]
        );

        if (status === 'QUEUED') {
            // Task baru (< 30 detik) — blokir, belum sempat diproses robot
            const ageRows = await query<{ created_at: string }>(
                `SELECT created_at FROM t_goal_queue WHERE goal_queue_id = $1`, [goalQueueId]
            );
            if (ageRows.length > 0) {
                const ageSeconds = (Date.now() - new Date(ageRows[0].created_at).getTime()) / 1000;
                if (ageSeconds < 30) {
                    return { data: null, error: `Task baru ${Math.round(ageSeconds)} detik. Tunggu robot memproses.` };
                }
            }
            // Task >= 30 detik — cek status robot
            if (stateRows.length > 0) {
                const { robot_mode } = stateRows[0];
                if (robot_mode !== 'IDLE') {
                    return { data: null, error: `Task QUEUED tapi robot masih '${robot_mode}'. Tunggu IDLE.` };
                }
            }
            // Robot offline / IDLE — izinkan cleanup manual
        } else if (status === 'IN_PROGRESS') {
            if (stateRows.length > 0) {
                const { robot_mode, recorded_at } = stateRows[0];
                const secondsSinceUpdate = (Date.now() - new Date(recorded_at).getTime()) / 1000;

                if (robot_mode !== 'IDLE') {
                    return { data: null, error: `Robot masih '${robot_mode}', tunggu IDLE` };
                }
                if (secondsSinceUpdate > 60) {
                    return { data: null, error: `Data robot basi ${Math.round(secondsSinceUpdate)} detik` };
                }
            }
        }

        await query(
            `UPDATE t_goal_queue SET status = 'DONE', finished_at = NOW() WHERE goal_queue_id = $1`,
            [goalQueueId]
        );
        return { data: true, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// TASK HISTORY
// ============================================

export type TaskHistoryItem = GoalQueue & {
    day_label?: string; // e.g. "2026-03-06"
};

/**
 * Get task history for a device (DONE, FAILED, CANCELLED tasks).
 * Returns tasks from the last 7 days, ordered by most recent first.
 * Includes today's completed tasks + all past tasks.
 */
export async function getTaskHistory(deviceId: number, days: number = 7): Promise<ApiResult<TaskHistoryItem[]>> {
    try {
        const data = await query<TaskHistoryItem>(
            `SELECT goal_queue_id, queue_code, map_id, device_id, requested_by, priority,
                    retry_count, status, fail_reason, created_at, started_at, finished_at, payload,
                    TO_CHAR(created_at, 'YYYY-MM-DD') as day_label
             FROM t_goal_queue
             WHERE device_id = $1
               AND (status IN ('DONE', 'FAILED', 'CANCELLED')
                    OR (status IN ('QUEUED', 'IN_PROGRESS') AND created_at < CURRENT_DATE))
               AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
             ORDER BY created_at DESC
             LIMIT 50`,
            [deviceId]
        );

        return { data, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// TELEOP COMMAND LOGGING (h_command_log)
// ============================================

/**
 * Log a TELEOP command to h_command_log.
 * PM confirmed: teleop payloads go into h_command_log table.
 */
export async function logTeleopToCommandLog(
    payload: TeleopCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    try {
        // Look up the device_id from device_code (robot_id e.g. "TFRB1")
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        const deviceId = deviceRows[0]?.device_id ?? null;

        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                'TELEOP',
                JSON.stringify(payload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Teleop command sent (speed: ${payload.data.speed})`
                    : `Teleop command queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );
    } catch (err) {
        console.error('[robotControl] Failed to log TELEOP to h_command_log:', err);
    }
}

/**
 * Log a TELEOP_DONE command to h_command_log.
 * PM confirmed: teleop done payloads go into h_command_log table.
 */
export async function logTeleopDoneToCommandLog(
    payload: TeleopDoneCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    try {
        // Look up the device_id from device_code (robot_id e.g. "TFRB1")
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        const deviceId = deviceRows[0]?.device_id ?? null;

        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                'TELEOP_DONE',
                JSON.stringify(payload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Teleop done: ${payload.data.status}`
                    : `Teleop done queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );
    } catch (err) {
        console.error('[robotControl] Failed to log TELEOP_DONE to h_command_log:', err);
    }
}

// ============================================
// SET ACTIVE MAP FOR DEVICE
// ============================================

/**
 * Set the active map for a device (updates active_map_id in m_device).
 * Also updates the paired device (RB <-> UI_TIFA) so both stay in sync.
 */
export async function setActiveMap(deviceId: number, mapId: number): Promise<ApiResult<boolean>> {
    try {
        // 1. Validate the map exists
        const mapRows = await query<{ map_id: number }>(
            `SELECT map_id FROM m_map WHERE map_id = $1`,
            [mapId]
        );
        if (mapRows.length === 0) {
            return { data: null, error: `Map with id ${mapId} not found` };
        }

        // 2. Get the device code to find paired device
        const deviceRows = await query<{ device_id: number; device_code: string }>(
            `SELECT device_id, device_code FROM m_device WHERE device_id = $1`,
            [deviceId]
        );
        if (deviceRows.length === 0) {
            return { data: null, error: `Device with id ${deviceId} not found` };
        }

        const deviceCode = deviceRows[0].device_code;
        const deviceIdsToUpdate: number[] = [deviceId];

        // 3. Find paired device (TFUI1 <-> TFRB1, RB001 <-> UI_TIFA_001)
        let pairedCode: string | null = null;
        const rbMatch = deviceCode.match(/^RB(\d+)$/i);
        const uiMatch = deviceCode.match(/^UI_TIFA_(\d+)$/i);
        const tfrbMatch = deviceCode.match(/^TFRB(\d+)$/i);
        const tfuiMatch = deviceCode.match(/^TFUI(\d+)$/i);

        if (tfrbMatch) {
            pairedCode = `TFUI${tfrbMatch[1]}`;
        } else if (tfuiMatch) {
            pairedCode = `TFRB${tfuiMatch[1]}`;
        } else if (rbMatch) {
            pairedCode = `UI_TIFA_${rbMatch[1]}`;
        } else if (uiMatch) {
            pairedCode = `RB${uiMatch[1]}`;
        }

        if (pairedCode) {
            const pairedRows = await query<{ device_id: number }>(
                `SELECT device_id FROM m_device WHERE device_code = $1`,
                [pairedCode]
            );
            if (pairedRows.length > 0) {
                deviceIdsToUpdate.push(pairedRows[0].device_id);
            }
        }

        // 4. Update active_map_id for all related devices
        const placeholders = deviceIdsToUpdate.map((_, i) => `$${i + 2}`).join(', ');
        await query(
            `UPDATE m_device SET active_map_id = $1, updated_at = NOW() WHERE device_id IN (${placeholders})`,
            [mapId, ...deviceIdsToUpdate]
        );

        return { data: true, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

// ============================================
// LIVE MAPPING COMMANDS
// ============================================

export async function sendMappingCommand(payload: MappingCommandPayload): Promise<ApiResult<{ ws: boolean; ws_error?: string | null }>> {
    try {
        let wsSent = false;
        let wsError: string | null = null;
        try {
            const wsRes = await sendRobotCommand(payload);
            wsSent = wsRes.sent;
            if (wsRes.error) wsError = wsRes.error;
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown WS error';
            wsError = errorMsg;
            console.error('[robotControl] Failed to send MAPPING command over WS:', err);
        }

        return { data: { ws: wsSent, ws_error: wsError }, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Server error' };
    }
}

/**
 * Log a MAPPING command to h_command_log.
 */
export async function logMappingToCommandLog(
    payload: MappingCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    // Look up the device_id from device_code (robot_id e.g. "TFRB1")
    let deviceId: number | null = null;
    try {
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        deviceId = deviceRows[0]?.device_id ?? null;
    } catch (err) {
        console.error(`[robotControl] Failed to lookup device for ${payload.data.robot_id}:`, err);
    }

    // Insert into h_command_log
    try {
        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                'MAPPING',
                JSON.stringify(payload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Mapping command sent: ${payload.code}`
                    : `Mapping command queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );
    } catch (err) {
        console.error(`[robotControl] Failed to log ${payload.code} to h_command_log:`, err);
    }

    // PM Requirement: ALSO insert MAPPING events into h_ws_traffic
    try {
        await query(
            `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
             VALUES ($1, 'OUT', $2, $3, '127.0.0.1', NOW())`,
            [deviceId, payload.code, JSON.stringify(payload)]
        );
        console.log(`[robotControl] ✅ ${payload.code} logged to h_ws_traffic (device_id=${deviceId})`);
    } catch (err) {
        console.error(`[robotControl] Failed to log ${payload.code} to h_ws_traffic:`, err);
    }
}

/**
 * Log a TALK command to h_command_log and h_ws_traffic.
 */
export async function logTalkToCommandLog(
    payload: TalkCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    try {
        // Look up the device_id from device_code (robot_id e.g. "TFRB1")
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        const deviceId = deviceRows[0]?.device_id ?? null;

        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                payload.code, // "CONTROL"
                JSON.stringify(payload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Talk command sent: ${payload.data.action}`
                    : `Talk command queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );

        // Also insert into h_ws_traffic
        await query(
            `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
             VALUES ($1, 'OUT', $2, $3, '127.0.0.1', NOW())`,
            [deviceId, payload.code, JSON.stringify(payload)]
        );
    } catch (err) {
        console.error('[robotControl] Failed to log TALK to h_command_log:', err);
    }
}

// ============================================
// MAP SELECTED COMMAND
// ============================================

/**
 * Send MAP_SELECTED command to robot via WebSocket.
 * Notifies the robot which map is now active so it can load the correct map data.
 */
export async function sendMapSelectedCommand(payload: MapSelectedCommandPayload): Promise<ApiResult<{ ws: boolean; ws_error?: string | null }>> {
    try {
        let wsSent = false;
        let wsError: string | null = null;
        try {
            const wsRes = await sendRobotCommand(payload);
            wsSent = wsRes.sent;
            if (wsRes.error) wsError = wsRes.error;
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown WS error';
            wsError = errorMsg;
            console.error('[robotControl] Failed to send MAP_SELECTED over WS:', err);
        }

        return { data: { ws: wsSent, ws_error: wsError }, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Server error' };
    }
}

/**
 * Log a MAP_SELECTED command to h_command_log and h_ws_traffic.
 */
export async function logMapSelectedToCommandLog(
    payload: MapSelectedCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    try {
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        const deviceId = deviceRows[0]?.device_id ?? null;

        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                'MAP_SELECTED',
                JSON.stringify(payload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Map selected: map_id=${payload.data.map_id}`
                    : `Map selected queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );

        // Also insert into h_ws_traffic
        await query(
            `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
             VALUES ($1, 'OUT', $2, $3, '127.0.0.1', NOW())`,
            [deviceId, 'MAP_SELECTED', JSON.stringify(payload)]
        );
    } catch (err) {
        console.error('[robotControl] Failed to log MAP_SELECTED to h_command_log:', err);
    }
}

// ============================================
// MAP DATA COMMAND
// ============================================

/**
 * Send MAP_DATA command to robot via WebSocket.
 * Contains the actual base64 encoded zip file of the map.
 */
export async function sendMapDataCommand(payload: MapDataCommandPayload): Promise<ApiResult<{ ws: boolean; ws_error?: string | null }>> {
    try {
        let wsSent = false;
        let wsError: string | null = null;
        try {
            const wsRes = await sendRobotCommand(payload);
            wsSent = wsRes.sent;
            if (wsRes.error) wsError = wsRes.error;
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown WS error';
            wsError = errorMsg;
            console.error('[robotControl] Failed to send MAP_DATA over WS:', err);
        }

        return { data: { ws: wsSent, ws_error: wsError }, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Server error' };
    }
}

/**
 * Log a MAP_DATA command to h_command_log and h_ws_traffic.
 * We truncate the payload string in the DB to avoid saving massive base64 strings in logs.
 */
export async function logMapDataToCommandLog(
    payload: MapDataCommandPayload,
    wsSent: boolean,
    wsError?: string
): Promise<void> {
    try {
        const deviceRows = await query<{ device_id: number }>(
            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
            [payload.data.robot_id]
        );
        const deviceId = deviceRows[0]?.device_id ?? null;

        // Truncate payload for logging
        const logPayload = {
            ...payload,
            data: {
                ...payload.data,
                payload: payload.data.payload ? `${payload.data.payload.substring(0, 50)}...[TRUNCATED]` : ''
            }
        };

        await query(
            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
                deviceId,
                'MAP_DATA',
                JSON.stringify(logPayload),
                wsSent ? 'SENT' : 'QUEUED',
                wsSent
                    ? `Map data sent: map_id=${payload.data.map_id}`
                    : `Map data queued - WS not connected: ${wsError ?? 'unknown'}`,
            ]
        );

        // Also insert into h_ws_traffic
        await query(
            `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
             VALUES ($1, 'OUT', $2, $3, '127.0.0.1', NOW())`,
            [deviceId, 'MAP_DATA', JSON.stringify(logPayload)]
        );
    } catch (err) {
        console.error('[robotControl] Failed to log MAP_DATA to h_command_log:', err);
    }
}
