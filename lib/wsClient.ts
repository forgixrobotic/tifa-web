// WebSocket Client Manager for Robot Communication
// Manages WS connection to robot, handles message encoding/decoding
// As per supervisor's guidance: payload is encoded before sending, decoded in backend before forwarding to WS
//
// NOTE: This uses dynamic import for 'ws' package. If 'ws' is not installed,
// the WS connection will gracefully fail and commands will still be queued in the database.
// Install with: npm install ws @types/ws

// ============================================
// PAYLOAD ENCODING / DECODING (Base64 masking)
// ============================================

/**
 * Encode payload to Base64 for safe transport from frontend
 */
export function encodePayload(payload: object): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Decode Base64 payload received from frontend
 */
export function decodePayload<T = Record<string, unknown>>(encoded: string): T {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as T;
}

// ============================================
// WEBSOCKET COMMAND TYPES (matching database h_command_log.command_payload)
// ============================================

export type TrayTask = {
    dest: { x: number; y: number; yaw: number };
    tray: number;
    goal_id: number;
};

export type RobotNavCommandPayload = {
    code: 'OP';
    data: {
        type: 'OP';
        map_id: string;
        robot_id: string;       // e.g. "TFRB1"
        home_base: { x: number; y: number; yaw: number };
        tray_tasks: TrayTask[];
        reqested_by: number;    // spelled as in DB schema
    };
    origin: 'UI';
    origin_id: string;          // e.g. "TFWB1"
    timestamp: string;          // ISO 8601
    message_id: string;         // UUID
};

export type RobotMoveCommandPayload = {
    code: 'MOVE';
    data: {
        dest: { x: number; y: number; yaw: number };
        type: 'HOMEBASE' | 'CHARGING';
        robot_id: string;
        sequence: number;
        home_base: { x: number; y: number; yaw: number };
    };
    origin: 'UI';
    origin_id: string;
    timestamp: string;
    message_id: string;
};

export type MapSelectedCommandPayload = {
    code: 'MAP_SELECTED';
    data: {
        robot_id: string;
        ui_id: string;       // Sender: TFWB1 (Web Dashboard)
        map_id: number;
        timestamp: string;
    };
    origin: 'UI';
    origin_id: string;
    timestamp: string;
    message_id: string;
};

export type MapDataCommandPayload = {
    code: 'MAP_DATA';
    data: {
        robot_id: string;
        ui_id: string;       // Sender: TFWB1 (Web Dashboard)
        map_id: number;
        format: string;
        encoding: string;
        payload: string;
    };
    origin: 'UI';
    origin_id: string;
    timestamp: string;
    message_id: string;
};

export type RobotCommandPayload = RobotNavCommandPayload | RobotMoveCommandPayload | TeleopCommandPayload | TeleopDoneCommandPayload | MapSelectedCommandPayload | MapDataCommandPayload;

export type TeleopCommandPayload = {
    code: 'TELEOP';
    data: {
        robot_id: string;
        ui_id?: string;
        linear: { x: number; y: number; z: number };
        angular: { x: number; y: number; z: number };
        speed: string;
    };
};

export type MappingCommandPayload = {
    code: 'MAPPING_START' | 'MAPPING_SAVE' | 'MAPPING_STOP' | 'MAPPING_FLAG';
    data: {
        robot_id: string;
        ui_id?: string;
        status: boolean;
        is_auto: boolean;
        timestamp?: string; // used by MAPPING_START
        map_name?: string;  // used by MAPPING_SAVE
        category?: string;  // used by MAPPING_SAVE
        category_type?: string; // used by MAPPING_SAVE
        goal_name?: string; // used by MAPPING_FLAG
    };
};

export type TeleopDoneCommandPayload = {
    code: 'TELEOP_DONE';
    data: {
        robot_id: string;
        ui_id?: string;
        status: string;
    };
};

export type MappingDoneEventPayload = {
    code: 'MAPPING_DONE';
    data: {
        robot_id: string;
        ui_id?: string;
        coverage: number;
        frontier_ratio: number;
        method: string;
        is_auto: boolean;
    };
};

export type TalkCommandPayload = {
    code: 'CONTROL';
    data: {
        type: 'control';
        ui_id?: string;      // Sender: TFWB1 (Web Dashboard)
        action: 'TALK_ON' | 'TALK_OFF';
        robot_id: string;   // Target: SERVERAI001 (AI Server) or TABLET001
    };
    origin: 'UI';
    origin_id: string;      // Sender: TFWB1
};

import type { WebSocket as WSClass } from 'ws';
import { query } from '@/lib/dbClient';
import { getSettings, saveSettings } from '@/lib/settings';

// ============================================
// WEBSOCKET CLIENT (lazy initialization)
// ============================================

// Settings will be loaded dynamically inside connectWs/waitForConnection
// Static fallback is only for type safety if needed, but getWsUiId now fetches real settings
let wsInstance: WSClass | null = null;
let isConnecting = false;
let isSessionActive = false;  // tracks whether SI handshake completed
let duplicateRetryCount = 0;  // tracks DUPLICATE_UI_ID retry attempts
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isListening = false;      // tracks robot voice listening state
let WebSocketClass: typeof WSClass | null = null;
let wsModuleLoaded = false;

// Server-side JWT token storage (client sends it via Authorization header on turn-on)
// wsClient.ts runs on the server (Node.js), not browser — sessionStorage is unavailable.
// Also persisted to settings.json so it survives Next.js hot-reload.
let serverJwtToken: string | null = null;

async function loadWebSocketModule() {
    if (wsModuleLoaded) return WebSocketClass;
    try {
        const wsModule = await import('ws');
        WebSocketClass = wsModule.default || wsModule;
        wsModuleLoaded = true;

        console.log('[WS Robot] WebSocket module loaded successfully');
        return WebSocketClass;
    } catch {
        wsModuleLoaded = true; // prevent retry

        console.warn('[WS Robot] ws package not installed. Run: npm install ws @types/ws');

        console.warn('[WS Robot] Commands will be queued in database only (no real-time delivery to robot)');
        return null;
    }
}

/**
 * Send SI (Session Identify) command to establish a UI session.
 * Required by the robot WS server before any OP/TELEOP commands are accepted.
 */
function sendSessionIdentify() {
    if (!wsInstance || wsInstance.readyState !== 1) return;

    const settings = getSettings();
    const uiId = settings.uiId;
    // Try in-memory first, then settings.json (persists across hot-reload)
    const token = serverJwtToken || settings.jwtToken;

    const siPayload = {
        code: 'SI',
        data: {
            type: 'UI',
            ui_id: uiId,
            token: token || undefined,
        },
    };

    try {
        wsInstance.send(JSON.stringify(siPayload));

        console.log(`[WS Robot] 📤 SI (Session Identify) sent: ui_id=${uiId}${token ? ' (with JWT Token)' : ''}`);
    } catch (err) {

        console.error('[WS Robot] Failed to send SI:', err);
    }
}

/**
 * Cleanly close the old WebSocket connection before reconnecting.
 * This prevents DUPLICATE_UI_ID errors on the server.
 */
function cleanupOldConnection() {
    if (wsInstance) {
        try {
            wsInstance.removeAllListeners();
            if (wsInstance.readyState === 0 || wsInstance.readyState === 1) {
                wsInstance.close();
            }
        } catch {
            // ignore close errors on old instance
        }
        wsInstance = null;
    }
    isSessionActive = false;
}

async function connectWs() {
    if (isConnecting) return;
    isConnecting = true;

    const WS = await loadWebSocketModule();
    if (!WS) {
        isConnecting = false;
        return;
    }

    const settings = getSettings();

    // Clean up any existing connection first
    cleanupOldConnection();

    try {
        wsInstance = new WS(settings.wsUrl, {
            rejectUnauthorized: false,
            family: 4,
        });

        wsInstance.on('open', () => {
            isConnecting = false;

            console.log(`[WS Robot] ✅ Connected to ${settings.wsUrl}`);
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            // Immediately send SI to establish session
            isSessionActive = false;
            sendSessionIdentify();
        });

        wsInstance.on('close', (code: number, reason: Buffer) => {
            isConnecting = false;
            isSessionActive = false;

            console.log(`[WS Robot] Connection closed (code=${code}, reason=${reason?.toString() || 'none'}), scheduling reconnect...`);
            scheduleReconnect();
        });

        wsInstance.on('error', (err: Error) => {
            isConnecting = false;

            console.error('[WS Robot] Connection error:', err.message || err);
        });

        wsInstance.on('message', async (data: Buffer) => {
            const msgStr = data.toString();

            console.log('[WS Robot] Message received:', msgStr);

            try {
                const msg = JSON.parse(msgStr);

                // ACK_SOFT = SI was accepted, session established
                if (msg.code === 'ACK_SOFT') {
                    isSessionActive = true;
                    duplicateRetryCount = 0; // reset on success

                    console.log(`[WS Robot] ✅ Session established as ${settings.uiId}! (${msg.data?.message ?? 'OK'})`);
                }
                // DUPLICATE_UI_ID = old session still lingering on server after restart
                // Use progressive delay: 3s → 5s → 10s to wait for old session to expire
                else if (msg.code === 'ERROR' && msg.data?.error === 'DUPLICATE_UI_ID') {
                    isSessionActive = false;
                    duplicateRetryCount++;
                    const delays = [3000, 5000, 10000];
                    const delay = delays[Math.min(duplicateRetryCount - 1, delays.length - 1)];

                    console.log(`[WS Robot] ⚠️ Duplicate UI ID (${settings.uiId}), old session still active. Retry #${duplicateRetryCount} in ${delay / 1000}s...`);
                    // Close current connection and retry after delay
                    cleanupOldConnection();
                    setTimeout(() => void connectWs(), delay);
                }
                // Session expired mid-use
                else if (msg.code === 'ERROR' && msg.data?.message?.includes('Send SI first')) {
                    isSessionActive = false;

                    console.log('[WS Robot] ⚠️ Session expired, re-sending SI...');
                    sendSessionIdentify();
                }
                // Handle MAPPING_DONE event dari Robot
                else if (msg.code === 'MAPPING_DONE') {
                    const eventData = msg.data;

                    console.log(`[WS Robot] 🗺️ Mapping Selesai oleh ${eventData.robot_id}! Coverage: ${(eventData.coverage * 100).toFixed(1)}%, Metode: ${eventData.method}`);

                    try {
                        const deviceRows = await query<{ device_id: number }>(
                            `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
                            [eventData.robot_id]
                        );
                        const deviceId = deviceRows[0]?.device_id ?? null;

                        await query(
                            `INSERT INTO h_command_log (device_id, command_code, command_payload, status, status_message, created_at)
                             VALUES ($1, $2, $3, $4, $5, NOW())`,
                            [
                                deviceId,
                                'MAPPING_DONE',
                                JSON.stringify(msg),
                                'RECEIVED',
                                `Mapping Done (Coverage: ${(eventData.coverage * 100).toFixed(1)}%)`
                            ]
                        );

                        // PM Requirement: Log into h_ws_traffic so Notification Bell catches it
                        await query(
                            `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
                             VALUES ($1, 'IN', $2, $3, '127.0.0.1', NOW())`,
                            [deviceId, 'MAPPING_DONE', JSON.stringify(msg)]
                        );
                    } catch (err) {

                        console.error('[WS Robot] Failed to log MAPPING_DONE to database:', err);
                    }
                }
                // Handle Voice Control status update
                else if (msg.type === 'status' && (msg.data?.apps_id === settings.uiId || msg.data?.ui_id === settings.uiId)) {
                    if (typeof msg.data.listening === 'boolean') {
                        isListening = msg.data.listening;

                        console.log(`[WS Robot] 🎙️ Voice Control Listening: ${isListening}`);
                    }
                }
                // Handle Generic ERROR from Robot
                else if (msg.code === 'ERROR') {

                    console.error('[WS Robot] ❌ Robot Error:', msg);
                    try {
                        let deviceId = null;
                        if (msg.data && msg.data.robot_id) {
                            const deviceRows = await query<{ device_id: number }>(
                                `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
                                [msg.data.robot_id]
                            );
                            deviceId = deviceRows[0]?.device_id ?? null;
                        }
                        if (deviceId) {
                            await query(
                                `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
                                 VALUES ($1, 'IN', $2, $3, '127.0.0.1', NOW())`,
                                [deviceId, 'ERROR', JSON.stringify(msg)]
                            );
                        }
                    } catch (err) {

                        console.error('[WS Robot] Failed to log ERROR to database:', err);
                    }
                }
                // Handle STATUS dari Robot — update h_state + progress task queue
                else if (msg.code === 'STATUS') {
                    const robotId = msg.data?.robot_id;
                    const robotStatus = msg.data?.status;
                    if (robotId && robotStatus) {
                        try {
                            const deviceRows = await query<{ device_id: number }>(
                                `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`, [robotId]
                            );
                            const deviceId = deviceRows[0]?.device_id;
                            if (deviceId) {
                                await query(
                                    `INSERT INTO h_state (device_id, robot_mode, robot_activity, recorded_at)
                                     VALUES ($1, $2, $3, NOW())`,
                                    [deviceId, robotStatus, robotStatus]
                                );
                                console.log(`[WS Robot] 🔄 Status update: ${robotId} → ${robotStatus}`);

                                // Jika robot mulai bergerak → update QUEUED → IN_PROGRESS
                                if (robotStatus === 'MOVING') {
                                    await query(
                                        `UPDATE t_goal_queue SET status = 'IN_PROGRESS', started_at = NOW()
                                         WHERE goal_queue_id = (
                                           SELECT goal_queue_id FROM t_goal_queue
                                           WHERE device_id = $1 AND status = 'QUEUED'
                                           ORDER BY created_at DESC LIMIT 1
                                         )`,
                                        [deviceId]
                                    );
                                }
                            }
                        } catch (err) {
                            console.error('[WS Robot] Failed to save STATUS:', err);
                        }
                    }
                }
                // Handle POSITION dari Robot
                else if (msg.code === 'POSITION') {
                    const robotId = msg.data?.robot_id;
                    const { x, y, yaw } = msg.data || {};
                    if (robotId && x !== undefined) {
                        try {
                            const deviceRows = await query<{ device_id: number }>(
                                `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`, [robotId]
                            );
                            const deviceId = deviceRows[0]?.device_id;
                            if (deviceId) {
                                await query(
                                    `INSERT INTO h_position (device_id, x, y, yaw, recorded_at)
                                     VALUES ($1, $2, $3, $4, NOW())`,
                                    [deviceId, x, y, yaw ?? 0]
                                );
                            }
                        } catch { /* skip position errors */ }
                    }
                }
                // Handle BATTERY dari Robot
                else if (msg.code === 'BATTERY') {
                    const robotId = msg.data?.robot_id;
                    const batteryPercent = msg.data?.battery_percent ?? msg.data?.battery_level;
                    const voltage = msg.data?.voltage;
                    if (robotId && batteryPercent !== undefined) {
                        try {
                            const deviceRows = await query<{ device_id: number }>(
                                `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`, [robotId]
                            );
                            const deviceId = deviceRows[0]?.device_id;
                            if (deviceId) {
                                await query(
                                    `INSERT INTO h_battery (device_id, battery_percent, voltage, recorded_at)
                                     VALUES ($1, $2, $3, NOW())`,
                                    [deviceId, batteryPercent, voltage ?? null]
                                );
                            }
                        } catch { /* skip battery errors */ }
                    }
                }
                // Handle ACK, INIT, and DISCONNECT dari Robot
                else if (msg.code === 'ACK' || msg.code === 'INIT' || msg.code === 'DISCONNECT' || (!msg.code && msg.origin_id && msg.message_id)) {
                    const actualCode = msg.code || 'DISCONNECT';

                    console.log(`[WS Robot] 🔄 Status Update: ${actualCode}`, msg.data?.status || '');
                    try {
                        let deviceId = null;
                        const robotId = msg.data?.robot_id || msg.origin_id;
                        if (robotId) {
                            const deviceRows = await query<{ device_id: number }>(
                                `SELECT device_id FROM m_device WHERE device_code = $1 LIMIT 1`,
                                [robotId]
                            );
                            deviceId = deviceRows[0]?.device_id ?? null;
                        }
                        if (deviceId) {
                            await query(
                                `INSERT INTO h_ws_traffic (device_id, direction, code, payload, remote_addr, recorded_at)
                                 VALUES ($1, 'IN', $2, $3, '127.0.0.1', NOW())`,
                                [deviceId, actualCode, JSON.stringify(msg)]
                            );
                        }
                    } catch (err) {

                        console.error(`[WS Robot] Failed to log ${actualCode} to database:`, err);
                    }
                }
            } catch {
                // Not JSON, ignore
            }
        });
    } catch (err) {
        isConnecting = false;

        console.error('[WS Robot] Failed to create connection:', err);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        const settings = getSettings();
        if (settings.isWsTurnedOn) {
            void connectWs();
        } else {
            console.log('[WS Robot] Reconnect skipped, WS is manually turned OFF.');
        }
    }, 5000);
}

/**
 * Wait for WebSocket connection + active session (up to timeoutMs).
 * Returns ws instance if ready, null if timed out.
 */
function waitForConnection(timeoutMs = 8000): Promise<WSClass | null> {
    const settings = getSettings();
    if (!settings.isWsTurnedOn) {
        console.warn('[WS Robot] WebSocket is manually turned OFF. Cannot connect.');
        return Promise.resolve(null);
    }

    // Fast path: already connected and session active
    if (wsInstance && wsInstance.readyState === 1 && isSessionActive) {
        return Promise.resolve(wsInstance);
    }

    // Ensure we're connecting
    if (!isConnecting && (!wsInstance || wsInstance.readyState !== 1)) {
        void connectWs();
    } else if (wsInstance && wsInstance.readyState === 1 && !isSessionActive) {
        sendSessionIdentify();
    }

    return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
            if (wsInstance && wsInstance.readyState === 1 && isSessionActive) {
                clearInterval(interval);
                resolve(wsInstance);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
    });
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Send a command to the robot via WebSocket.
 * Waits for connection + session before sending.
 */
export async function sendRobotCommand(cmd: RobotCommandPayload | MappingCommandPayload): Promise<{ sent: boolean; error?: string }> {
    const ws = await waitForConnection(8000);

    if (!ws) {

        console.warn('[WS Robot] Not connected/session not ready after waiting — command will be queued in DB only');
        return { sent: false, error: 'WebSocket not connected or session not established' };
    }

    try {
        const message = JSON.stringify(cmd);
        ws.send(message);

        console.log('[WS Robot] ✅ Command sent:', cmd.code, '| dest/goal:', cmd.code === 'OP' ? (cmd as RobotNavCommandPayload).data?.tray_tasks?.[0]?.goal_id : cmd.data && 'type' in cmd.data ? cmd.data.type : 'mapping');
        return { sent: true };
    } catch (err) {
        const error = err as Error;

        console.error('[WS Robot] Failed to send command:', error.message);
        return { sent: false, error: error.message };
    }
}

/**
 * Send a teleop (manual movement) command to the robot via WebSocket.
 */
export async function sendTeleopCommand(cmd: TeleopCommandPayload): Promise<{ sent: boolean; error?: string }> {
    const ws = await waitForConnection(3000);

    if (!ws) {
        return { sent: false, error: 'WebSocket not connected or session not established' };
    }

    try {
        const message = JSON.stringify(cmd);
        ws.send(message);
        return { sent: true };
    } catch (err) {
        const error = err as Error;
        return { sent: false, error: error.message };
    }
}

/**
 * Send a teleop done command to the robot via WebSocket.
 */
export async function sendTeleopDoneCommand(cmd: TeleopDoneCommandPayload): Promise<{ sent: boolean; error?: string }> {
    const ws = await waitForConnection(3000);

    if (!ws) {
        return { sent: false, error: 'WebSocket not connected or session not established' };
    }

    try {
        const message = JSON.stringify(cmd);
        ws.send(message);
        return { sent: true };
    } catch (err) {
        const error = err as Error;
        return { sent: false, error: error.message };
    }
}

/**
 * Send a talk on/off command to the robot via WebSocket.
 */
export async function sendTalkCommand(cmd: TalkCommandPayload): Promise<{ sent: boolean; error?: string }> {
    const ws = await waitForConnection(3000);

    if (!ws) {
        // [MOCK LOCAL MODE] Allow UI testing even if the websocket broker is offline

        console.log('[WS Robot] ⚠️ WS Offline: Simulating Talk Command for local testing:', cmd.data.action);
        if (cmd.data.action === 'TALK_ON') isListening = true;
        if (cmd.data.action === 'TALK_OFF') isListening = false;
        return { sent: true };
    }

    try {
        const message = JSON.stringify(cmd);
        ws.send(message);

        // Optimistically update backend state so frontend polling doesn't immediately overwrite UI to false
        if (cmd.data.action === 'TALK_ON') isListening = true;
        if (cmd.data.action === 'TALK_OFF') isListening = false;

        console.log('[WS Robot] 🎙️ Talk Command sent:', cmd.data.action);
        return { sent: true };
    } catch (err) {
        const error = err as Error;
        return { sent: false, error: error.message };
    }
}

/**
 * Check if the WebSocket is currently connected AND session is active
 */
export function isWsConnected(): boolean {
    return wsInstance !== null && wsInstance.readyState === 1 && isSessionActive;
}

/**
 * Get the current WebSocket UI ID used for the active session.
 * This should be used as ui_id in commands to match the session.
 */
export function getWsUiId(): string {
    return getSettings().uiId;
}

/**
 * Get the current listening status of the robot (Voice Control).
 */
export function getListeningStatus(): boolean {
    return isListening;
}

/**
 * Explicitly trigger a WebSocket connection (e.g., after login or settings change)
 * @param jwtToken JWT token for WS authentication (from client-side sessionStorage)
 */
export async function manualConnectWs(jwtToken?: string | null): Promise<void> {
    const settings = getSettings();
    if (!settings.isWsTurnedOn) {
        console.log('[WS Robot] 🛑 manualConnectWs skipped because WS is turned OFF.');
        cleanupOldConnection();
        return;
    }

    if (jwtToken) {
        serverJwtToken = jwtToken;
        getSettings(); // ensure settings loaded
        saveSettings({ jwtToken }); // persist to file for hot-reload survival
        console.log('[WS Robot] 🔑 JWT token stored for WS authentication');
    }

    if (wsInstance && wsInstance.readyState === 1) {
        cleanupOldConnection();
    }
    await connectWs();
}

/**
 * Manually disconnect the WebSocket (Session Turn Off)
 */
export function disconnectWs(): void {
    console.log('[WS Robot] 🛑 WebSocket manually disconnected by user.');
    serverJwtToken = null;
    saveSettings({ jwtToken: undefined });
    cleanupOldConnection();
}

// REMOVED eager initialization
// void connectWs();

// Graceful shutdown to prevent zombie connections on Next.js hot reload
if (typeof process !== 'undefined') {
    const handleExit = () => {
        cleanupOldConnection();
    };
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
}
