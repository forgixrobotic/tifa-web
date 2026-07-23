import { NextResponse } from 'next/server';
import { getRobotById, updateRobot, deleteRobot } from '@/lib/api/robots';
import { getCurrentUser } from '@/lib/api/auth';
import type { UpdateRobotInput } from '@/lib/types/database';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const result = await getRobotById(parseInt(id, 10));
    return NextResponse.json(result);
}

async function requireAdmin(): Promise<{ error?: { error: string; status: number } }> {
    const user = await getCurrentUser();
    if (!user.data || user.data.role !== 'admin') {
        return { error: { error: 'Forbidden: Admin only', status: 403 } };
    }
    return {};
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireAdmin();
    if (guard.error) return NextResponse.json({ data: null, ...guard.error }, { status: guard.error.status });
    const { id } = await params;
    const body: UpdateRobotInput = await request.json();
    const result = await updateRobot(parseInt(id, 10), body);
    return NextResponse.json(result);
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireAdmin();
    if (guard.error) return NextResponse.json({ data: null, ...guard.error }, { status: guard.error.status });
    const { id } = await params;
    const result = await deleteRobot(parseInt(id, 10));
    return NextResponse.json(result);
}
