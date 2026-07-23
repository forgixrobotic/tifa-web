import { NextResponse } from 'next/server';
import { getAllDeviceStatus, getLowBatteryDevices, getDevicesByMode } from '@/lib/api/deviceStatus';
import { getCurrentUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

async function getCompanyId(): Promise<number | undefined> {
    const user = await getCurrentUser();
    if (user.data?.role === 'super_admin') return undefined;
    return user.data?.companyId;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const mode = searchParams.get('mode');
    const companyId = await getCompanyId();

    if (action === 'low-battery') {
        const result = await getLowBatteryDevices(companyId);
        return NextResponse.json(result);
    }

    if (action === 'by-mode' && mode) {
        const result = await getDevicesByMode(mode, companyId);
        return NextResponse.json(result);
    }

    // Get active robots (status updated within 5 minutes)
    if (action === 'active') {
        const { data, error } = await getAllDeviceStatus(companyId);
        if (error || !data) {
            return NextResponse.json({ data: null, error });
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeDevices = data.filter(d => {
            if (!d.status_updated_at) return false;
            return new Date(d.status_updated_at) > fiveMinutesAgo;
        });

        return NextResponse.json({ data: activeDevices, error: null });
    }

    // Get inactive robots (no status update within 5 minutes)
    if (action === 'inactive') {
        const { data, error } = await getAllDeviceStatus(companyId);
        if (error || !data) {
            return NextResponse.json({ data: null, error });
        }

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const inactiveDevices = data.filter(d => {
            if (!d.status_updated_at) return true;
            return new Date(d.status_updated_at) <= fiveMinutesAgo;
        });

        return NextResponse.json({ data: inactiveDevices, error: null });
    }

    const result = await getAllDeviceStatus(companyId);
    return NextResponse.json(result);
}
