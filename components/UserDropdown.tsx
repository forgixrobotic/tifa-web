"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

interface UserDropdownProps {
    email: string;
    role: string;
    onLogoutClick: () => void;
}

export default function UserDropdown({
    email,
    role,
    onLogoutClick,
}: UserDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { dict } = useLanguage();

    // Get role display name
    const getRoleDisplayName = () => {
        if (role === "super_admin") {
            return "Super Admin";
        }
        if (role === "admin") {
            return dict.auth.roles.admin || "Administrator";
        }
        return dict.auth.roles.operator || "Operator";
    };

    // Get role color
    const getRoleColor = () => {
        if (role === "super_admin") {
            return "text-amber-600 dark:text-amber-400 font-semibold";
        }
        if (role === "admin") {
            return "text-blue-700 dark:text-blue-400";
        }
        return "text-indigo-700 dark:text-indigo-400";
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Close on ESC
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-card-bg border border-transparent hover:border-border-base transition-all"
            >
                {/* User Info */}
                <div className="text-right hidden sm:block">
                    <span className="block text-xs font-medium text-txt-main truncate max-w-[150px]">
                        {email}
                    </span>
                    <span className={`block text-[10px] font-medium ${getRoleColor()}`}>
                        {getRoleDisplayName()}
                    </span>
                </div>

                {/* Avatar */}
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-300 dark:border-blue-500/30 flex items-center justify-center text-[12px] font-semibold text-white shadow-lg shadow-blue-900/20">
                    {email.charAt(0).toUpperCase()}
                </div>

                {/* Chevron */}
                <svg
                    className={`w-4 h-4 text-txt-sec transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 glass-panel rounded-xl shadow-2xl border border-border-base overflow-hidden z-50 animate-slide-up">
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b border-border-base bg-sidebar">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-300 dark:border-blue-500/30 flex items-center justify-center text-sm font-semibold text-white">
                                {email.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-txt-main truncate">
                                    {email}
                                </p>
                                <p className={`text-xs font-medium ${getRoleColor()}`}>
                                    {getRoleDisplayName()}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                        {/* Manage Account */}
                        <Link
                            href="/account"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-txt-sec hover:bg-card-bg hover:text-txt-main transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                            </svg>
                            {dict.dashboard.account?.manage || "Kelola Akun"}
                        </Link>


                        {/* Divider */}
                        <div className="my-2 border-t border-border-base" />

                        {/* Logout */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                onLogoutClick();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:bg-rose-500/10 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                            {dict.dashboard.sidebar.logout}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
