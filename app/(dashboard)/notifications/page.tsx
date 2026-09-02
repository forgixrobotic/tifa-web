"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { getRobots, groupRobots } from "@/lib/api";

type CommandLog = {
  h_command_log_id: number;
  device_id: number | null;
  command_code: string | null;
  command_payload: Record<string, unknown> | null;
  status: string | null;
  status_message: string | null;
  created_at: string;
};

type WsTrafficLog = {
  h_ws_traffic_id: number;
  device_id: number | null;
  direction: string | null;
  code: string;
  payload: Record<string, unknown> | null;
  remote_addr: string | null;
  recorded_at: string;
};

// Unified log item for the merged timeline
type UnifiedLogItem = {
  id: string;
  source: 'command' | 'ws_traffic';
  device_id: number | null;
  code: string | null;
  status: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type TimeRange = '1d' | '1w' | '1m' | '3m';
type FilterType = 'all' | 'success' | 'sent' | 'error' | 'ws_all' | 'ws_ready' | 'ws_error' | 'ws_disconnect' | 'ws_init';
type ActiveTab = 'realtime' | 'daily' | 'monthly';

type RobotOption = {
  deviceId: number;
  label: string;
};

export default function ActivityLogPage() {
  const { dict } = useLanguage();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<UnifiedLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('1d');
  const [filter, setFilter] = useState<FilterType>("all");
  const [robotOptions, setRobotOptions] = useState<RobotOption[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("all");

  const [activeTab, setActiveTab] = useState<ActiveTab>('realtime');
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [monthlyLogs, setMonthlyLogs] = useState<any[]>([]);
  const [loadingAgg, setLoadingAgg] = useState(false);

  // Load robot list for selector
  useEffect(() => {
    const loadRobots = async () => {
      const { data } = await getRobots();
      if (data) {
        const grouped = groupRobots(data);
        const options: RobotOption[] = grouped.map(g => ({
          deviceId: typeof g.primaryDeviceId === 'string' ? parseInt(g.primaryDeviceId, 10) : g.primaryDeviceId,
          label: g.displayName,
        }));
        // Filter for allowed devices (TFRB1/TIFA-001 is ID 2, RB002 is ID 13)
        const allowedDeviceIds = [2, 13];
        setRobotOptions(options.filter(o => allowedDeviceIds.includes(o.deviceId)));
      }
    };
    void loadRobots();
  }, []);

  // Read ?robot= from URL on mount
  useEffect(() => {
    const robotParam = searchParams.get('robot');
    if (robotParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedRobotId(robotParam);
    }
  }, [searchParams]);

  // Load logs when range or selected robot changes
  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        // Fetch both command logs and WS traffic in parallel
        let cmdUrl = `/api/commands?action=logs-by-range&range=${range}`;
        let wsUrl = `/api/ws-traffic?action=logs-by-range&range=${range}`;
        if (selectedRobotId !== "all") {
          cmdUrl += `&deviceId=${selectedRobotId}`;
          wsUrl += `&deviceId=${selectedRobotId}`;
        }

        const [cmdRes, wsRes] = await Promise.all([
          fetch(cmdUrl).then(r => r.json()),
          fetch(wsUrl).then(r => r.json()),
        ]);

        // Transform command logs to unified format
        const cmdLogs: UnifiedLogItem[] = ((cmdRes.data ?? []) as CommandLog[]).map(cmd => ({
          id: `cmd-${cmd.h_command_log_id}`,
          source: 'command' as const,
          device_id: typeof cmd.device_id === 'string' ? parseInt(cmd.device_id, 10) : cmd.device_id,
          code: cmd.command_code,
          status: cmd.status,
          message: cmd.status_message,
          payload: cmd.command_payload,
          created_at: cmd.created_at,
        }));

        // Transform WS traffic logs to unified format
        const wsLogs: UnifiedLogItem[] = ((wsRes.data ?? []) as WsTrafficLog[]).map(ws => {
          const isInitReady = ws.code === 'INIT' && (ws.payload as any)?.status === 'READY';
          const effectiveCode = isInitReady ? 'READY' : ws.code;
          return {
            id: `ws-${ws.h_ws_traffic_id}`,
            source: 'ws_traffic' as const,
            device_id: typeof ws.device_id === 'string' ? parseInt(ws.device_id, 10) : ws.device_id,
            code: effectiveCode,
            status: effectiveCode, // code acts as status for WS events
            message: `WebSocket ${effectiveCode} — ${ws.direction ?? 'IN'}`,
            payload: ws.payload,
            created_at: ws.recorded_at,
          };
        });

        // Merge and sort by time descending
        let merged = [...cmdLogs, ...wsLogs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // Filter log hanya untuk TIFA-001 (ID: 2) dan TIFA-002 (ID: 13) jika filter "all" aktif
        if (selectedRobotId === "all") {
          const allowedDeviceIds = [2, 13];
          merged = merged.filter(log => log.device_id != null && allowedDeviceIds.includes(log.device_id));
        }

        setLogs(merged);
      } catch {
        setLogs([]);
      }
      setLoading(false);
    };

    void loadLogs();
  }, [range, selectedRobotId]);

  // Load Aggregated Logs (Daily / Monthly)
  useEffect(() => {
    if (activeTab === 'realtime') return;
    const loadAggLogs = async () => {
      setLoadingAgg(true);
      try {
        let url = `/api/commands?action=${activeTab}-logs`;
        if (selectedRobotId !== "all") {
          url += `&deviceId=${selectedRobotId}`;
        }
        const res = await fetch(url).then(r => r.json());
        if (activeTab === 'daily') setDailyLogs(res.data || []);
        if (activeTab === 'monthly') setMonthlyLogs(res.data || []);
      } catch {
        if (activeTab === 'daily') setDailyLogs([]);
        if (activeTab === 'monthly') setMonthlyLogs([]);
      }
      setLoadingAgg(false);
    };
    void loadAggLogs();
  }, [activeTab, selectedRobotId]);

  // Filter logs client-side
  const filteredLogs = (() => {
    switch (filter) {
      case 'success': return logs.filter(l => l.source === 'command' && (l.status === 'success' || l.status === 'SENT'));
      case 'error': return logs.filter(l =>
        (l.source === 'command' && l.status !== 'success' && l.status !== 'SENT') ||
        (l.source === 'ws_traffic' && l.code === 'ERROR')
      );
      case 'ws_all': return logs.filter(l => l.source === 'ws_traffic');
      case 'ws_ready': return logs.filter(l => l.source === 'ws_traffic' && l.code === 'READY');
      case 'ws_error': return logs.filter(l => l.source === 'ws_traffic' && l.code === 'ERROR');
      case 'ws_disconnect': return logs.filter(l => l.source === 'ws_traffic' && l.code === 'DISCONNECT');
      case 'ws_init': return logs.filter(l => l.source === 'ws_traffic' && l.code === 'INIT');
      default: return logs;
    }
  })();

  // Map device_id to robot name
  const robotNameMap = new Map(robotOptions.map(r => [r.deviceId, r.label]));

  // Counts for filter pills
  const cmdLogs = logs.filter(l => l.source === 'command');
  const wsLogs = logs.filter(l => l.source === 'ws_traffic');
  const successCount = cmdLogs.filter(l => l.status === 'success' || l.status === 'SENT').length;
  const errorCount = cmdLogs.filter(l => l.status !== 'success' && l.status !== 'SENT').length + wsLogs.filter(l => l.code === 'ERROR').length;
  const wsTrafficCount = wsLogs.length;

  const getStatusBadge = (item: UnifiedLogItem) => {
    if (item.source === 'ws_traffic') {
      const wsConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
        INIT: { bg: 'bg-blue-100 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/20', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-400 shadow-[0_0_4px_#60a5fa]', label: 'INIT' },
        READY: { bg: 'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-400 shadow-[0_0_4px_#34d399]', label: 'READY' },
        ERROR: { bg: 'bg-rose-100 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/20', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-400 shadow-[0_0_4px_#fb7185]', label: 'ERROR' },
        DISCONNECT: { bg: 'bg-slate-100 dark:bg-slate-500/10 border-slate-300 dark:border-slate-500/20', text: 'text-slate-700 dark:text-slate-400', dot: 'bg-slate-400 shadow-[0_0_4px_#94a3b8]', label: 'DISCONNECT' },
      };
      const config = wsConfig[item.code ?? ''] ?? wsConfig.INIT;
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${config.bg} border ${config.text} text-[10px] font-semibold uppercase tracking-wider`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
          {config.label}
        </span>
      );
    }

    if (item.status === 'success' || item.status === 'SENT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]"></span>
          {item.status === 'success' ? 'Success' : 'Sent'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-[10px] font-semibold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_4px_#fb7185]"></span>
        {item.status || 'Error'}
      </span>
    );
  };

  const getItemIcon = (item: UnifiedLogItem) => {
    if (item.source === 'ws_traffic') {
      const wsIconConfig: Record<string, { gradient: string; border: string; color: string; icon: React.ReactNode }> = {
        INIT: {
          gradient: 'from-blue-500/15 to-blue-600/5',
          border: 'border-blue-500/25',
          color: 'text-blue-700 dark:text-blue-400',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />,
        },
        READY: {
          gradient: 'from-emerald-500/15 to-emerald-600/5',
          border: 'border-emerald-500/25',
          color: 'text-emerald-700 dark:text-emerald-400',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
        },
        ERROR: {
          gradient: 'from-rose-500/15 to-rose-600/5',
          border: 'border-rose-500/25',
          color: 'text-rose-700 dark:text-rose-400',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
        },
        DISCONNECT: {
          gradient: 'from-slate-500/15 to-slate-600/5',
          border: 'border-slate-500/25',
          color: 'text-slate-700 dark:text-slate-400',
          icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17L7 7" /></>,
        },
      };
      const config = wsIconConfig[item.code ?? ''] ?? wsIconConfig.INIT;
      return (
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br ${config.gradient} border ${config.border} ${config.color} flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.1)]`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{config.icon}</svg>
        </div>
      );
    }

    // Command icons (same as before)
    const isError = item.status !== 'success' && item.status !== 'SENT';

    if (isError) {
      return (
        <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-500/15 to-rose-600/5 border border-rose-500/25 text-rose-700 dark:text-rose-400 flex-shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    }

    const code = (item.code ?? '').toUpperCase();
    if (code.includes('OP') || code.includes('DELIVER') || code.includes('SERVE')) {
      return (
        <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500/15 to-purple-600/5 border border-purple-500/25 text-purple-700 dark:text-purple-400 flex-shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
      );
    }
    if (code.includes('TELEOP')) {
      return (
        <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-violet-600/5 border border-violet-500/25 text-violet-700 dark:text-violet-400 flex-shrink-0 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
          </svg>
        </div>
      );
    }
    return (
      <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 flex-shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      </div>
    );
  };

  const rangeLabel: Record<TimeRange, string> = {
    '1d': '24 jam terakhir',
    '1w': '7 hari terakhir',
    '1m': '30 hari terakhir',
    '3m': '3 bulan terakhir',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-txt-main tracking-tight">
            {dict.dashboard.notifications.title}
          </h1>
          <p className="text-sm text-txt-sec mt-1">
            Riwayat eksekusi perintah & status koneksi robot
            {activeTab === 'realtime' && ` — ${rangeLabel[range]}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-base mt-4">
        <button onClick={() => setActiveTab('realtime')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'realtime' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-txt-sec hover:text-txt-main'}`}>Realtime</button>
        <button onClick={() => setActiveTab('daily')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'daily' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-txt-sec hover:text-txt-main'}`}>Log Harian</button>
        <button onClick={() => setActiveTab('monthly')} className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === 'monthly' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-txt-sec hover:text-txt-main'}`}>Log Bulanan</button>
      </div>

      {activeTab === 'realtime' && (
        <div className="space-y-2">
          {/* Row 1: Command Logs Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-txt-sec uppercase tracking-wider font-semibold mr-1">Commands:</span>
            {[
              { key: "all" as FilterType, label: "Semua", count: logs.length },
              { key: "success" as FilterType, label: "Berhasil", count: successCount },
              { key: "error" as FilterType, label: "Error", count: errorCount },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-1.5 border ${filter === item.key
                  ? item.key === "error"
                    ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 shadow-sm border-rose-300 dark:border-rose-500/20"
                    : item.key === "success"
                      ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm border-emerald-300 dark:border-emerald-500/20"
                      : "bg-card-bg text-txt-main shadow-sm border-border-highlight"
                  : "text-txt-sec hover:text-txt-main border-transparent"
                  }`}
              >
                {item.label}
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${filter === item.key ? "bg-white/5" : "bg-sidebar"}`}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          {/* Row 2: WS Traffic Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-txt-sec uppercase tracking-wider font-semibold mr-1">WS Traffic:</span>
            {[
              { key: "ws_all" as FilterType, label: "Semua WS", count: wsTrafficCount, color: "blue" },
              { key: "ws_ready" as FilterType, label: "READY", count: wsLogs.filter(l => l.code === 'READY').length, color: "emerald" },
              { key: "ws_init" as FilterType, label: "INIT", count: wsLogs.filter(l => l.code === 'INIT').length, color: "blue" },
              { key: "ws_error" as FilterType, label: "ERROR", count: wsLogs.filter(l => l.code === 'ERROR').length, color: "rose" },
              { key: "ws_disconnect" as FilterType, label: "DISCONNECT", count: wsLogs.filter(l => l.code === 'DISCONNECT').length, color: "slate" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-1.5 border ${filter === item.key
                  ? `bg-${item.color}-500/15 text-${item.color}-400 shadow-sm border-${item.color}-500/20`
                  : "text-txt-sec hover:text-txt-main border-transparent"
                  }`}
                style={filter === item.key ? {
                  backgroundColor: item.color === 'emerald' ? 'rgba(16,185,129,0.15)' :
                    item.color === 'rose' ? 'rgba(244,63,94,0.15)' :
                    item.color === 'slate' ? 'rgba(100,116,139,0.15)' :
                    'rgba(59,130,246,0.15)',
                  color: item.color === 'emerald' ? 'rgb(52,211,153)' :
                    item.color === 'rose' ? 'rgb(251,113,133)' :
                    item.color === 'slate' ? 'rgb(148,163,184)' :
                    'rgb(96,165,250)',
                  borderColor: item.color === 'emerald' ? 'rgba(16,185,129,0.2)' :
                    item.color === 'rose' ? 'rgba(244,63,94,0.2)' :
                    item.color === 'slate' ? 'rgba(100,116,139,0.2)' :
                    'rgba(59,130,246,0.2)',
                } : undefined}
              >
                {item.label}
                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${filter === item.key ? "bg-white/5" : "bg-sidebar"}`}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Robot Selector Cards */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {/* All Robots */}
        <button
          onClick={() => setSelectedRobotId("all")}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200 flex-shrink-0 ${selectedRobotId === "all"
            ? "bg-blue-100 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
            : "bg-sidebar border-border-base hover:border-border-highlight hover:bg-card-bg"
            }`}
        >
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${selectedRobotId === "all"
            ? "bg-gradient-to-br from-blue-500/25 to-purple-500/25 border-blue-300 dark:border-blue-500/30"
            : "bg-sidebar border-border-base"
            }`}>
            <svg className={`w-4 h-4 ${selectedRobotId === "all" ? "text-blue-700 dark:text-blue-400" : "text-txt-sec"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-left">
            <p className={`text-xs font-semibold ${selectedRobotId === "all" ? "text-blue-700 dark:text-blue-400" : "text-txt-main"}`}>Semua Robot</p>
            <p className="text-[10px] text-txt-sec">{robotOptions.length} unit</p>
          </div>
        </button>

        {/* Individual Robot Cards */}
        {robotOptions.map((robot) => {
          const isSelected = selectedRobotId === robot.deviceId.toString();
          return (
            <button
              key={robot.deviceId}
              onClick={() => setSelectedRobotId(robot.deviceId.toString())}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200 flex-shrink-0 ${isSelected
                ? "bg-cyan-100 dark:bg-cyan-500/10 border-cyan-300 dark:border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                : "bg-sidebar border-border-base hover:border-border-highlight hover:bg-card-bg"
                }`}
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${isSelected
                ? "bg-gradient-to-br from-cyan-500/25 to-blue-500/25 border-cyan-300 dark:border-cyan-500/30"
                : "bg-sidebar border-border-base"
                }`}>
                <svg className={`w-4 h-4 ${isSelected ? "text-cyan-700 dark:text-cyan-400" : "text-txt-sec"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div className="text-left">
                <p className={`text-xs font-semibold ${isSelected ? "text-cyan-700 dark:text-cyan-400" : "text-txt-main"}`}>{robot.label}</p>
                <p className="text-[10px] text-txt-sec font-mono">ID: {robot.deviceId}</p>
              </div>
            </button>
          );
        })}
      </div>

      {activeTab === 'realtime' && (
        <>
          {/* Time Range + Counter */}
          <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-txt-sec mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {[
            { value: '1d' as const, label: 'Hari Ini' },
            { value: '1w' as const, label: '1 Minggu' },
            { value: '1m' as const, label: '1 Bulan' },
            { value: '3m' as const, label: '3 Bulan' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 border ${range === option.value
                ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                : 'bg-transparent text-txt-sec border-transparent hover:bg-card-bg hover:text-txt-main'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Log Count */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sidebar border border-border-base">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_4px_#60a5fa] "></div>
          <span className="text-[11px] text-txt-sec font-mono">
            <span className="text-txt-main font-semibold">{filteredLogs.length}</span> log
          </span>
        </div>
      </div>
        </>
      )}

      {/* Log List / Tables */}
      <div className="glass-panel rounded-xl overflow-hidden">
        {activeTab === 'realtime' ? (
          <>
            {loading ? (
          <div className="p-16 text-center">
            <div className="inline-flex flex-col items-center gap-4 text-txt-sec">
              <div className="relative">
                <div className="w-10 h-10 border-2 border-border-base rounded-full"></div>
                <div className="absolute inset-0 w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <span className="text-xs font-mono uppercase tracking-widest">{dict.dashboard.notifications.loading}</span>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="inline-flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-sidebar border border-border-base flex items-center justify-center">
                <svg className="w-8 h-8 text-txt-sec opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-txt-main mb-1">Tidak ada log ditemukan</p>
                <p className="text-xs text-txt-sec">Coba ubah filter atau periode waktu</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {(() => {
              const now = new Date();
              const groupedLogs: Record<string, UnifiedLogItem[]> = {
                "Hari Ini": [],
                "7 Hari Terakhir": [],
                "30 Hari Terakhir": [],
                "Lebih Lama": []
              };

              filteredLogs.forEach(log => {
                const diffDays = (now.getTime() - new Date(log.created_at).getTime()) / (1000 * 3600 * 24);
                if (diffDays <= 1) {
                  groupedLogs["Hari Ini"].push(log);
                } else if (diffDays <= 7) {
                  groupedLogs["7 Hari Terakhir"].push(log);
                } else if (diffDays <= 30) {
                  groupedLogs["30 Hari Terakhir"].push(log);
                } else {
                  groupedLogs["Lebih Lama"].push(log);
                }
              });

              return Object.entries(groupedLogs)
                .filter(([, items]) => items.length > 0)
                .map(([groupTitle, items]) => (
                  <div key={groupTitle}>
                    <div className="bg-sidebar border-y border-border-base px-5 py-2.5 sticky top-0 z-10 backdrop-blur-sm">
                      <span className="text-xs font-bold text-txt-sec uppercase tracking-widest">{groupTitle}</span>
                      <span className="ml-2 text-[10px] bg-card-bg px-2 py-0.5 rounded-full border border-border-base text-txt-sec">{items.length}</span>
                    </div>
                    <div className="divide-y divide-border-base/50">
                      {items.map((item) => {
                        return (
                          <div
                            key={item.id}
                            className="px-5 py-4 transition-all duration-200 hover:bg-card-bg/40"
                          >
                            <div className="flex gap-4 items-start">
                              {/* Icon */}
                              {getItemIcon(item)}

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    {item.device_id && (
                                      <span className="text-sm font-semibold text-txt-main">
                                        {robotNameMap.get(item.device_id) || `Device #${item.device_id}`}
                                      </span>
                                    )}
                                    {getStatusBadge(item)}
                                    {item.source === 'ws_traffic' && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-mono border border-indigo-300 dark:border-indigo-500/20">
                                        WS
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[11px] text-txt-sec whitespace-nowrap font-mono tabular-nums">
                                      {new Date(item.created_at).toLocaleString('id-ID', {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                </div>

                                {/* Command Code / WS Code */}
                                <div className="flex items-center gap-2">
                                  <code className={`text-[13px] font-medium font-mono px-2 py-0.5 rounded border ${
                                    item.source === 'ws_traffic'
                                      ? 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/5 border-indigo-500/10'
                                      : 'text-txt-accent bg-blue-50 dark:bg-blue-500/5 border-blue-500/10'
                                  }`}>
                                    {item.code || 'UNKNOWN'}
                                  </code>
                                </div>

                                {/* Message */}
                                {item.message && (
                                  <p className="text-xs text-txt-sec mt-1.5 leading-relaxed">
                                    {item.message}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
            })()}
          </div>
        )}
          </>
        ) : (
          <div className="overflow-x-auto">
            {loadingAgg ? (
              <div className="p-16 text-center text-txt-sec text-sm font-medium">Memuat data agregasi...</div>
            ) : (activeTab === 'daily' ? dailyLogs : monthlyLogs).length === 0 ? (
              <div className="p-16 text-center text-txt-sec text-sm font-medium">Belum ada data log {activeTab === 'daily' ? 'harian' : 'bulanan'}.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-sidebar border-b border-border-base text-xs font-semibold text-txt-sec uppercase tracking-wider">
                    <th className="px-5 py-3 whitespace-nowrap">{activeTab === 'daily' ? 'Tanggal' : 'Bulan'}</th>
                    <th className="px-5 py-3 whitespace-nowrap">Total Command</th>
                    <th className="px-5 py-3 whitespace-nowrap">Operasi Navigasi</th>
                    <th className="px-5 py-3 whitespace-nowrap">Move Count</th>
                    <th className="px-5 py-3 whitespace-nowrap text-rose-500">Error Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base/50">
                  {(activeTab === 'daily' ? dailyLogs : monthlyLogs).map((row, i) => (
                    <tr key={i} className="hover:bg-card-bg/50 transition-colors text-sm">
                      <td className="px-5 py-4 font-mono text-txt-main whitespace-nowrap">
                        {activeTab === 'daily' ? new Date(row.date).toLocaleDateString('id-ID') : row.month}
                      </td>
                      <td className="px-5 py-4 text-txt-sec font-mono">{row.total_commands}</td>
                      <td className="px-5 py-4 text-txt-sec font-mono">{row.op_count}</td>
                      <td className="px-5 py-4 text-txt-sec font-mono">{row.move_count}</td>
                      <td className="px-5 py-4 font-mono font-medium text-rose-500">{row.error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
