import { NextResponse } from 'next/server';
import { getGoalsByMap, getActiveGoalQueues, countGoalsByType, getGoalQueue, createGoal, updateGoal, deleteGoal } from '@/lib/api/goals';
import { getCurrentUser } from '@/lib/api/auth';
import { rateLimiter } from '@/lib/rateLimiter';
import { query } from '@/lib/dbClient';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const mapId = searchParams.get('mapId');
    const deviceId = searchParams.get('deviceId');

    // Extract companyId from session
    const user = await getCurrentUser();
    const companyId = user.data?.role === 'super_admin' ? undefined : user.data?.companyId;

    if (action === 'by-map' && mapId) {
        const result = await getGoalsByMap(parseInt(mapId, 10));
        return NextResponse.json(result);
    }

    if (action === 'drafts-by-session') {
        const sessionToken = searchParams.get('sessionToken');
        if (!sessionToken) return NextResponse.json({ error: 'Missing sessionToken' }, { status: 400 });
        
        try {
            const rows = await query(
                `SELECT * FROM m_goal WHERE metadata->>'session_token' = $1`,
                [sessionToken]
            );
            return NextResponse.json({ data: rows, error: null });
        } catch (e: unknown) {
            return NextResponse.json({ data: null, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
        }
    }

    if (action === 'active-queues') {
        const result = await getActiveGoalQueues(companyId);
        return NextResponse.json(result);
    }

    if (action === 'count-by-type') {
        const result = await countGoalsByType(companyId);
        return NextResponse.json(result);
    }

    if (action === 'queue' && deviceId) {
        const result = await getGoalQueue(parseInt(deviceId, 10));
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action or missing parameters' }, { status: 400 });
}

export async function POST(request: Request) {
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateCheck = rateLimiter.check(`goals:post:${clientIp}`, 30, 60000);

    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: `Rate limit exceeded. Please wait ${rateCheck.retryAfterSec} seconds.` },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': String(rateCheck.limit),
                    'X-RateLimit-Remaining': String(rateCheck.remaining),
                    'Retry-After': String(rateCheck.retryAfterSec),
                },
            }
        );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'draft-goal') {
        try {
            const body = await request.json();
            const { sessionToken, goalName, goalCode, goalType, x, y, z, yaw, deviceId } = body;

            if (!sessionToken || !goalName) {
                return NextResponse.json({ error: 'Missing req fields' }, { status: 400 });
            }

            const safeX = typeof x === 'number' ? x : parseFloat(x || 0);
            const safeY = typeof y === 'number' ? y : parseFloat(y || 0);
            const safeYaw = typeof yaw === 'number' ? yaw : parseFloat(yaw || 0);
            const safeZ = typeof z === 'number' ? z : parseFloat(z || 0);

            const metadata = JSON.stringify({ session_token: sessionToken, pos_z: safeZ, device_id: deviceId });
            
            const insertRes = await query(
                `INSERT INTO m_goal (map_id, goal_name, goal_code, goal_type, x, y, yaw, metadata, created_at)
                 VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
                [goalName, goalCode || goalName, goalType || 'CUSTOM', safeX, safeY, safeYaw, metadata]
            );

            return NextResponse.json({ data: insertRes[0], error: null });
        } catch (e: unknown) {
            console.error('[Goals API] Draft Goal Insert Error:', e);
            const msg = e instanceof Error ? e.message : 'Database Insert Failed';
            return NextResponse.json({ data: null, error: msg }, { status: 500 });
        }
    }

    if (action === 'create') {
        try {
            const body = await request.json();
            const { mapId, goalName, goalCode, goalType, x, y, yaw } = body;
            if (!goalName) return NextResponse.json({ error: 'Missing goalName' }, { status: 400 });

            const result = await createGoal(mapId || null, goalName, goalCode, goalType, parseFloat(x || 0), parseFloat(y || 0), parseFloat(yaw || 0));
            return NextResponse.json(result);
        } catch (e: unknown) {
            return NextResponse.json({ data: null, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
        }
    }

    if (action === 'update') {
        try {
            const body = await request.json();
            const { goalId, goalName, goalCode, goalType, x, y, yaw } = body;
            if (!goalId || !goalName) return NextResponse.json({ error: 'Missing goalId or goalName' }, { status: 400 });

            const result = await updateGoal(goalId, goalName, goalCode, goalType, parseFloat(x || 0), parseFloat(y || 0), parseFloat(yaw || 0));
            return NextResponse.json(result);
        } catch (e: unknown) {
            return NextResponse.json({ data: null, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
        }
    }

    return NextResponse.json({ error: 'Invalid POST/PUT action' }, { status: 400 });
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'delete') {
        const goalId = searchParams.get('id');
        if (!goalId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
        
        const result = await deleteGoal(parseInt(goalId, 10));
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid DELETE action' }, { status: 400 });
}
