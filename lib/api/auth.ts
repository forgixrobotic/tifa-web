// Auth API - Abstraction layer for authentication operations
// Uses local PostgreSQL database (t_user table) instead of Supabase Auth
// Note: For production, implement proper JWT or session-based auth

import { query } from '@/lib/dbClient';
import type { AuthUser, SignInResult, ApiResult } from '@/lib/types/database';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// In-memory session store (for development only)
// In production, use proper session management (Redis, JWT, etc.)
const sessionStore = new Map<string, AuthUser>();
export { sessionStore };

/**
 * Sign in with email/username and password
 * Verifies password using BCrypt. Auto-migrates legacy plain-text passwords to BCrypt hashes on successful login.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
    try {
        // Query user from t_user table
        const users = await query<{
            user_id: number;
            username: string;
            email: string | null;
            password_hash: string | null;
            is_active: boolean;
            company_id: number | null;
        }>(
            `SELECT user_id, username, email, password_hash, is_active, company_id
             FROM t_user
             WHERE (email = $1 OR username = $1) AND is_active = true`,
            [email]
        );

        if (users.length === 0) {
            return { success: false, error: "User not found" };
        }

        const user = users[0];

        if (!user.password_hash) {
            return { success: false, error: "Password not set for user" };
        }

        let isPasswordValid = false;
        const isBcryptHash = user.password_hash.startsWith('$2a$') || 
                             user.password_hash.startsWith('$2b$') || 
                             user.password_hash.startsWith('$2y$');

        if (isBcryptHash) {
            // Compare using BCrypt
            isPasswordValid = await bcrypt.compare(password, user.password_hash);
        } else {
            // Legacy check: plain-text comparison
            isPasswordValid = (user.password_hash === password);
            
            // Auto-migrate legacy plain-text password to BCrypt hash if valid
            if (isPasswordValid) {
                try {
                    const newHash = await bcrypt.hash(password, 10);
                    await query(
                        `UPDATE t_user SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`,
                        [newHash, user.user_id]
                    );
                    console.log(`[Auth] 🔒 Successfully auto-migrated password for user ${user.username} to BCrypt!`);
                } catch (migrationErr) {
                    console.error('[Auth] Failed to auto-migrate password hash:', migrationErr);
                }
            }
        }

        if (!isPasswordValid) {
            return { success: false, error: "Invalid password" };
        }

        // Get user role from t_user_role and m_role tables
        const roles = await query<{ role_code: string }>(
            `SELECT r.role_code
             FROM t_user_role ur
             JOIN m_role r ON ur.role_id = r.role_id
             WHERE ur.user_id = $1
             LIMIT 1`,
            [user.user_id]
        );

        const userRole = roles[0]?.role_code?.toLowerCase() ?? 'operator';

        // Validate role
        if (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'operator') {
            return { success: false, error: "Invalid user role. Please contact administrator." };
        }

        // Create a unique session ID
        const sessionId = crypto.randomUUID();

        // Store in simple session map
        const userObj: AuthUser = {
            id: user.user_id.toString(),
            email: user.email ?? user.username,
            role: userRole as 'super_admin' | 'admin' | 'operator',
            companyId: user.company_id ?? undefined,
            user_metadata: { role: userRole },
        };
        
        sessionStore.set(sessionId, userObj);
        
        // NOTE: Cookie is set in the route handler (app/api/auth/route.ts) via response.cookies.set()
        // to ensure it survives NextResponse.json() creation. Do NOT call cookies().set() here.

        // Fetch JWT token from tifa-be for WebSocket authentication
        let jwtToken: string | undefined;
        try {
            const beUrl = process.env.TIFA_BE_URL || 'http://localhost:8080';
            const beResponse = await fetch(`${beUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.username, password }),
                signal: AbortSignal.timeout(5000),
            });
            if (beResponse.ok) {
                const beData = await beResponse.json();
                jwtToken = beData.token;
                console.log(`[Auth] ✅ JWT token obtained from tifa-be for ${user.username}`);
            } else {
                console.warn(`[Auth] ⚠️ tifa-be login returned ${beResponse.status}, WS auth will be degraded`);
            }
        } catch (beErr) {
            console.warn('[Auth] ⚠️ tifa-be unreachable, WS auth will be degraded:', (beErr as Error)?.message);
        }

        return {
            success: true,
            user: userObj,
            token: jwtToken,
            sessionId,
        };
    } catch (err: unknown) {
        const error = err as Error;
        console.error("SignIn Error:", error);
        return { success: false, error: error.message ?? 'Database error' };
    }
}

// signUp function removed — registration is disabled.
// Only pre-registered admin/operator users in the database can log in.

/**
 * Sign out current user
 * @param sessionId Optional session ID. If not provided, reads from cookie.
 */
export async function signOut(sessionId?: string): Promise<ApiResult<null>> {
    const sid = sessionId || (await cookies()).get('tifa_session')?.value;
    if (sid) {
        sessionStore.delete(sid);
    }
    return { data: null, error: null };
}

/**
 * Get session from store (no cookies needed)
 */
export function getSession(sessionId: string): AuthUser | undefined {
    return sessionStore.get(sessionId);
}

/**
 * Get current authenticated user
 * Note: This uses simple in-memory session for development
 */
export async function getCurrentUser(): Promise<ApiResult<AuthUser | null>> {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('tifa_session')?.value;
    
    if (!sessionId) {
        return { data: null, error: null };
    }
    
    const user = sessionStore.get(sessionId) || null;
    
    return {
        data: user,
        error: null,
    };
}

/**
 * Update user profile
 */
export async function updateUserProfile(data: { email?: string; password?: string }): Promise<ApiResult<null>> {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('tifa_session')?.value;
    if (!sessionId) return { data: null, error: "Not authenticated" };
    
    const currentUser = sessionStore.get(sessionId);
    if (!currentUser) {
        return { data: null, error: "Not authenticated" };
    }

    try {
        const updates: string[] = [];
        const params: (string | number)[] = [];
        let paramIndex = 1;

        if (data.email) {
            updates.push(`email = $${paramIndex}`);
            params.push(data.email);
            paramIndex++;
        }

        if (data.password) {
            // Hash the password with BCrypt
            const hashedPassword = await bcrypt.hash(data.password, 10);
            updates.push(`password_hash = $${paramIndex}`);
            params.push(hashedPassword);
            paramIndex++;
        }

        if (updates.length === 0) {
            return { data: null, error: null };
        }

        updates.push(`updated_at = NOW()`);
        params.push(parseInt(currentUser.id, 10));

        await query(
            `UPDATE t_user SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
            params
        );

        // Update local session if email changed
        if (data.email) {
            currentUser.email = data.email;
            sessionStore.set(sessionId, currentUser);
        }

        return {
            data: null,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}
