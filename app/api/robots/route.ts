import { NextResponse } from 'next/server';
import { getRobots, getRecentRobots, getRobotCount, createRobot } from '@/lib/api/robots';
import { getCurrentUser } from '@/lib/api/auth';
import type { CreateRobotInput } from '@/lib/types/database';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const action = searchParams.get('action');
    const user = await getCurrentUser();
    // SUPER_ADMIN sees all; others filtered by company
    const companyId = user.data?.role === 'super_admin' ? undefined : user.data?.companyId;

    if (action === 'recent') {
        const limit = parseInt(searchParams.get('limit') ?? '5', 10);
        const result = await getRecentRobots(limit, companyId);
        return NextResponse.json(result);
    }

    if (action === 'count') {
        const result = await getRobotCount(companyId);
        return NextResponse.json(result);
    }

    const result = await getRobots(search, companyId);
    return NextResponse.json(result);
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    const role = user.data?.role;
    if (!role || (role !== 'admin' && role !== 'super_admin')) {
        return NextResponse.json({ data: null, error: 'Forbidden: Admin only' }, { status: 403 });
    }
    const body: CreateRobotInput = await request.json();
    const result = await createRobot(body);
    return NextResponse.json(result);
}

