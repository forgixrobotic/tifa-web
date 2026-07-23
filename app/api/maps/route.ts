import { NextResponse } from 'next/server';
import { getAllMaps, getMapsByFloor, getMapCount } from '@/lib/api/maps';
import { getCurrentUser } from '@/lib/api/auth';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const floor = searchParams.get('floor');
    const user = await getCurrentUser();
    const companyId = user.data?.role === 'super_admin' ? undefined : user.data?.companyId;

    if (action === 'by-floor' && floor) {
        const result = await getMapsByFloor(floor, companyId);
        return NextResponse.json(result);
    }

    if (action === 'count') {
        const result = await getMapCount(companyId);
        return NextResponse.json(result);
    }

    const result = await getAllMaps(companyId);
    return NextResponse.json(result);
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'delete' && id) {
        const { deleteMap } = await import('@/lib/api/maps');
        const result = await deleteMap(parseInt(id, 10));
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action or id' }, { status: 400 });
}
