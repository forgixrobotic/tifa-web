'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getRobots,
  getAllDeviceStatus,
  groupRobots,
  addStatusToGroupedRobots,
  type DeviceStatus,
  type GroupedRobotWithStatus
} from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";
import { BatteryIcon } from "@/components/BatteryIcon";

export default function RobotsListPage() {
  const { dict } = useLanguage();

  const [groupedRobots, setGroupedRobots] = useState<GroupedRobotWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadRobots = async () => {
    setLoading(true);
    setError(null);

    const [robotsResult, statusResult] = await Promise.all([
      getRobots(search),
      getAllDeviceStatus(),
    ]);

    if (robotsResult.error) {
      setError(robotsResult.error);
      setLoading(false);
      return;
    }

    const robots = robotsResult.data ?? [];

    // Create a map of device statuses for quick lookup
    const statusMap = new Map<number, DeviceStatus>();
    if (statusResult.data) {
      statusResult.data.forEach(status => {
        statusMap.set(status.device_id, status);
      });
    }

    // Group robots (RB + UI_TIFA_ pairs)
    const grouped = groupRobots(robots);

    // Add status information to grouped robots
    const groupedWithStatus = addStatusToGroupedRobots(grouped, statusMap);

    // Filter by search if needed (search already applied in getRobots, but grouping may affect display)
    setGroupedRobots(groupedWithStatus);
    setLoading(false);
  };

  useEffect(() => {
    void loadRobots();
    // Refresh every 15 seconds for faster online/offline status updates
    const interval = setInterval(() => {
      void loadRobots();
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Count online and offline grouped robots
  const onlineCount = groupedRobots.filter(r => r.isOnline).length;
  const offlineCount = groupedRobots.length - onlineCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-txt-main tracking-tight">{dict.dashboard.robots.title}</h1>
          <p className="text-sm text-txt-sec">
            {dict.dashboard.robots.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative group">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-sec group-focus-within:text-txt-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              placeholder={dict.dashboard.robots.search_placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 rounded-lg border border-border-base bg-input-bg pl-10 pr-4 py-2 text-sm text-txt-main focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-txt-sec"
            />
          </div>
          {/* Add Robot Button */}
          <Link
            href="/robots/manage"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all border border-blue-300 dark:border-blue-500/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {dict.dashboard.robots.add_button}
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 backdrop-blur-sm">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest">{dict.dashboard.robots.total_fleet}</p>
          <p className="mt-1 text-2xl font-bold text-txt-main tracking-tight">{groupedRobots.length}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-emerald-500/70 uppercase tracking-widest">{dict.dashboard.robots.online}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-3 w-3">
              <span className=" absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <p className="text-2xl font-bold text-txt-main tracking-tight">{onlineCount}</p>
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest">{dict.dashboard.robots.offline}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-3 w-3 rounded-full bg-slate-700/50 border border-slate-600/50"></span>
            <p className="text-2xl font-bold text-txt-sec tracking-tight">{offlineCount}</p>
          </div>
        </div>
      </div>

      {/* Robot Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4 text-txt-sec">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin"></div>
              <div className="absolute inset-0 rounded-full border-4 border-slate-800 opacity-20"></div>
            </div>
            <span className="text-xs uppercase tracking-widest ">{dict.dashboard.robots.loading}</span>
          </div>
        </div>
      ) : groupedRobots.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed border-2 border-border-base p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sidebar mb-4 border border-border-base">
            <svg className="w-8 h-8 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-txt-main mb-1">{dict.dashboard.robots.no_robots_title}</h3>
          <p className="text-sm text-txt-sec mb-6">{dict.dashboard.robots.no_robots_desc}</p>
          <Link
            href="/robots/manage"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {dict.dashboard.robots.add_first_robot}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedRobots.map((robot) => {
            return (
              <Link
                key={robot.groupId}
                href={`/robots/${robot.primaryDeviceId}`}
                className="group glass-panel rounded-xl p-5 hover:border-border-highlight hover:bg-card-bg transition-all duration-300 relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 ${robot.isOnline ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-slate-50 dark:bg-slate-500/5'} rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110`}></div>

                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-xl ${robot.isOnline ? 'bg-sidebar border-border-base' : 'bg-slate-900/50 border-slate-700/30'} border flex items-center justify-center group-hover:bg-primary-glow group-hover:border-border-highlight transition-colors shadow-inner`}>
                      <svg className={`w-6 h-6 ${robot.isOnline ? 'text-txt-sec group-hover:text-txt-accent' : 'text-slate-600'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-txt-main group-hover:text-txt-accent transition-colors">
                        {robot.displayName}
                      </h3>
                      {/* Show component devices */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {robot.rbDevice && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-mono">
                            {robot.rbDevice.device_code}
                          </span>
                        )}
                        {robot.uiDevice && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 font-mono">
                            {robot.uiDevice.device_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Online/Offline Status Badge */}
                  {robot.isOnline ? (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]"></div>
                      <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{dict.dashboard.robots.active}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-700/30 border border-slate-600/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
                      <span className="text-[10px] font-medium text-slate-700 dark:text-slate-400">{dict.common.offline}</span>
                    </div>
                  )}
                </div>

                {/* Status Info */}
                {robot.isOnline && (
                  <div className="mt-4 flex items-center gap-3">
                    {robot.battery !== null && (
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${robot.battery <= 30 ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400' :
                        robot.battery <= 60 ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                          'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        }`}>
                        <BatteryIcon level={robot.battery} className="w-3.5 h-3.5" />
                        <span className="font-medium">{robot.battery}%</span>
                      </div>
                    )}
                    {robot.mode && (
                      <span className="px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-medium">
                        {robot.mode}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-border-base grid grid-cols-2 gap-4 text-xs relative z-10">
                  <div>
                    <p className="text-txt-sec mb-1">{dict.dashboard.robots.local_ip}</p>
                    <p className="text-txt-main font-mono bg-sidebar rounded px-2 py-1 inline-block border border-border-base">
                      {robot.localIp || <span className="opacity-50">--.--.--.--</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-txt-sec mb-1">{dict.dashboard.robots.network}</p>
                    <p className="text-txt-main truncate max-w-[100px] bg-sidebar rounded px-2 py-1 inline-block border border-border-base">
                      {robot.localSsid || <span className="opacity-50">N/A</span>}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between relative z-10">
                  <span className="text-[10px] text-txt-sec">
                    {dict.dashboard.robots.added_on.replace('{date}', new Date(robot.createdAt).toLocaleDateString())}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-txt-accent font-medium group-hover:translate-x-1 transition-transform">
                    {dict.dashboard.robots.access_terminal}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
