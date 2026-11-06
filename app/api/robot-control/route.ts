import { NextResponse } from 'next/server';
import { getTableGoals, getAllGoalsForMap, sendRobotToTable, sendRobotToMove, getActiveRobotTasks, getTaskHistory, logTeleopToCommandLog, logTeleopDoneToCommandLog, markTaskAsDone, setActiveMap, isRobotOnline } from '@/lib/api/robotControl';
import { decodePayload, sendTeleopCommand, sendTeleopDoneCommand, getWsUiId, getMappingSaveAck, type TeleopCommandPayload, type TeleopDoneCommandPayload, type MappingCommandPayload, type MapSelectedCommandPayload, type TalkCommandPayload } from '@/lib/wsClient';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const mapId = searchParams.get('mapId');
    const deviceId = searchParams.get('deviceId');

    // Get TABLE goals for a map (for control panel buttons)
    if (action === 'table-goals' && mapId) {
        const result = await getTableGoals(parseInt(mapId, 10));
        return NextResponse.json(result);
    }

    // Get ALL goals for a map
    if (action === 'all-goals' && mapId) {
        const result = await getAllGoalsForMap(parseInt(mapId, 10));
        return NextResponse.json(result);
    }

    // Get active tasks for a device
    if (action === 'active-tasks' && deviceId) {
        const result = await getActiveRobotTasks(parseInt(deviceId, 10));
        return NextResponse.json(result);
    }

    // Get task history for a device (last 7 days)
    if (action === 'task-history' && deviceId) {
        const days = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 7;
        const result = await getTaskHistory(parseInt(deviceId, 10), days);
        return NextResponse.json(result);
    }

    // Get current listening status for voice control
    if (action === 'talk-status') {
        const { getListeningStatus } = await import('@/lib/wsClient');
        return NextResponse.json({ listening: getListeningStatus() });
    }

    // Get last MAPPING_SAVE ACK from robot (frontend waits on this before MAPPING_STOP)
    if (action === 'save-ack') {
        return NextResponse.json({ ack: getMappingSaveAck() });
    }

    return NextResponse.json({ error: 'Invalid action or missing parameters' }, { status: 400 });
}

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // === MARK TASK AS DONE manually ===
    if (action === 'mark-done') {
        const body = await request.json();
        const { goalQueueId } = body;
        if (!goalQueueId) {
            return NextResponse.json({ data: null, error: 'goalQueueId is missing' }, { status: 400 });
        }
        const result = await markTaskAsDone(goalQueueId);
        return NextResponse.json(result);
    }

    // === SET ACTIVE MAP for a device ===
    if (action === 'set-active-map') {
        const body = await request.json();
        const { deviceId, mapId } = body;
        if (!deviceId || !mapId) {
            return NextResponse.json({ data: null, error: 'deviceId and mapId are required' }, { status: 400 });
        }
        const result = await setActiveMap(deviceId, mapId);
        return NextResponse.json(result);
    }

    // === TELEOP: direct velocity command ===
    if (action === 'teleop') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;

            if (!encoded_payload || typeof encoded_payload !== 'string') {
                return NextResponse.json(
                    { sent: false, error: 'Missing or invalid encoded_payload' },
                    { status: 400 }
                );
            }

            // Check robot online status (warn-but-send: command proceeds regardless)
            const preCheck = decodePayload<TeleopCommandPayload>(encoded_payload);
            let robotMayBeOffline = false;
            let robotLastSeen: string | null = null;
            if (preCheck.data?.robot_id) {
                const robotStatus = await isRobotOnline(preCheck.data.robot_id);
                if (!robotStatus.online) {
                    robotMayBeOffline = true;
                    robotLastSeen = robotStatus.lastSeen;
                    console.warn(`[robot-control] ⚠️ Robot ${preCheck.data.robot_id} may be offline (last seen: ${robotStatus.lastSeen}). Sending teleop command anyway.`);
                }
            }

            const payload = decodePayload<TeleopCommandPayload>(encoded_payload);

            // Validate required fields
            if (!payload.data?.linear || !payload.data?.angular || !payload.data?.robot_id) {
                return NextResponse.json(
                    { sent: false, error: 'Invalid teleop payload: missing linear, angular, or robot_id' },
                    { status: 400 }
                );
            }

            // ui_id comes from frontend (per-session unique ID)

            // Send directly via WebSocket
            const result = await sendTeleopCommand(payload);

            // Log to h_command_log (PM confirmed: teleop commands go to DB)
            // Awaiting to ensure it's not cancelled by Next.js request termination
            try {
                await logTeleopToCommandLog(payload, result.sent, result.error);
            } catch (logErr) {
                console.error('Failed to log teleop payload:', logErr);
            }

            return NextResponse.json({ ...result, ...(robotMayBeOffline ? { robot_may_be_offline: true, last_seen: robotLastSeen } : {}) });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json(
                { sent: false, error: error.message ?? 'Server error' },
                { status: 500 }
            );
        }
    }

    // === MAPPING CONTROLS ===
    if (action === 'mapping') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;
            if (!encoded_payload) return NextResponse.json({ error: 'Missing encoded_payload' }, { status: 400 });

            // Check robot online status (warn-but-send: command proceeds regardless)
            let mappingRobotMayBeOffline = false;
            let mappingRobotLastSeen: string | null = null;
            try {
                const preCheck = decodePayload<MappingCommandPayload>(encoded_payload);
                if (preCheck.data?.robot_id) {
                    const robotStatus = await isRobotOnline(preCheck.data.robot_id);
                    if (!robotStatus.online) {
                        mappingRobotMayBeOffline = true;
                        mappingRobotLastSeen = robotStatus.lastSeen;
                        console.warn(`[robot-control] ⚠️ Robot ${preCheck.data.robot_id} may be offline (last seen: ${robotStatus.lastSeen}). Sending mapping command anyway.`);
                    }
                }
            } catch { /* decode error handled below */ }

            let payload;
            try {
                payload = decodePayload<MappingCommandPayload>(encoded_payload);
            } catch {
                return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
            }

            const { sendMappingCommand, logMappingToCommandLog } = await import('@/lib/api/robotControl');
            const result = await sendMappingCommand(payload);

            try {
                await logMappingToCommandLog(payload, result.data?.ws ?? false, result.error ?? undefined);
            } catch (logErr) {
                console.error('Failed to log mapping payload:', logErr);
            }

            // === Handle DB insertions for MAPPING_FLAG and MAPPING_SAVE ===
            try {
                const { query } = await import('@/lib/dbClient');
                if (payload.code === 'MAPPING_FLAG') {
                    // MAPPING_FLAG is NOT inserted into m_goal here. This route is the OUT
                    // direction (tifa-web → robot) and only relays goal_name. The pose now
                    // comes back via the robot's MAPPING_FLAG ACK, consumed in lib/wsClient.ts
                    // → insert m_goal (goal_type='CUSTOM') keyed to m_device.active_map_id.
                    // Production-accurate path remains POST /api/maps/upload/full →
                    // saveMapMetadata (m_goal CUSTOM from YAML).
                } else if (payload.code === 'MAPPING_SAVE') {
                    // 1. Insert into m_map
                    const mapName = payload.data.map_name || `Map_${new Date().getTime()}`;
                    const category = payload.data.category || '';
                    const categoryType = payload.data.category_type || '';

                    const mapResult = await query<{ map_id: number }>(
                        `INSERT INTO m_map (map_name, description, map_floor, created_at, updated_at, is_active) 
                         VALUES ($1, $2, $3, NOW(), NOW(), 1) RETURNING map_id`,
                        [mapName, category, categoryType]
                    );

                    if (mapResult.length > 0) {
                        const newMapId = mapResult[0].map_id;

                        // 2. Insert into m_map_version
                        await query(
                            `INSERT INTO m_map_version (map_id, version_number, created_at, changelog) 
                             VALUES ($1, 1, NOW(), 'Initial live mapping version')`,
                            [newMapId]
                        );

                        // 3. Update orphaned goals from the last 24 hours to attach them to this newly saved map
                        await query(
                            `UPDATE m_goal SET map_id = $1 WHERE map_id IS NULL AND created_at >= NOW() - INTERVAL '1 day'`,
                            [newMapId]
                        );
                    }
                }
            } catch (dbErr) {
                console.error('Failed to insert map/goal records into database:', dbErr);
            }

            return NextResponse.json({ ...result, ...(mappingRobotMayBeOffline ? { robot_may_be_offline: true, last_seen: mappingRobotLastSeen } : {}) });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json({ error: error.message ?? 'Server error processing mapping' }, { status: 500 });
        }
    }

    // === MAP SELECTED: notify robot of active map change ===
    // PM Requirement (2026-05-07): Send MAP_SELECTED followed immediately by MAP_DATA
    if (action === 'map-selected') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;
            if (!encoded_payload) return NextResponse.json({ error: 'Missing encoded_payload' }, { status: 400 });

            let payload;
            try {
                payload = decodePayload<MapSelectedCommandPayload>(encoded_payload);
            } catch {
                return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
            }

            // Ensure robot_id is the RB device (e.g. TFRB1), never TFUI1
            const robotId = payload.data.robot_id;
            if (robotId && robotId.startsWith('TFUI')) {
                console.warn(`[map-selected] ⚠️ robot_id was '${robotId}' (app device). This should be the RB device code.`);
            }

            const { sendMapSelectedCommand, logMapSelectedToCommandLog, sendMapDataCommand, logMapDataToCommandLog } = await import('@/lib/api/robotControl');
            const result = await sendMapSelectedCommand(payload);

            try {
                await logMapSelectedToCommandLog(payload, result.data?.ws ?? false, result.error ?? undefined);
            } catch (logErr) {
                console.error('Failed to log MAP_SELECTED payload:', logErr);
            }

            console.log(`[map-selected] ✅ MAP_SELECTED sent for map_id=${payload.data.map_id} to robot_id=${robotId}`);

            // === SEND MAP_DATA IMMEDIATELY AFTER MAP_SELECTED ===
            const { buildMapDataBase64 } = await import('@/lib/api/mapDataBuilder');
            const base64Zip = await buildMapDataBase64(payload.data.map_id);

            if (base64Zip) {
                // We use any here for the payload type to avoid circular imports or changing the top level imports
                const mapDataPayload: any = {
                    code: 'MAP_DATA',
                    data: {
                        robot_id: robotId,
                        ui_id: payload.origin_id || getWsUiId(),
                        map_id: payload.data.map_id,
                        format: 'zip',
                        encoding: 'base64',
                        payload: base64Zip
                    },
                    origin: payload.origin || 'UI',
                    origin_id: payload.origin_id || getWsUiId(),
                    timestamp: new Date().toISOString(),
                    message_id: crypto.randomUUID()
                };

                const mapDataResult = await sendMapDataCommand(mapDataPayload);
                
                try {
                    await logMapDataToCommandLog(mapDataPayload, mapDataResult.data?.ws ?? false, mapDataResult.error ?? undefined);
                } catch (logErr) {
                    console.error('Failed to log MAP_DATA payload:', logErr);
                }
                
                console.log(`[map-selected] ✅ MAP_DATA sent for map_id=${payload.data.map_id} to robot_id=${robotId} (${base64Zip.length} chars base64)`);
            } else {
                console.warn(`[map-selected] ⚠️ Skipping MAP_DATA because map files could not be read or zipped for map_id=${payload.data.map_id}`);
            }

            return NextResponse.json(result);
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json({ error: error.message ?? 'Server error processing map-selected' }, { status: 500 });
        }
    }

    // === TALK: Voice Control Mode ===
    if (action === 'talk') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;
            if (!encoded_payload) return NextResponse.json({ error: 'Missing encoded_payload' }, { status: 400 });

            let payload;
            try {
                payload = decodePayload<TalkCommandPayload>(encoded_payload);
            } catch {
                return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
            }

            const { sendTalkCommand } = await import('@/lib/wsClient');
            const { logTalkToCommandLog } = await import('@/lib/api/robotControl');
            const result = await sendTalkCommand(payload);

            try {
                await logTalkToCommandLog(payload, result.sent, result.error);
            } catch (logErr) {
                console.error('Failed to log talk payload:', logErr);
            }

            return NextResponse.json(result);
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json({ error: error.message ?? 'Server error processing talk' }, { status: 500 });
        }
    }

    // === TELEOP DONE: finish manual movement ===
    if (action === 'teleop-done') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;

            if (!encoded_payload || typeof encoded_payload !== 'string') {
                return NextResponse.json(
                    { sent: false, error: 'Missing or invalid encoded_payload' },
                    { status: 400 }
                );
            }

            const payload = decodePayload<TeleopDoneCommandPayload>(encoded_payload);

            if (!payload.data?.robot_id) {
                return NextResponse.json(
                    { sent: false, error: 'Invalid teleop done payload: missing robot_id' },
                    { status: 400 }
                );
            }

            // Check robot online status (warn-but-send: command proceeds regardless)
            const teleopDoneRobotStatus = await isRobotOnline(payload.data.robot_id);
            const teleopDoneRobotMayBeOffline = !teleopDoneRobotStatus.online;
            if (teleopDoneRobotMayBeOffline) {
                console.warn(`[robot-control] ⚠️ Robot ${payload.data.robot_id} may be offline (last seen: ${teleopDoneRobotStatus.lastSeen}). Sending teleop-done command anyway.`);
            }

            // ui_id comes from frontend (per-session unique ID)

            const result = await sendTeleopDoneCommand(payload);

            // Log TELEOP_DONE to h_command_log (PM confirmed: goes to DB)
            try {
                await logTeleopDoneToCommandLog(payload, result.sent, result.error);
            } catch (logErr) {
                console.error('Failed to log teleop done payload:', logErr);
            }

            return NextResponse.json({ ...result, ...(teleopDoneRobotMayBeOffline ? { robot_may_be_offline: true, last_seen: teleopDoneRobotStatus.lastSeen } : {}) });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json(
                { sent: false, error: error.message ?? 'Server error' },
                { status: 500 }
            );
        }
    }

    // === NAVIGATION: send robot to move (HOMEBASE / CHARGING) ===
    if (action === 'move') {
        try {
            const body = await request.json();
            const { encoded_payload } = body;

            if (!encoded_payload || typeof encoded_payload !== 'string') {
                return NextResponse.json(
                    { data: null, error: 'Missing or invalid encoded_payload' },
                    { status: 400 }
                );
            }

            let payload: { device_id: number; goal_id: number; goal_type: 'HOMEBASE' | 'CHARGING'; map_id: number; robot_id: string; origin_id: string };
            try {
                payload = decodePayload(encoded_payload);
            } catch {
                return NextResponse.json(
                    { data: null, error: 'Failed to decode payload' },
                    { status: 400 }
                );
            }

            const { device_id, goal_id, goal_type, map_id, robot_id, origin_id } = payload;
            if (!device_id || !goal_id || !goal_type || !map_id || !robot_id || !origin_id) {
                return NextResponse.json(
                    { data: null, error: 'Missing required fields for MOVE' },
                    { status: 400 }
                );
            }

            // Check robot online status (warn-but-send: command proceeds regardless)
            const moveRobotStatus = await isRobotOnline(robot_id);
            const moveRobotMayBeOffline = !moveRobotStatus.online;
            if (moveRobotMayBeOffline) {
                console.warn(`[robot-control] ⚠️ Robot ${robot_id} may be offline (last seen: ${moveRobotStatus.lastSeen}). Sending MOVE command anyway.`);
            }

            const result = await sendRobotToMove(payload);
            return NextResponse.json({ ...result, ...(moveRobotMayBeOffline ? { robot_may_be_offline: true, last_seen: moveRobotStatus.lastSeen } : {}) });
        } catch (err: unknown) {
            const error = err as Error;
            return NextResponse.json(
                { data: null, error: error.message ?? 'Server error' },
                { status: 500 }
            );
        }
    }

    // === NAVIGATION: send robot to table ===
    try {
        const body = await request.json();
        const { encoded_payload } = body;

        if (!encoded_payload || typeof encoded_payload !== 'string') {
            return NextResponse.json(
                { data: null, error: 'Missing or invalid encoded_payload' },
                { status: 400 }
            );
        }

        // Decode payload from Base64 (per supervisor's guidance: encode in frontend, decode in backend)
        let payload: { device_id: number; tasks: { goal_id: number; tray: number }[]; map_id: number; robot_id: string; origin_id: string; speed?: string };
        try {
            payload = decodePayload(encoded_payload);
        } catch {
            return NextResponse.json(
                { data: null, error: 'Failed to decode payload' },
                { status: 400 }
            );
        }

        // Validate required fields
        const { device_id, tasks, map_id, robot_id, origin_id, speed } = payload;
        if (!device_id || !tasks || tasks.length === 0 || !map_id || !robot_id || !origin_id) {
            return NextResponse.json(
                { data: null, error: 'Missing required fields: device_id, tasks, map_id, robot_id, origin_id' },
                { status: 400 }
            );
        }

        // Check robot online status (warn-but-send: command proceeds regardless)
        const navRobotStatus = await isRobotOnline(robot_id);
        const navRobotMayBeOffline = !navRobotStatus.online;
        if (navRobotMayBeOffline) {
            console.warn(`[robot-control] ⚠️ Robot ${robot_id} may be offline (last seen: ${navRobotStatus.lastSeen}). Sending navigation command anyway.`);
        }

        for (const task of tasks) {
            if (task.tray < 1 || task.tray > 3) {
                return NextResponse.json(
                    { data: null, error: 'Tray must be 1, 2, or 3' },
                    { status: 400 }
                );
            }
        }

        // Send robot to table (OP command with speed)
        const result = await sendRobotToTable({ device_id, tasks, map_id, robot_id, origin_id, speed });
        return NextResponse.json({ ...result, ...(navRobotMayBeOffline ? { robot_may_be_offline: true, last_seen: navRobotStatus.lastSeen } : {}) });
    } catch (err: unknown) {
        const error = err as Error;
        return NextResponse.json(
            { data: null, error: error.message ?? 'Server error' },
            { status: 500 }
        );
    }
}
