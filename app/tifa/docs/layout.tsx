'use client';

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";

/* ------------------------------------------------------------------ */
/*  Sidebar navigation structure                                       */
/* ------------------------------------------------------------------ */
export interface DocSection {
    id: string;
    number: number;
    title: string;
    href: string;
    children?: { id: string; title: string; href: string }[];
}

export const DOC_SECTIONS: DocSection[] = [
    { id: "overview", number: 1, title: "Overview", href: "/tifa/docs/overview" },
    { id: "features", number: 2, title: "Features", href: "/tifa/docs/features" },
    { id: "quick-start", number: 3, title: "Quick Start Guide", href: "/tifa/docs/quick-start" },
    { id: "hardware-setup", number: 4, title: "Hardware Setup", href: "/tifa/docs/hardware-setup" },
    { id: "software-setup", number: 5, title: "Software Setup", href: "/tifa/docs/software-setup" },
    { id: "slam-navigation", number: 6, title: "SLAM & Navigation", href: "/tifa/docs/slam-navigation" },
    { id: "teleoperation", number: 7, title: "Teleoperation", href: "/tifa/docs/teleoperation" },
    { id: "voice-interaction", number: 8, title: "Voice Interaction", href: "/tifa/docs/voice-interaction" },
    { id: "iot-sensor", number: 9, title: "IoT Sensor (ESP32)", href: "/tifa/docs/iot-sensor" },
    { id: "dashboard-monitoring", number: 10, title: "Dashboard & Monitoring", href: "/tifa/docs/dashboard-monitoring" },
    { id: "api-reference", number: 11, title: "API Reference", href: "/tifa/docs/api-reference" },
    { id: "troubleshooting", number: 12, title: "Troubleshooting", href: "/tifa/docs/troubleshooting" },
    { id: "faq", number: 13, title: "FAQ", href: "/tifa/docs/faq" },
];

/* ------------------------------------------------------------------ */
/*  Layout Component                                                   */
/* ------------------------------------------------------------------ */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Close mobile sidebar on route change
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSidebarOpen(false);
    }, [pathname]);

    // Filter sections based on search
    const filteredSections = searchQuery
        ? DOC_SECTIONS.filter(s =>
            s.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : DOC_SECTIONS;

    // Determine active section
    const activeSlug = pathname.replace("/tifa/docs", "").replace("/", "") || "overview";

    return (
        <div className="docs-root">
            {/* ── Top Navbar ─────────────────────────────────── */}
            <header className="docs-header">
                <div className="docs-header-inner">
                    <div className="docs-header-left">
                        {/* Mobile hamburger */}
                        <button
                            className="docs-mobile-menu-btn"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle sidebar"
                        >
                            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {sidebarOpen
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                }
                            </svg>
                        </button>

                        <Link href="/tifa" className="docs-logo-link">
                            <Image
                                src="/logo/tifa/tifa.png"
                                alt="TIFA"
                                width={80}
                                height={40}
                                className="docs-logo-icon"
                            />
                            <span className="docs-logo-text">TIFA Docs</span>
                        </Link>

                        {/* Breadcrumb */}
                        <nav className="docs-breadcrumb">
                            <Link href="/tifa">TIFA</Link>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            <Link href="/tifa/docs">Docs</Link>
                            {activeSlug && activeSlug !== "overview" && (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    <span className="docs-breadcrumb-current">
                                        {DOC_SECTIONS.find(s => s.id === activeSlug)?.title ?? activeSlug}
                                    </span>
                                </>
                            )}
                        </nav>
                    </div>

                    <div className="docs-header-right">
                        <ThemeSwitcher />
                        <Link href="/tifa" className="docs-back-btn">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to TIFA
                        </Link>
                    </div>
                </div>
            </header>

            {/* ── Mobile sidebar overlay ─────────────────────── */}
            {sidebarOpen && (
                <div className="docs-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            <div className="docs-body">
                {/* ── Left Sidebar ───────────────────────────────── */}
                <aside className={`docs-sidebar ${sidebarOpen ? "docs-sidebar--open" : ""}`}>
                    {/* Search */}
                    <div className="docs-search-wrapper">
                        <svg className="docs-search-icon" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8" strokeWidth={2} />
                            <path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search docs..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="docs-search-input"
                        />
                    </div>

                    {/* Section label */}
                    <div className="docs-sidebar-label">TIFA Robot</div>

                    {/* Navigation */}
                    <nav className="docs-sidebar-nav">
                        {filteredSections.map(section => {
                            const isActive = activeSlug === section.id || (activeSlug === "" && section.id === "overview");
                            return (
                                <Link
                                    key={section.id}
                                    href={section.href}
                                    className={`docs-sidebar-item ${isActive ? "docs-sidebar-item--active" : ""}`}
                                >
                                    <span className="docs-sidebar-number">{section.number}.</span>
                                    <span className="docs-sidebar-title">{section.title}</span>
                                    <svg className="docs-sidebar-chevron" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            );
                        })}
                    </nav>
                </aside>

                {/* ── Main Content ───────────────────────────────── */}
                <main className="docs-main">
                    {children}
                </main>
            </div>
        </div>
    );
}
