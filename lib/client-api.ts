// Client-side API wrapper functions
// These functions call the Next.js API routes instead of accessing the database directly
// Safe to use in client components ("use client")

import type {
    Robot,
    DeviceInfo,
    DashboardStats,
    CommandLog,
    DeviceStatus,
    BatteryRow,
    BatteryBuckets,
    Position,
    RobotState,
    RobotMode,
    Goal,
    GoalQueue,
    Map,
    ActivityData,
    HourlyBatteryData,
    AuthUser,
    SignInResult,

    CreateRobotInput,
    UpdateRobotInput,
    ApiResult,
    ActivityLog,
    RobotSummary,
    SystemNotification,
    SentimentType,
    WsTraffic,
} from '@/lib/types/database';


const BASE_URL = '/api';

// ============================================
// ROBOT OPERATIONS
// ============================================

export async function getRobots(search?: string): Promise<ApiResult<Robot[]>> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const res = await fetch(`${BASE_URL}/robots?${params}`);
    return res.json();
}

export async function getRobotById(id: number): Promise<ApiResult<DeviceInfo>> {
    const res = await fetch(`${BASE_URL}/robots/${id}`);
    return res.json();
}

export async function getRecentRobots(limit: number = 5): Promise<ApiResult<Robot[]>> {
    const res = await fetch(`${BASE_URL}/robots?action=recent&limit=${limit}`);
    return res.json();
}

export async function getRobotCount(): Promise<ApiResult<number>> {
    const res = await fetch(`${BASE_URL}/robots?action=count`);
    return res.json();
}

export async function createRobot(input: CreateRobotInput): Promise<ApiResult<{ device_id: number }>> {
    const res = await fetch(`${BASE_URL}/robots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return res.json();
}

export async function updateRobot(id: number, input: UpdateRobotInput): Promise<ApiResult<null>> {
    const res = await fetch(`${BASE_URL}/robots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    return res.json();
}

export async function deleteRobot(id: number): Promise<ApiResult<null>> {
    const res = await fetch(`${BASE_URL}/robots/${id}`, {
        method: 'DELETE',
    });
    return res.json();
}

// ============================================
// DASHBOARD OPERATIONS
// ============================================

export async function getDashboardStats(): Promise<ApiResult<DashboardStats>> {
    const res = await fetch(`${BASE_URL}/dashboard`);
    return res.json();
}

// ============================================
// NOTIFICATION OPERATIONS
// ============================================

export async function getNotifications(filter?: string): Promise<ApiResult<CommandLog[]>> {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    const res = await fetch(`${BASE_URL}/notifications?${params}`);
    return res.json();
}

// ============================================
// DEVICE STATUS OPERATIONS
// ============================================

export async function getAllDeviceStatus(): Promise<ApiResult<DeviceStatus[]>> {
    const res = await fetch(`${BASE_URL}/device-status`);
    return res.json();
}

export async function getDeviceStatus(deviceId: number): Promise<ApiResult<DeviceStatus>> {
    const res = await fetch(`${BASE_URL}/device-status/${deviceId}`);
    return res.json();
}

export async function getDevicesByMode(mode: string): Promise<ApiResult<DeviceStatus[]>> {
    const res = await fetch(`${BASE_URL}/device-status?action=by-mode&mode=${mode}`);
    return res.json();
}

export async function getLowBatteryDevices(): Promise<ApiResult<DeviceStatus[]>> {
    const res = await fetch(`${BASE_URL}/device-status?action=low-battery`);
    return res.json();
}

// ============================================
// BATTERY OPERATIONS
// ============================================

export async function getBatteryHistory(deviceId: number, limit: number = 50): Promise<ApiResult<BatteryRow[]>> {
    const res = await fetch(`${BASE_URL}/battery?action=history&deviceId=${deviceId}&limit=${limit}`);
    return res.json();
}

export async function getLatestBatteries(limit: number = 200): Promise<ApiResult<BatteryRow[]>> {
    const res = await fetch(`${BASE_URL}/battery?limit=${limit}`);
    return res.json();
}

export async function getLatestBattery(deviceId: number): Promise<ApiResult<BatteryRow>> {
    const res = await fetch(`${BASE_URL}/battery?action=history&deviceId=${deviceId}&limit=1`);
    const result = await res.json();
    return { data: result.data?.[0] ?? null, error: result.error };
}

export async function getBatteryStats(): Promise<ApiResult<{ avgBattery: number | null; buckets: BatteryBuckets }>> {
    const res = await fetch(`${BASE_URL}/battery?action=stats`);
    return res.json();
}

// ============================================
// COMMAND OPERATIONS
// ============================================

export async function getCommandLogs(limit: number = 5, deviceId?: number): Promise<ApiResult<CommandLog[]>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (deviceId !== undefined) params.set('deviceId', deviceId.toString());
    const res = await fetch(`${BASE_URL}/commands?${params}`);
    return res.json();
}

export async function getErrorCount(): Promise<ApiResult<number>> {
    const res = await fetch(`${BASE_URL}/commands?action=error-count`);
    return res.json();
}

export async function getActivityData(deviceId: number, range: string = '1d'): Promise<ApiResult<ActivityData[]>> {
    const res = await fetch(`${BASE_URL}/commands?action=activity&deviceId=${deviceId}&range=${range}`);
    return res.json();
}

export async function getHourlyBatteryData(deviceId: number, range: string = '1d'): Promise<ApiResult<HourlyBatteryData[]>> {
    const res = await fetch(`${BASE_URL}/battery?action=hourly-battery&deviceId=${deviceId}&range=${range}`);
    return res.json();
}

// ============================================
// POSITION OPERATIONS
// ============================================

export async function getPositionHistory(deviceId: number, limit: number = 100): Promise<ApiResult<Position[]>> {
    const res = await fetch(`${BASE_URL}/position?action=history&deviceId=${deviceId}&limit=${limit}`);
    return res.json();
}

export async function getLatestPosition(deviceId: number): Promise<ApiResult<Position>> {
    const res = await fetch(`${BASE_URL}/position?action=latest&deviceId=${deviceId}`);
    return res.json();
}

export async function getAllLatestPositions(): Promise<ApiResult<Position[]>> {
    const res = await fetch(`${BASE_URL}/position?action=all-latest`);
    return res.json();
}

// ============================================
// STATE OPERATIONS
// ============================================

export async function getStateHistory(deviceId: number, limit: number = 50): Promise<ApiResult<RobotState[]>> {
    const res = await fetch(`${BASE_URL}/state?action=history&deviceId=${deviceId}&limit=${limit}`);
    return res.json();
}

export async function getLatestState(deviceId: number): Promise<ApiResult<RobotState>> {
    const res = await fetch(`${BASE_URL}/state?action=latest&deviceId=${deviceId}`);
    return res.json();
}

export async function getEmergencyDevices(): Promise<ApiResult<RobotState[]>> {
    const res = await fetch(`${BASE_URL}/state?action=emergency`);
    return res.json();
}

export async function countDevicesByMode(): Promise<ApiResult<Record<RobotMode, number>>> {
    const res = await fetch(`${BASE_URL}/state?action=count-by-mode`);
    return res.json();
}

// ============================================
// GOAL OPERATIONS
// ============================================

export async function getGoalsByMap(mapId: number): Promise<ApiResult<Goal[]>> {
    const res = await fetch(`${BASE_URL}/goals?action=by-map&mapId=${mapId}`);
    return res.json();
}

export async function getGoalById(goalId: number): Promise<ApiResult<Goal>> {
    const res = await fetch(`${BASE_URL}/goals/${goalId}`);
    return res.json();
}

export async function getGoalQueue(deviceId: number): Promise<ApiResult<GoalQueue[]>> {
    const res = await fetch(`${BASE_URL}/goals?action=queue&deviceId=${deviceId}`);
    return res.json();
}

export async function getActiveGoalQueues(): Promise<ApiResult<GoalQueue[]>> {
    const res = await fetch(`${BASE_URL}/goals?action=active-queues`);
    return res.json();
}

export async function countGoalsByType(): Promise<ApiResult<Record<string, number>>> {
    const res = await fetch(`${BASE_URL}/goals?action=count-by-type`);
    return res.json();
}

export async function createDestination(payload: Record<string, unknown>): Promise<ApiResult<Goal>> {
    const res = await fetch(`${BASE_URL}/goals?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}

export async function updateDestination(payload: Record<string, unknown>): Promise<ApiResult<Goal>> {
    const res = await fetch(`${BASE_URL}/goals?action=update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return res.json();
}

export async function deleteDestination(goalId: number): Promise<ApiResult<{ deleted: boolean }>> {
    const res = await fetch(`${BASE_URL}/goals?action=delete&id=${goalId}`, {
        method: 'DELETE',
    });
    return res.json();
}

// ============================================
// MAP OPERATIONS
// ============================================

export async function getAllMaps(): Promise<ApiResult<Map[]>> {
    const res = await fetch(`${BASE_URL}/maps`);
    const json = await res.json() as ApiResult<Map[]>;

    // Deduplicate maps with same name (ignoring spaces vs underscores)
    if (json.data && Array.isArray(json.data)) {
        const uniqueMap = new globalThis.Map<string, Map>();
        for (const m of json.data) {
            const normalizedName = m.map_name.replace(/ /g, '_').toLowerCase();
            if (!uniqueMap.has(normalizedName)) {
                uniqueMap.set(normalizedName, m);
            } else {
                const existing = uniqueMap.get(normalizedName)!;
                // Prefer maps with a valid floor (not '-') or newer maps
                if (existing.map_floor === '-' && m.map_floor !== '-') {
                    uniqueMap.set(normalizedName, m);
                } else if (existing.map_floor === m.map_floor && m.map_id > existing.map_id) {
                    uniqueMap.set(normalizedName, m);
                }
            }
        }
        json.data = Array.from(uniqueMap.values());
        // Sort alphabetically
        json.data.sort((a, b) => a.map_name.localeCompare(b.map_name));
    }

    return json;
}

export async function getMapById(mapId: number): Promise<ApiResult<Map>> {
    const res = await fetch(`${BASE_URL}/maps/${mapId}`);
    return res.json();
}

export async function getMapsByFloor(floor: string): Promise<ApiResult<Map[]>> {
    const res = await fetch(`${BASE_URL}/maps?action=by-floor&floor=${floor}`);
    return res.json();
}

export async function getMapCount(): Promise<ApiResult<number>> {
    const res = await fetch(`${BASE_URL}/maps?action=count`);
    return res.json();
}

export async function uploadMapFull(formData: FormData): Promise<ApiResult<Record<string, unknown>>> {
    try {
        const res = await fetch(`${BASE_URL}/maps/upload`, {
            method: 'POST',
            body: formData,
            // DO NOT set Content-Type header manually here; the browser needs to set it to 'multipart/form-data; boundary=...' automatically
        });
        return res.json();
    } catch (error: unknown) {
        return { data: null, error: error instanceof Error ? error.message : 'Network error fetching map upload proxy' };
    }
}

export async function deleteMap(mapId: number): Promise<ApiResult<null>> {
    const res = await fetch(`${BASE_URL}/maps?action=delete&id=${mapId}`, {
        method: 'DELETE',
    });
    return res.json();
}

export async function getMapFiles(mapId: number): Promise<ApiResult<{ map: Map, files: any[] }>> {
    const res = await fetch(`${BASE_URL}/maps/${mapId}`);
    return res.json();
}

export function getMapImageUrl(mapId: number): string {
    return `${BASE_URL}/maps/${mapId}/image`;
}

export function getMapYamlUrl(mapId: number): string {
    return `${BASE_URL}/maps/${mapId}/yaml`;
}

// ============================================
// AUTH OPERATIONS
// ============================================

export async function signIn(email: string, password: string): Promise<SignInResult> {
    const res = await fetch(`${BASE_URL}/auth?action=signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    return res.json();
}

// signUp removed — registration is disabled

export async function signOut(): Promise<ApiResult<null>> {
    const res = await fetch(`${BASE_URL}/auth?action=signout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });
    return res.json();
}

export async function getCurrentUser(): Promise<ApiResult<AuthUser | null>> {
    const res = await fetch(`${BASE_URL}/auth`);
    return res.json();
}

export async function updateUserProfile(data: { email?: string; password?: string }): Promise<ApiResult<null>> {
    const res = await fetch(`${BASE_URL}/auth?action=update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

// ============================================
// PER-ROBOT SUMMARY OPERATIONS
// ============================================

export async function getRobotSummary(deviceId: number): Promise<ApiResult<RobotSummary>> {
    const res = await fetch(`${BASE_URL}/dashboard?action=robot-summary&deviceId=${deviceId}`);
    return res.json();
}

export async function getActiveRobotsWithStatus(): Promise<ApiResult<DeviceStatus[]>> {
    const res = await fetch(`${BASE_URL}/device-status?action=active`);
    return res.json();
}

export async function getInactiveRobots(): Promise<ApiResult<DeviceStatus[]>> {
    const res = await fetch(`${BASE_URL}/device-status?action=inactive`);
    return res.json();
}

export async function getRobotBatteryStats(deviceId: number): Promise<ApiResult<{ avgBattery: number | null; buckets: BatteryBuckets }>> {
    const res = await fetch(`${BASE_URL}/battery?action=robot-stats&deviceId=${deviceId}`);
    return res.json();
}

export async function getRobotErrorCount(deviceId: number): Promise<ApiResult<number>> {
    const res = await fetch(`${BASE_URL}/commands?action=robot-error-count&deviceId=${deviceId}`);
    return res.json();
}

// ============================================
// ACTIVITY LOG OPERATIONS
// ============================================

export async function getActivityLogs(limit: number = 50, deviceId?: number): Promise<ApiResult<ActivityLog[]>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (deviceId !== undefined) params.set('deviceId', deviceId.toString());
    const res = await fetch(`${BASE_URL}/commands?action=activity-logs&${params}`);
    return res.json();
}

export async function getActivitiesBySentiment(sentiment: SentimentType, limit: number = 50): Promise<ApiResult<ActivityLog[]>> {
    const res = await fetch(`${BASE_URL}/commands?action=activity-logs&sentiment=${sentiment}&limit=${limit}`);
    return res.json();
}

// ============================================
// SYSTEM NOTIFICATIONS OPERATIONS
// ============================================

export async function getSystemNotifications(limit: number = 20): Promise<ApiResult<SystemNotification[]>> {
    const res = await fetch(`${BASE_URL}/notifications?action=system&limit=${limit}`);
    return res.json();
}

export async function getUnreadNotificationsCount(): Promise<ApiResult<number>> {
    const res = await fetch(`${BASE_URL}/notifications?action=unread-count`);
    return res.json();
}

export async function getLowBatteryNotifications(): Promise<ApiResult<SystemNotification[]>> {
    const res = await fetch(`${BASE_URL}/notifications?action=low-battery`);
    return res.json();
}

// ============================================
// ROBOT CONTROL OPERATIONS
// ============================================

export async function getTableGoalsForMap(mapId: number): Promise<ApiResult<Goal[]>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=table-goals&mapId=${mapId}`, {
        cache: 'no-store',
        headers: {
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
        }
    });
    return res.json();
}

export async function getAllGoalsForMap(mapId: number): Promise<ApiResult<Goal[]>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=all-goals&mapId=${mapId}`, {
        cache: 'no-store'
    });
    return res.json();
}

export type SendToTableTask = {
    goal_id: number;
    tray: number;
};

export type SendToTablePayload = {
    device_id: number;
    tasks: SendToTableTask[];
    map_id: number;
    robot_id: string;    // e.g. "TFRB1"
    origin_id: string;   // e.g. "TFWB1"
    speed?: string;      // 'S' | 'F' | 'VF' — navigation speed level
};

export type SendToTableResponse = {
    queue_id: number;
    ws_sent: boolean;
    ws_error?: string;
};

/**
 * Send robot to a specific table
 * Encodes payload in Base64 as per supervisor's architecture guidance
 */
export async function sendRobotToTable(payload: SendToTablePayload): Promise<ApiResult<SendToTableResponse>> {
    // Encode payload to Base64 for safe transport (decoded in backend before WS send)
    const encoded_payload = btoa(JSON.stringify(payload));

    const res = await fetch(`${BASE_URL}/robot-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}

export type SendToMovePayload = {
    device_id: number;
    goal_id: number;
    goal_type: 'HOMEBASE' | 'CHARGING';
    map_id: number;
    robot_id: string;
    origin_id: string;
};

/**
 * Send robot to homebase or charging station (MOVE command)
 * Encodes payload in Base64
 */
export async function sendRobotToMove(payload: SendToMovePayload): Promise<ApiResult<SendToTableResponse>> {
    const encoded_payload = btoa(JSON.stringify(payload));
    const res = await fetch(`${BASE_URL}/robot-control?action=move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}


/**
 * Send teleop (manual movement) command to robot
 * High-frequency — not logged to database
 */
export type TeleopPayload = {
    robot_id: string;
    origin_id: string;
    linear: { x: number; y: number; z: number };
    angular: { x: number; y: number; z: number };
    speed?: string;
};

/**
 * Send mapping command to the robot (MAPPING_START, MAPPING_SAVE, MAPPING_STOP)
 * Encoded in Base64
 */
export async function sendMappingCommand(payload: Record<string, unknown>): Promise<ApiResult<Record<string, unknown>>> {
    const encoded_payload = btoa(JSON.stringify(payload));
    const res = await fetch(`${BASE_URL}/robot-control?action=mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}

/**
 * Save draft goal during Live Mapping
 */
export async function saveDraftGoal(data: { sessionToken: string, goalName: string, goalCode?: string, goalType?: string, x: number, y: number, yaw: number, z?: number, deviceId: number }): Promise<ApiResult<Goal>> {
    const res = await fetch(`${BASE_URL}/goals?action=draft-goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

/**
 * Get draft goals by session token
 */
export async function getDraftGoals(sessionToken: string): Promise<ApiResult<Goal[]>> {
    const res = await fetch(`${BASE_URL}/goals?action=drafts-by-session&sessionToken=${encodeURIComponent(sessionToken)}`);
    return res.json();
}

export async function sendTeleopCommand(payload: TeleopPayload): Promise<{ sent: boolean; error?: string }> {
    const fullPayload = {
        code: 'TELEOP' as const,
        data: {
            robot_id: payload.robot_id,
            ui_id: 'TFWB1',
            linear: payload.linear,
            angular: payload.angular,
            speed: payload.speed || 'S'
        }
    };

    const encoded_payload = btoa(JSON.stringify(fullPayload));

    const res = await fetch(`${BASE_URL}/robot-control?action=teleop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}

export type TeleopDonePayload = {
    robot_id: string;
    origin_id: string;
};

export async function sendTeleopDoneCommand(payload: TeleopDonePayload): Promise<{ sent: boolean; error?: string }> {
    const fullPayload = {
        code: 'TELEOP_DONE' as const,
        data: {
            robot_id: payload.robot_id,
            ui_id: 'TFWB1',
            status: 'COMPLETED'
        }
    };

    const encoded_payload = btoa(JSON.stringify(fullPayload));

    const res = await fetch(`${BASE_URL}/robot-control?action=teleop-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}

export async function getActiveRobotTasks(deviceId: number): Promise<ApiResult<GoalQueue[]>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=active-tasks&deviceId=${deviceId}`);
    return res.json();
}

export async function getTaskHistory(deviceId: number, days: number = 7): Promise<ApiResult<(GoalQueue & { day_label?: string })[]>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=task-history&deviceId=${deviceId}&days=${days}`);
    return res.json();
}

export async function markTaskAsDone(goalQueueId: number): Promise<ApiResult<boolean>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=mark-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalQueueId }),
    });
    return res.json();
}

/**
 * Set the active map for a device (persists to database)
 */
export async function setActiveMapForDevice(deviceId: number, mapId: number): Promise<ApiResult<boolean>> {
    const res = await fetch(`${BASE_URL}/robot-control?action=set-active-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, mapId }),
    });
    return res.json();
}

/**
 * Send MAP_SELECTED payload via WebSocket when activating a map
 */
export async function sendMapSelectedCommand(payload: { robot_id: string, map_id: number }): Promise<{ ws: boolean; ws_error?: string }> {
    const now = new Date().toISOString();
    const fullPayload = {
        code: 'MAP_SELECTED',
        data: {
            robot_id: payload.robot_id,
            map_id: Number(payload.map_id),
            timestamp: now
        },
        origin: 'UI',
        origin_id: 'TFWB1',
        timestamp: now,
        message_id: crypto.randomUUID()
    };

    const encoded_payload = btoa(JSON.stringify(fullPayload));
    const res = await fetch(`${BASE_URL}/robot-control?action=map-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encoded_payload }),
    });
    return res.json();
}

// ============================================
// WS TRAFFIC OPERATIONS
// ============================================

export async function getWsTrafficLogs(range: string = '1d', deviceId?: number): Promise<ApiResult<WsTraffic[]>> {
    const params = new URLSearchParams({ action: 'logs-by-range', range });
    if (deviceId !== undefined) params.set('deviceId', deviceId.toString());
    const res = await fetch(`${BASE_URL}/ws-traffic?${params}`);
    return res.json();
}

export async function getLatestWsTrafficPerDevice(): Promise<ApiResult<WsTraffic[]>> {
    const res = await fetch(`${BASE_URL}/ws-traffic?action=latest-per-device`);
    return res.json();
}

export async function getLatestWsStatus(deviceId: number): Promise<ApiResult<{ isOnline: boolean; lastStatus: string; recordedAt: string }>> {
    const res = await fetch(`${BASE_URL}/ws-traffic?action=latest-status&deviceId=${deviceId}`);
    return res.json();
}

export async function getRecentWsTraffic(limit: number = 10, deviceId?: number): Promise<ApiResult<WsTraffic[]>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (deviceId !== undefined) params.set('deviceId', deviceId.toString());
    const res = await fetch(`${BASE_URL}/ws-traffic?${params}`);
    return res.json();
}

export async function sendTalkCommand(payload: { robot_id: string, origin_id: string, action: 'TALK_ON' | 'TALK_OFF' }): Promise<{ sent: boolean; error?: string }> {
    const talkPayload = {
        code: 'CONTROL',
        data: {
            type: 'control',
            ui_id: 'TFWB1',
            action: payload.action,
            robot_id: payload.robot_id
        },
        origin: 'UI',
        origin_id: 'TFWB1'
    };
    const encodedPayload = btoa(JSON.stringify(talkPayload));

    try {
        const res = await fetch(`${BASE_URL}/robot-control?action=talk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encoded_payload: encodedPayload }),
        });

        const data = await res.json();
        
        if (!data.sent) {
            return { sent: false, error: data.error || 'Failed to send to robot' };
        }

        return { sent: true };
    } catch (e: unknown) {
        return { sent: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
}
