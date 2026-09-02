import { NextResponse } from 'next/server';
import { signIn, signOut, getCurrentUser, updateUserProfile } from '@/lib/api/auth';
import { rateLimiter } from '@/lib/rateLimiter';
import { recordAuditLog } from '@/lib/api/auditLogger';

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    if (action === 'signin') {
        const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
        const rateCheck = rateLimiter.check(`auth:signin:${clientIp}`, 5, 60000);

        if (!rateCheck.allowed) {
            return NextResponse.json(
                { success: false, error: `Too many login attempts. Please try again in ${rateCheck.retryAfterSec} seconds.` },
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

        const result = await signIn(body.email, body.password);
        const response = NextResponse.json(result);
        if (result.success && result.sessionId) {
            response.cookies.set('tifa_session', result.sessionId, { path: '/', httpOnly: true });
            void recordAuditLog({
                userEmail: body.email,
                companyId: result.user?.companyId ?? 1,
                action: 'USER_LOGIN_SUCCESS',
                resourceType: 'USER',
                details: { role: result.user?.role },
                ipAddress: clientIp,
            });
        } else {
            void recordAuditLog({
                userEmail: body.email,
                action: 'USER_LOGIN_FAILED',
                resourceType: 'USER',
                details: { error: result.error },
                ipAddress: clientIp,
            });
        }
        return response;
    }

    if (action === 'signup') {
        return NextResponse.json({ success: false, error: 'Registration is disabled. Contact administrator.' }, { status: 403 });
    }

    if (action === 'signout') {
        // Read session from cookie for cleanup
        const { cookies } = await import('next/headers');
        const sid = (await cookies()).get('tifa_session')?.value;

        // Release WS lock if the logging out user is the owner
        const userResponse = await getCurrentUser();
        const user = userResponse.data;
        
        if (user && user.email) {
            const { getSettings, saveSettings } = await import('@/lib/settings');
            const settings = getSettings();
            if (settings.activeUserEmail === user.email) {
                saveSettings({
                    isWsTurnedOn: false,
                    activeUserEmail: null
                });
                const { disconnectWs } = await import('@/lib/wsClient');
                disconnectWs();
            }
        }

        const result = await signOut(sid);
        const response = NextResponse.json(result);
        response.cookies.set('tifa_session', '', { path: '/', httpOnly: true, maxAge: 0 });
        return response;
    }

    if (action === 'update-profile') {
        const result = await updateUserProfile(body);
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function GET() {
    const result = await getCurrentUser();
    return NextResponse.json(result);
}
