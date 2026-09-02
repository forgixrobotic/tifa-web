import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/settings';
import { manualConnectWs, disconnectWs } from '@/lib/wsClient';
import { getCurrentUser, getSession } from '@/lib/api/auth';

async function resolveUserAndToken(request: Request): Promise<{ id: string; email: string; role: string; jwtToken?: string } | null> {
    // Extract JWT from Authorization header FIRST — needed by all auth methods
    const authHeader = request.headers.get('Authorization');
    const jwtToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    // Try 1: cookie-based session
    const userRes = await getCurrentUser();
    if (userRes.data?.email) {
        return { id: userRes.data.id, email: userRes.data.email, role: userRes.data.role, jwtToken };
    }

    // Try 2: sessionId from cookie, direct store lookup or DB fallback
    const { cookies } = await import('next/headers');
    const sid = (await cookies()).get('tifa_session')?.value;
    if (sid) {
        const sessionUser = getSession(sid);
        if (sessionUser?.email) {
            return { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role, jwtToken };
        }

        // Fallback: Query active user from DB if dev server restarted and cleared in-memory sessionStore
        try {
            const { query } = await import('@/lib/dbClient');
            const rows = await query<{ user_id: number; email: string; role_code: string }>(`
                SELECT u.user_id, u.email, COALESCE(r.role_code, 'SUPER_ADMIN') as role_code
                FROM t_user u
                LEFT JOIN t_user_role ur ON u.user_id = ur.user_id
                LEFT JOIN m_role r ON ur.role_id = r.role_id
                WHERE u.is_active = true
                ORDER BY u.user_id ASC
                LIMIT 1
            `);
            if (rows.length > 0) {
                return {
                    id: String(rows[0].user_id),
                    email: rows[0].email,
                    role: rows[0].role_code.toLowerCase(),
                    jwtToken,
                };
            }
        } catch {
            // DB fallback failed
        }
    }

    // Try 3: JWT from Authorization header (validate against tifa-be)
    if (jwtToken) {
        const beUrl = process.env.TIFA_BE_URL || 'http://localhost:8080';
        try {
            const valRes = await fetch(`${beUrl}/auth/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: jwtToken }),
                signal: AbortSignal.timeout(3000),
            });
            if (valRes.ok) {
                const valData = await valRes.json();
                if (valData.valid && valData.user?.email) {
                    return { id: String(valData.user.userId || ''), email: valData.user.email, role: valData.user.role || 'operator', jwtToken };
                }
            }
        } catch { /* tifa-be down, fallback fails */ }
    }

    return null;
}

export async function GET() {
    try {
        const settings = getSettings();
        return NextResponse.json({
            success: true,
            isWsTurnedOn: settings.isWsTurnedOn || false,
            activeUserEmail: settings.activeUserEmail || null
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const action = body.action;

        const user = await resolveUserAndToken(request);

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // All authenticated users (super_admin, admin, operator) can control WebSocket
        // Previously restricted to admin-only; updated per user request to allow barista/operator access

        const settings = getSettings();

        if (action === 'turn-on') {
            if (settings.isWsTurnedOn && settings.activeUserEmail && settings.activeUserEmail !== user.email) {
                return NextResponse.json({ success: false, error: `WebSocket is already in use by ${settings.activeUserEmail}` }, { status: 403 });
            }

            saveSettings({
                isWsTurnedOn: true,
                activeUserEmail: user.email
            });

            await manualConnectWs(user.jwtToken);
            return NextResponse.json({ success: true, message: 'WebSocket turned on successfully', activeUserEmail: user.email });
        }

        if (action === 'turn-off') {
            if (settings.isWsTurnedOn && settings.activeUserEmail && settings.activeUserEmail !== user.email) {
                // Determine if we allow an override. For now, strict lock.
                return NextResponse.json({ success: false, error: `Cannot turn off. Session is owned by ${settings.activeUserEmail}` }, { status: 403 });
            }

            saveSettings({
                isWsTurnedOn: false,
                activeUserEmail: null
            });

            disconnectWs();
            return NextResponse.json({ success: true, message: 'WebSocket turned off successfully' });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
