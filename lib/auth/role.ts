export type UserRole = 'super_admin' | 'admin' | 'operator';

export function isSuperAdmin(role: string | undefined | null): boolean {
    return role === 'super_admin';
}

export function isAdmin(role: string | undefined | null): boolean {
    return role === 'admin' || role === 'super_admin';
}

export function isOperator(role: string | undefined | null): boolean {
    return role === 'operator';
}

export function canManageRobots(role: string | undefined | null): boolean {
    return role === 'admin' || role === 'super_admin';
}

export function canManageMaps(role: string | undefined | null): boolean {
    return role === 'admin' || role === 'super_admin';
}

export function canDelete(role: string | undefined | null): boolean {
    return role === 'admin' || role === 'super_admin';
}

export function canUpload(role: string | undefined | null): boolean {
    return role === 'admin' || role === 'super_admin';
}

