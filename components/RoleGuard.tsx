"use client";

import type { ReactNode } from "react";
import { isAdmin, isOperator, type UserRole } from "@/lib/auth/role";

type RoleGuardProps = {
    children: ReactNode;
    userRole: string | undefined | null;
    allowedRoles: UserRole[];
    fallback?: ReactNode;
};

export default function RoleGuard({ children, userRole, allowedRoles, fallback = null }: RoleGuardProps) {
    if (!userRole) return fallback;
    if (allowedRoles.includes(userRole as UserRole)) return <>{children}</>;
    return <>{fallback}</>;
}

export function AdminOnly({ children, userRole, fallback = null }: { children: ReactNode; userRole: string | undefined | null; fallback?: ReactNode }) {
    return <RoleGuard userRole={userRole} allowedRoles={['admin']} fallback={fallback}>{children}</RoleGuard>;
}

export function OperatorOnly({ children, userRole, fallback = null }: { children: ReactNode; userRole: string | undefined | null; fallback?: ReactNode }) {
    return <RoleGuard userRole={userRole} allowedRoles={['operator']} fallback={fallback}>{children}</RoleGuard>;
}
