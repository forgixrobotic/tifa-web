import { NextResponse } from 'next/server';
import { getPaginatedAuditLogs } from '@/lib/api/auditLogger';
import { getCurrentUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '10', 10); // Default 10 per page
    const search = searchParams.get('search') ?? undefined;
    const action = searchParams.get('action') ?? undefined;

    // RBAC Check: Only authenticated users can access audit logs
    const userRes = await getCurrentUser();
    const user = userRes.data;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let companyId: number | undefined;
    if (user.role?.toLowerCase() !== 'super_admin') {
        companyId = user.companyId ?? 1;
    }

    const result = await getPaginatedAuditLogs({
        page,
        limit,
        search,
        action,
        companyId,
    });

    return NextResponse.json(result);
}
