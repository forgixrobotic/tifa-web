import { NextResponse } from 'next/server';
import { query } from '@/lib/dbClient';
import { getCurrentUser } from '@/lib/api/auth';
import bcrypt from 'bcryptjs';

/**
 * GET /api/company - List all companies (super_admin only)
 */
export async function GET() {
    try {
        const userRes = await getCurrentUser();
        const user = userRes.data;

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Forbidden: Only super_admin can list companies' }, { status: 403 });
        }

        const companies = await query<{
            company_id: number;
            company_code: string;
            company_name: string;
            created_at: string;
        }>(`SELECT company_id, company_code, company_name, created_at FROM m_company ORDER BY company_id ASC`);

        return NextResponse.json({ success: true, data: companies });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * POST /api/company - Create a new company with an admin account (super_admin only)
 * Body: { companyName: string, companyCode: string, adminEmail: string, adminPassword: string }
 */
export async function POST(request: Request) {
    try {
        const userRes = await getCurrentUser();
        const user = userRes.data;

        if (!user || !user.email) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Forbidden: Only super_admin can create companies' }, { status: 403 });
        }

        const body = await request.json();
        const { companyName, companyCode, adminEmail, adminPassword } = body;

        if (!companyName || !adminEmail || !adminPassword) {
            return NextResponse.json({ success: false, error: 'Missing required fields: companyName, adminEmail, adminPassword' }, { status: 400 });
        }

        // Check if company code already exists
        const code = companyCode || companyName.toUpperCase().replace(/\s+/g, '_').slice(0, 20);
        const existing = await query<{ company_id: number }>(
            `SELECT company_id FROM m_company WHERE company_code = $1`,
            [code]
        );
        if (existing.length > 0) {
            return NextResponse.json({ success: false, error: `Company code '${code}' already exists` }, { status: 409 });
        }

        // Check if admin email already exists
        const existingUser = await query<{ user_id: number }>(
            `SELECT user_id FROM t_user WHERE email = $1`,
            [adminEmail]
        );
        if (existingUser.length > 0) {
            return NextResponse.json({ success: false, error: `Email '${adminEmail}' is already registered` }, { status: 409 });
        }

        // 1. Create Company
        const companyResult = await query<{ company_id: number }>(
            `INSERT INTO m_company (company_code, company_name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING company_id`,
            [code, companyName]
        );
        const newCompanyId = companyResult[0].company_id;

        // 2. Hash password
        const passwordHash = await bcrypt.hash(adminPassword, 10);

        // 3. Create Admin User
        const userResult = await query<{ user_id: number }>(
            `INSERT INTO t_user (username, email, password_hash, is_active, company_id, created_at, updated_at) VALUES ($1, $2, $3, true, $4, NOW(), NOW()) RETURNING user_id`,
            [adminEmail.split('@')[0], adminEmail, passwordHash, newCompanyId]
        );
        const newUserId = userResult[0].user_id;

        // 4. Assign ADMIN role
        const adminRole = await query<{ role_id: number }>(
            `SELECT role_id FROM m_role WHERE UPPER(role_code) = 'ADMIN' LIMIT 1`
        );
        if (adminRole.length > 0) {
            await query(
                `INSERT INTO t_user_role (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [newUserId, adminRole[0].role_id]
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                company: { company_id: newCompanyId, company_code: code, company_name: companyName },
                admin: { user_id: newUserId, email: adminEmail, role: 'admin' },
            },
            message: `Company '${companyName}' created with admin account '${adminEmail}'`,
        });
    } catch (error: any) {
        console.error('[API /api/company] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * PUT /api/company - Edit a company (super_admin only)
 * Body: { companyId: number, companyName: string }
 */
export async function PUT(request: Request) {
    try {
        const userRes = await getCurrentUser();
        if (userRes.data?.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
        const { companyId, companyName } = await request.json();
        if (!companyId || !companyName) {
            return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
        }
        await query(
            `UPDATE m_company SET company_name = $1, updated_at = NOW() WHERE company_id = $2`,
            [companyName, companyId]
        );
        return NextResponse.json({ success: true, message: 'Company updated' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/company - Delete a company (super_admin only)
 * Body: { companyId: number }
 */
export async function DELETE(request: Request) {
    try {
        const userRes = await getCurrentUser();
        if (userRes.data?.role !== 'super_admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
        const { companyId } = await request.json();
        if (!companyId) {
            return NextResponse.json({ success: false, error: 'Missing companyId' }, { status: 400 });
        }
        // Find all users for this company
        const usersInCompany = await query<{ user_id: number }>(`SELECT user_id FROM t_user WHERE company_id = $1`, [companyId]);

        if (usersInCompany.length > 0) {
            // Delete user roles associated with this company
            await query(`DELETE FROM t_user_role WHERE user_id IN (SELECT user_id FROM t_user WHERE company_id = $1)`, [companyId]);
            // Delete users
            await query(`DELETE FROM t_user WHERE company_id = $1`, [companyId]);
        }

        // We should also delete maps or goals if they belong to the company, or assume it's fine if there are no FK constraints yet.
        await query(`DELETE FROM m_company WHERE company_id = $1`, [companyId]);
        return NextResponse.json({ success: true, message: 'Company and associated users deleted' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
