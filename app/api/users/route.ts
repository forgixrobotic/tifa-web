import { NextResponse } from 'next/server';
import { query } from '@/lib/dbClient';
import { getCurrentUser } from '@/lib/api/auth';
import bcrypt from 'bcryptjs';

/**
 * GET /api/users - List users in your company
 * super_admin: See all users
 * admin: See users in own company
 * operator: Forbidden
 */
export async function GET() {
    try {
        const userRes = await getCurrentUser();
        const user = userRes.data;

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        let users;
        if (user.role === 'super_admin') {
            users = await query<{
                user_id: number; username: string; email: string;
                is_active: boolean; company_id: number | null;
                role_code: string | null; company_name: string | null;
            }>(`
                SELECT u.user_id, u.username, u.email, u.is_active, u.company_id,
                       r.role_code, c.company_name
                FROM t_user u
                LEFT JOIN t_user_role ur ON u.user_id = ur.user_id
                LEFT JOIN m_role r ON ur.role_id = r.role_id
                LEFT JOIN m_company c ON u.company_id = c.company_id
                ORDER BY u.user_id ASC
            `);
        } else {
            // Admin: only see users in same company
            users = await query<{
                user_id: number; username: string; email: string;
                is_active: boolean; company_id: number | null;
                role_code: string | null; company_name: string | null;
            }>(`
                SELECT u.user_id, u.username, u.email, u.is_active, u.company_id,
                       r.role_code, c.company_name
                FROM t_user u
                LEFT JOIN t_user_role ur ON u.user_id = ur.user_id
                LEFT JOIN m_role r ON ur.role_id = r.role_id
                LEFT JOIN m_company c ON u.company_id = c.company_id
                WHERE u.company_id = $1
                ORDER BY u.user_id ASC
            `, [user.companyId]);
        }

        return NextResponse.json({ success: true, data: users });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/users - Create a new user (barista/operator)
 * super_admin: Can create any user in any company
 * admin: Can only create operator/barista in their own company
 * Body: { email: string, password: string, companyId?: number }
 */
export async function POST(request: Request) {
    try {
        const userRes = await getCurrentUser();
        const user = userRes.data;

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role === 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden: Operators cannot create users' }, { status: 403 });
        }

        const body = await request.json();
        const { email, password, companyId } = body;

        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Missing required fields: email, password' }, { status: 400 });
        }

        // Determine target company
        let targetCompanyId: number | null = null;
        if (user.role === 'super_admin') {
            targetCompanyId = companyId || null; // Super admin can specify any company
        } else {
            // Admin: force to own company
            targetCompanyId = user.companyId ?? null;
        }

        // Check if email already exists
        const existingUser = await query<{ user_id: number }>(
            `SELECT user_id FROM t_user WHERE email = $1`,
            [email]
        );
        if (existingUser.length > 0) {
            return NextResponse.json({ success: false, error: `Email '${email}' is already registered` }, { status: 409 });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const username = email.split('@')[0];
        const newUserResult = await query<{ user_id: number }>(
            `INSERT INTO t_user (username, email, password_hash, is_active, company_id, created_at, updated_at) VALUES ($1, $2, $3, true, $4, NOW(), NOW()) RETURNING user_id`,
            [username, email, passwordHash, targetCompanyId]
        );
        const newUserId = newUserResult[0].user_id;

        // Assign OPERATOR role (barista)
        const operatorRole = await query<{ role_id: number }>(
            `SELECT role_id FROM m_role WHERE UPPER(role_code) = 'OPERATOR' LIMIT 1`
        );
        if (operatorRole.length > 0) {
            await query(
                `INSERT INTO t_user_role (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [newUserId, operatorRole[0].role_id]
            );
        }

        return NextResponse.json({
            success: true,
            data: { user_id: newUserId, email, role: 'operator', company_id: targetCompanyId },
            message: `Barista account '${email}' created successfully`,
        });
    } catch (error: any) {
        console.error('[API /api/users] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/users - Edit user (active status, password reset, etc)
 * Body: { userId: number, isActive?: boolean, password?: string }
 */
export async function PUT(request: Request) {
    try {
        const userRes = await getCurrentUser();
        if (!userRes.data?.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        if (userRes.data.role === 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, isActive, password } = body;
        if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

        // Admin check: if admin, can only edit users in their company
        if (userRes.data.role === 'admin') {
            const targetUser = await query<{company_id: number}>(`SELECT company_id FROM t_user WHERE user_id = $1`, [userId]);
            if (!targetUser.length || targetUser[0].company_id !== userRes.data.companyId) {
                return NextResponse.json({ success: false, error: 'Forbidden: User not in your company' }, { status: 403 });
            }
        }

        if (isActive !== undefined) {
            await query(`UPDATE t_user SET is_active = $1, updated_at = NOW() WHERE user_id = $2`, [isActive, userId]);
        }
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await query(`UPDATE t_user SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`, [hash, userId]);
        }

        return NextResponse.json({ success: true, message: 'User updated' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/users - Delete user
 * Body: { userId: number }
 */
export async function DELETE(request: Request) {
    try {
        const userRes = await getCurrentUser();
        if (!userRes.data?.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        if (userRes.data.role === 'operator') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const { userId } = await request.json();
        if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

        if (userRes.data.role === 'admin') {
            const targetUser = await query<{company_id: number}>(`SELECT company_id FROM t_user WHERE user_id = $1`, [userId]);
            if (!targetUser.length || targetUser[0].company_id !== userRes.data.companyId) {
                return NextResponse.json({ success: false, error: 'Forbidden: User not in your company' }, { status: 403 });
            }
        }

        await query(`DELETE FROM t_user_role WHERE user_id = $1`, [userId]);
        await query(`DELETE FROM t_user WHERE user_id = $1`, [userId]);
        
        return NextResponse.json({ success: true, message: 'User deleted' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
