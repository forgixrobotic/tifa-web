"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut as apiSignOut } from "@/lib/api";
import { clearSessionUiId } from "@/lib/sessionId";
import { useLanguage } from "@/components/LanguageProvider";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import UserDropdown from "@/components/UserDropdown";
import LogoutConfirmDialog from "@/components/LogoutConfirmDialog";
import RobotReadyToast from "@/components/RobotReadyToast";
import WebSocketSessionControl from "@/components/WebSocketSessionControl";
import { canManageRobots, canManageMaps, isAdmin, isSuperAdmin } from "@/lib/auth/role";

type UserInfo = {
  id: string;
  email: string;
  role: string;
};

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { dict } = useLanguage();

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const loadUser = async () => {
      const { data: user } = await getCurrentUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserInfo({
        id: user.id,
        email: user.email ?? "",
        role: user.role || "operator",
      });
    };

    void loadUser();
  }, [router]);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    await apiSignOut();
    clearSessionUiId();
    router.push("/login");
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const isActive = (href: string) => {
    if (href === '/robots') {
      return pathname === href || (pathname.startsWith(href + '/') && !pathname.startsWith('/robots/manage') && !pathname.startsWith('/robots/maps'));
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const role = userInfo?.role;

  const menuItems = [
    { href: "/dashboard", label: dict.dashboard.sidebar.dashboard, roles: ['operator', 'admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
    { href: "/robots", label: dict.dashboard.sidebar.robots, roles: ['operator', 'admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg> },
    { href: "/robots/manage", label: dict.dashboard.sidebar.manage_robots, roles: ['admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
    { href: "/robots/maps", label: dict.dashboard.sidebar.manage_maps, roles: ['admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg> },
    { href: "/notifications", label: dict.dashboard.sidebar.notifications, roles: ['operator', 'admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg> },
    { href: "/company/manage", label: "Companies", roles: ['super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { href: "/users/manage", label: "Users", roles: ['admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> },
    { href: "/settings", label: "Settings", roles: ['admin', 'super_admin'],
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  ].filter(item => item.roles.includes(role || 'operator'));

  return (
    <div className="min-h-screen flex bg-page text-txt-main bg-grain transition-colors duration-300">
      {/* Logout Confirmation Dialog */}
      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={handleLogoutCancel}
        onConfirm={handleLogoutConfirm}
        loading={loggingOut}
      />

      {/* Global Robot Status Toast */}
      <RobotReadyToast />

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Forced Dark Theme to match reference UI */}
      <aside
        className={`bg-[#121212] border-r border-[#2E2E2E] flex flex-col sidebar-transition fixed inset-y-0 left-0 z-50 lg:relative lg:z-10 gpu-accelerated ${sidebarCollapsed ? 'w-20' : 'w-64'} ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ contain: 'layout' }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-3">
            {!sidebarCollapsed ? (
              <div className="flex items-center justify-center w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/logo diagonal_White.png" alt="Diagonal Robotic Solution" className="h-10 lg:h-12 w-auto object-contain" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full">
                <div className="h-10 w-10 rounded-2xl bg-white flex items-center justify-center shadow-lg p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo/LOGO BLACK.png" alt="D" className="w-full h-full object-contain scale-[1.5]" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="mx-3 mt-4 mb-2 p-2 rounded-lg bg-[#1A1A1A] hover:bg-[#2A2A2A] text-gray-400 hover:text-white transition-colors flex items-center justify-center border border-[#2E2E2E]"
        >
          <svg
            className={`w-5 h-5 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {menuItems.map((item) => (
            <SidebarLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              collapsed={sidebarCollapsed}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className={`px-4 py-4 border-t border-[#2E2E2E] text-[11px] text-gray-500 ${sidebarCollapsed ? 'text-center' : ''}`}>
          {sidebarCollapsed ? (
            <span>©</span>
          ) : (
            <span>© {new Date().getFullYear()} Diagonal</span>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 relative z-0">
        {/* Header - Semi transparent glass - optimized */}
        <header className="h-16 border-b border-border-base bg-card/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6 flex-shrink-0 z-[100] transition-colors duration-300 gpu-accelerated">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 -ml-2 text-txt-sec hover:text-txt-main rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-semibold text-txt-main uppercase tracking-wider hidden sm:block">
                TIFA Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme & Language Switchers */}
            <div className="flex items-center gap-2">
              {userInfo && <WebSocketSessionControl currentUserEmail={userInfo.email} />}
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>

            {/* User Dropdown */}
            {userInfo && (
              <div className="pl-3 border-l border-border-base">
                <UserDropdown
                  email={userInfo.email}
                  role={userInfo.role}
                  onLogoutClick={handleLogoutClick}
                />
              </div>
            )}
          </div>
        </header>

        {/* Page Content - with deep blue gradient background in dark mode, light in light mode managed by CSS var */}
        <div className="flex-1 min-h-0 p-4 md:p-6 lg:p-8 overflow-y-auto bg-deep-blue-gradient">{children}</div>
      </main>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-300 ${active
        ? "bg-white text-[#0a0a0a] shadow-md"
        : "text-gray-400 hover:bg-[#151515] hover:text-white"
        }`}
      title={collapsed ? label : undefined}
    >
      <span className={`flex-shrink-0 transition-colors ${active ? 'text-[#0a0a0a]' : 'group-hover:text-white'}`}>
        {icon}
      </span>
      {!collapsed && (
        <span className="text-sm font-semibold truncate">{label}</span>
      )}
      {active && (
        <div className="absolute left-0 bottom-1 top-1 w-1 bg-accent rounded-full shadow-[0_0_8px_var(--primary-glow)]" />
      )}

      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#1A1A1A] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-xl border border-[#2E2E2E]">
          {label}
        </div>
      )}
    </Link>
  );
}
