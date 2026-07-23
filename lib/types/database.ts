// Type definitions for database models
// These types match the PostgreSQL schema from tifa_dump.sql

// ============================================
// ENUMS (matching PostgreSQL enums)
// ============================================

export type ConnectionType = 'CLOUD_WS' | 'ROBOT_LOCAL_WS' | 'OTHER';
export type GoalQueueStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'CANCELLED';
export type GoalType = 'TABLE' | 'CHARGE' | 'HOME' | 'CUSTOM';
export type RobotMode = 'IDLE' | 'MOVING' | 'CHARGING' | 'MAPPING' | 'RETURNING_HOME' | 'ERROR' | 'PAUSED';
export type WsTrafficCode = 'INIT' | 'READY' | 'ERROR' | 'DISCONNECT' | 'SI';

// ============================================
// MASTER DATA (m_*)
// ============================================

export type Robot = {
    device_id: number;
    device_name: string | null;
    device_code: string;
    company_id: number | null;
    active_map_id: number | null;
    robot_local_ip: string | null;
    robot_local_ssid: string | null;
    created_at: string;
    updated_at: string;
};

export type DeviceInfo = {
    device_id: number;
    device_name: string | null;
    device_code: string;
    company_id: number | null;
    active_map_id: number | null;
    robot_local_ip: string | null;
    robot_local_ssid: string | null;
};

export type Company = {
    company_id: number;
    company_code: string;
    company_name: string;
    created_at: string;
    updated_at: string;
};

export type Map = {
    map_id: number;
    map_name: string;
    description: string | null;
    map_floor: string | null;
    file_group_id: number | null;
    created_by: number | null;
    created_at: string;
    updated_at: string;
};

export type Goal = {
    goal_id: number;
    map_id: number | null;
    goal_code: string | null;
    goal_name: string | null;
    goal_type: GoalType;
    x: number | null;
    y: number | null;
    yaw: number;
    metadata: object | null;
    created_at: string;
};

// ============================================
// HISTORY / LOGS (h_*)
// ============================================

export type BatteryRow = {
    h_battery_id: number;
    device_id: number;
    battery_percent: number | null;
    voltage: number | null;
    recorded_at: string;
    raw_payload: object | null;
};

export type Position = {
    h_position_id: number;
    device_id: number;
    x: number;
    y: number;
    yaw: number;
    recorded_at: string;
    raw_payload: object | null;
};

export type RobotState = {
    h_state_id: number;
    device_id: number;
    robot_mode: RobotMode;
    robot_activity: string | null;
    is_emergency: boolean;
    recorded_at: string;
    raw_payload: object | null;
};

export type CommandLog = {
    h_command_log_id: number;
    device_id: number | null;
    command_code: string | null;
    command_payload: object | null;
    status: string | null;
    status_message: string | null;
    created_at: string;
};

export type ConnectionLog = {
    h_connection_log_id: number;
    device_id: number | null;
    connection_type: ConnectionType | null;
    remote_addr: string | null;
    local_addr: string | null;
    connected_at: string;
    disconnected_at: string | null;
    session_info: object | null;
};

export type WsTraffic = {
    h_ws_traffic_id: number;
    device_id: number | null;
    direction: string | null;
    code: WsTrafficCode | string;
    payload: object | null;
    remote_addr: string | null;
    recorded_at: string;
};

// ============================================
// TRANSACTIONS (t_*)
// ============================================

export type GoalQueue = {
    goal_queue_id: number;
    queue_code: string | null;
    map_id: number | null;
    device_id: number | null;
    requested_by: number | null;
    priority: number;
    retry_count: number;
    status: GoalQueueStatus;
    fail_reason: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    payload: object | null;
};

export type User = {
    user_id: number;
    username: string;
    display_name: string | null;
    email: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

export type Settings = {
    setting_key: string;
    setting_value: object | null;
    updated_at: string;
};

// ============================================
// VIEWS (v_*)
// ============================================

export type DeviceStatus = {
    device_id: number;
    device_code: string;
    device_name: string | null;
    last_x: number | null;
    last_y: number | null;
    last_yaw: number | null;
    battery_percent: number | null;
    battery_level: number | null;
    robot_mode: RobotMode | null;
    robot_activity: string | null;
    status_updated_at: string | null;
};

// ============================================
// NOTIFICATIONS (custom for UI)
// ============================================

export type Notification = {
    id: number;
    device_id: number | null;
    type: string;
    message: string;
    created_at: string;
};

// ============================================
// DASHBOARD AGGREGATES
// ============================================

export type BatteryBuckets = {
    critical: number;
    warning: number;
    healthy: number;
};

export type DashboardStats = {
    robotCount: number;
    avgBattery: number | null;
    errorCount: number;
    batteryBuckets: BatteryBuckets;
    latestCommands: CommandLog[];
    recentRobots: Robot[];
};

export type ActivityData = {
    hour: number;
    count: number;
    label?: string;
};

export type HourlyBatteryData = {
    hour: number;
    avg_battery: number;
    label: string;
};

// ============================================
// INPUT TYPES (for create/update operations)
// ============================================

export type CreateRobotInput = {
    device_name: string;
    device_code: string;
    robot_local_ip?: string | null;
    robot_local_ssid?: string | null;
};

export type UpdateRobotInput = Partial<CreateRobotInput>;

// ============================================
// AUTH TYPES
// ============================================

export type AuthUser = {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'operator';
    companyId?: number;
    user_metadata?: {
        role?: string;
    };
};

export type SignInResult = {
    success: boolean;
    error?: string;
    user?: AuthUser;
    token?: string;
    sessionId?: string;
};

export type SignUpResult = {
    success: boolean;
    error?: string;
};

// ============================================
// API RESPONSE WRAPPER
// ============================================

export type ApiResult<T> = {
    data: T | null;
    error: string | null;
};

// ============================================
// ACTIVITY LOG (with sentiment analysis)
// ============================================

export type SentimentType = 'positive' | 'negative' | 'neutral';

export type ActivityLog = {
    id: number;
    device_id: number;
    device_name: string | null;
    activity_type: 'delivery' | 'interaction' | 'system' | 'battery' | 'error';
    message: string;
    sentiment: SentimentType | null;
    customer_response: string | null;
    created_at: string;
};

// ============================================
// ROBOT SUMMARY (per-robot dashboard stats)
// ============================================

export type RobotSummary = {
    device_id: number;
    device_name: string | null;
    device_code: string;
    battery_percent: number | null;
    robot_mode: RobotMode | null;
    robot_activity: string | null;
    last_updated: string | null;
    is_online: boolean;
    error_count: number;
    battery_history: { percent: number; recorded_at: string }[];
};

// ============================================
// SYSTEM NOTIFICATIONS
// ============================================

export type NotificationType = 'low_battery' | 'error' | 'activity' | 'system' | 'ws_traffic';

export type SystemNotification = {
    id: string;
    device_id: number | null;
    device_name: string | null;
    type: NotificationType;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
};

// ============================================
// GROUPED ROBOT (for merged RB + UI_TIFA display)
// Re-exported from robotGrouping utility
// ============================================

export type { GroupedRobot, GroupedRobotWithStatus } from '@/lib/utils/robotGrouping';

