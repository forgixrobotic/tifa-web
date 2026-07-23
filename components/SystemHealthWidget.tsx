'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ServiceHealth {
    status: 'UP' | 'DOWN';
    latencyMs: number;
    details: string;
}

interface HealthResponse {
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    timestamp: string;
    services: {
        database: ServiceHealth;
        websocket: ServiceHealth;
        backend: ServiceHealth;
    };
}

export default function SystemHealthWidget() {
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchHealth = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                const data: HealthResponse = await res.json();
                setHealth(data);
            }
        } catch {
            setHealth({
                status: 'DOWN',
                timestamp: new Date().toISOString(),
                services: {
                    database: { status: 'DOWN', latencyMs: 0, details: 'API Route Unreachable' },
                    websocket: { status: 'DOWN', latencyMs: 0, details: 'API Route Unreachable' },
                    backend: { status: 'DOWN', latencyMs: 0, details: 'API Route Unreachable' },
                },
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchHealth();
        // Auto-refresh health every 15 seconds
        const interval = setInterval(fetchHealth, 15000);
        return () => clearInterval(interval);
    }, [fetchHealth]);

    const statusColor =
        health?.status === 'HEALTHY'
            ? 'bg-emerald-500 text-emerald-400 border-emerald-500/30'
            : health?.status === 'DEGRADED'
            ? 'bg-amber-500 text-amber-400 border-amber-500/30'
            : 'bg-rose-500 text-rose-400 border-rose-500/30';

    return (
        <>
            {/* Live Header Status Badge */}
            <button
                onClick={() => setIsModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full border bg-black/40 text-xs font-semibold hover:bg-black/60 transition shadow-sm cursor-pointer ${
                    health?.status === 'HEALTHY' ? 'border-emerald-500/30' :
                    health?.status === 'DEGRADED' ? 'border-amber-500/30' : 'border-rose-500/30'
                }`}
                title="Click to view detailed system health diagnostics"
            >
                <span className="relative flex h-2 w-2">
                    <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            health?.status === 'HEALTHY' ? 'bg-emerald-400' :
                            health?.status === 'DEGRADED' ? 'bg-amber-400' : 'bg-rose-400'
                        }`}
                    />
                    <span
                        className={`relative inline-flex rounded-full h-2 w-2 ${
                            health?.status === 'HEALTHY' ? 'bg-emerald-500' :
                            health?.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                    />
                </span>

                <span className="hidden sm:inline text-txt-main">
                    {health?.status === 'HEALTHY' ? 'SYSTEM ONLINE' :
                     health?.status === 'DEGRADED' ? 'DEGRADED' : 'CRITICAL'}
                </span>

                {health?.services?.database?.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono text-txt-sec border-l border-border-base/60 pl-2">
                        {health.services.database.latencyMs}ms
                    </span>
                )}
            </button>

            {/* Health Diagnostics Modal */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        className="bg-[#0f172a] border border-border-base rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base bg-[#1e293b]/50">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-3 h-3 rounded-full ${
                                    health?.status === 'HEALTHY' ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' :
                                    health?.status === 'DEGRADED' ? 'bg-amber-400 shadow-lg shadow-amber-500/50' : 'bg-rose-400 shadow-lg shadow-rose-500/50'
                                }`} />
                                <div>
                                    <h3 className="text-sm font-bold text-txt-main">System Health Diagnostics</h3>
                                    <p className="text-[11px] text-txt-sec">Real-time status of microservices & databases</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-txt-sec hover:text-txt-main p-1.5 rounded-lg hover:bg-white/5 transition"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body - Cards */}
                        <div className="p-6 space-y-3">
                            {/* Database Card */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-card-bg border border-border-base">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                        🗄️
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-txt-main">PostgreSQL Database</div>
                                        <div className="text-[11px] text-txt-sec">{health?.services?.database?.details}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        health?.services?.database?.status === 'UP' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                                    }`}>
                                        {health?.services?.database?.status}
                                    </span>
                                    <div className="text-[10px] font-mono text-txt-sec mt-1">
                                        {health?.services?.database?.latencyMs}ms
                                    </div>
                                </div>
                            </div>

                            {/* WebSocket Gateway Card */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-card-bg border border-border-base">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                                        🔌
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-txt-main">WebSocket Gateway (tifa-ws)</div>
                                        <div className="text-[11px] text-txt-sec">{health?.services?.websocket?.details}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        health?.services?.websocket?.status === 'UP' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                                    }`}>
                                        {health?.services?.websocket?.status}
                                    </span>
                                    <div className="text-[10px] font-mono text-txt-sec mt-1">
                                        {health?.services?.websocket?.latencyMs}ms
                                    </div>
                                </div>
                            </div>

                            {/* Spring Boot Backend Card */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-card-bg border border-border-base">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                                        ☕
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-txt-main">Spring Boot Backend (tifa-be)</div>
                                        <div className="text-[11px] text-txt-sec">{health?.services?.backend?.details}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        health?.services?.backend?.status === 'UP' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                                    }`}>
                                        {health?.services?.backend?.status}
                                    </span>
                                    <div className="text-[10px] font-mono text-txt-sec mt-1">
                                        {health?.services?.backend?.latencyMs}ms
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border-base bg-[#1e293b]/30">
                            <span className="text-[10px] font-mono text-txt-sec">
                                Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}
                            </span>
                            <button
                                onClick={fetchHealth}
                                disabled={loading}
                                className="px-3 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {loading && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                {loading ? 'Checking...' : 'Re-check Health'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
