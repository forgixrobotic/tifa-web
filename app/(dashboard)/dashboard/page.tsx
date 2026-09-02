"use client";

import Link from "next/link";
import {
  getDashboardStats,
  getAllDeviceStatus,
  getRobots,
  getRobotErrorCount,
  getCommandLogs,
  getRecentWsTraffic,
  groupRobots,
  addStatusToGroupedRobots,
  type BatteryBuckets,
  type DeviceStatus,
  type GroupedRobotWithStatus,
} from "@/lib/api";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import NotificationBell from "@/components/NotificationBell";
import RobotSelectorModal from "@/components/RobotSelectorModal";
import RobotControlPanel from "@/components/RobotControlPanel";
import { BatteryIcon } from "@/components/BatteryIcon";

// Unified activity item for dashboard sidebar
type ActivityItem = {
  id: string;
  source: 'command' | 'ws_traffic';
  code: string | null;
  status: string | null;
  message: string | null;
  created_at: string;
  device_id?: number | null;
};

export default function DashboardHomePage() {
  const { dict } = useLanguage();

  const [isInitializing, setIsInitializing] = useState(true);
  const [showFleetOverview, setShowFleetOverview] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [groupedRobots, setGroupedRobots] = useState<GroupedRobotWithStatus[]>([]);
  const [activeGroups, setActiveGroups] = useState<GroupedRobotWithStatus[]>([]);
  const [inactiveGroups, setInactiveGroups] = useState<GroupedRobotWithStatus[]>([]);

  // Stats state (for selected robot or all)
  const [avgBattery, setAvgBattery] = useState<number | null>(null);
  const [errorCount, setErrorCount] = useState<number | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [batteryBuckets, setBatteryBuckets] = useState<BatteryBuckets>({
    critical: 0,
    warning: 0,
    healthy: 0,
  });

  // Load from localStorage
  useEffect(() => {
    const savedGroupId = localStorage.getItem('tifa_selected_robot_group');
    if (savedGroupId && savedGroupId !== 'fleet') {
      setSelectedGroupId(savedGroupId);
      setShowFleetOverview(false);
    } else {
      setSelectedGroupId(null);
      setShowFleetOverview(true);
    }
    setIsInitializing(false);
  }, []);

  // Update localStorage when selection changes
  useEffect(() => {
    if (!isInitializing) {
      if (selectedGroupId) {
        localStorage.setItem('tifa_selected_robot_group', selectedGroupId);
      } else {
        localStorage.setItem('tifa_selected_robot_group', 'fleet');
      }
    }
  }, [selectedGroupId, isInitializing]);

  const handleRobotSelect = (groupId: string | null) => {
    setSelectedGroupId(groupId);
    if (groupId === null) {
      setShowFleetOverview(true);
    } else {
      setShowFleetOverview(false);
    }
  };

  // Load all devices and group them
  useEffect(() => {
    const loadGroupedRobots = async () => {
      const [robotsResult, statusResult] = await Promise.all([
        getRobots(),
        getAllDeviceStatus(),
      ]);

      if (robotsResult.data && statusResult.data) {
        // Create status map
        const statusMap = new Map<number, DeviceStatus>();
        statusResult.data.forEach(status => {
          statusMap.set(status.device_id, status);
        });

        // Group robots and add status
        const grouped = groupRobots(robotsResult.data);
        const groupedWithStatus = addStatusToGroupedRobots(grouped, statusMap);

        setGroupedRobots(groupedWithStatus);
        setActiveGroups(groupedWithStatus.filter(g => g.isOnline));
        setInactiveGroups(groupedWithStatus.filter(g => !g.isOnline));
      }
    };

    void loadGroupedRobots();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      void loadGroupedRobots();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Get selected group
  const selectedGroup = selectedGroupId !== null
    ? groupedRobots.find(g => g.groupId === selectedGroupId)
    : null;

  // Load stats based on selected robot group
  useEffect(() => {
    const loadStats = async () => {
      if (selectedGroup) {
        // Load per-robot stats using primary device
        const deviceId = selectedGroup.primaryDeviceId;
        const [errorCountResult, commandsResult, wsTrafficResult] = await Promise.all([
          getRobotErrorCount(deviceId),
          getCommandLogs(20, deviceId),
          getRecentWsTraffic(20, deviceId),
        ]);

        // Just use current battery 
        setAvgBattery(selectedGroup.battery);
        setBatteryBuckets({ critical: 0, warning: 0, healthy: 0 }); // Not used for single robot
        setErrorCount(errorCountResult.data ?? 0);

        // Build unified activity items
        const cmdItems: ActivityItem[] = (commandsResult.data ?? []).map(cmd => ({
          id: `cmd-${cmd.h_command_log_id}`,
          source: 'command' as const,
          code: cmd.command_code,
          status: cmd.status,
          message: cmd.status_message,
          created_at: cmd.created_at,
          device_id: cmd.device_id,
        }));
        const wsItems: ActivityItem[] = (wsTrafficResult.data ?? []).map(ws => {
          const isInitReady = ws.code === 'INIT' && (ws.payload as any)?.status === 'READY';
          const effectiveCode = isInitReady ? 'READY' : ws.code;
          return {
            id: `ws-${ws.h_ws_traffic_id}`,
            source: 'ws_traffic' as const,
            code: effectiveCode,
            status: effectiveCode,
            message: `WebSocket ${effectiveCode}`,
            created_at: ws.recorded_at,
            device_id: ws.device_id,
          };
        });
        const isToday = (dString: string) => {
          const d = new Date(dString);
          const t = new Date();
          return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
        };

        const allItems = [...cmdItems, ...wsItems]
          .filter(item => isToday(item.created_at))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);
        setActivityItems(allItems);
      } else if (showFleetOverview) {
        // Load all stats for fleet
        const [statsResult, wsTrafficResult] = await Promise.all([
          getDashboardStats(),
          getRecentWsTraffic(100), // Increase limit for fleet overview log matching
        ]);
        const stats = statsResult.data;

        if (stats) {
          // Calculate fleet battery metrics based on ALL robots (Last Known State of Charge)
          const validRobots = groupedRobots.filter(g => g.battery !== null);
          if (validRobots.length > 0) {
              const sum = validRobots.reduce((acc, g) => acc + (g.battery || 0), 0);
              setAvgBattery(Math.round(sum / validRobots.length));
              
              let crit = 0, warn = 0, health = 0;
              validRobots.forEach(g => {
                  if (g.battery !== null) {
                      if (g.battery <= 20) crit++;
                      else if (g.battery <= 50) warn++;
                      else health++;
                  }
              });
              setBatteryBuckets({ critical: crit, warning: warn, healthy: health });
          } else {
              setAvgBattery(null);
              setBatteryBuckets({ critical: 0, warning: 0, healthy: 0 });
          }

          setErrorCount(stats.errorCount);

          // Build unified activity items
          const cmdItems: ActivityItem[] = stats.latestCommands.map(cmd => ({
            id: `cmd-${cmd.h_command_log_id}`,
            source: 'command' as const,
            code: cmd.command_code,
            status: cmd.status,
            message: cmd.status_message,
            created_at: cmd.created_at,
            device_id: cmd.device_id,
          }));
          const wsItems: ActivityItem[] = (wsTrafficResult.data ?? []).map(ws => {
            const isInitReady = ws.code === 'INIT' && (ws.payload as any)?.status === 'READY';
            const effectiveCode = isInitReady ? 'READY' : ws.code;
            return {
              id: `ws-${ws.h_ws_traffic_id}`,
              source: 'ws_traffic' as const,
              code: effectiveCode,
              status: effectiveCode,
              message: `WebSocket ${effectiveCode}`,
              created_at: ws.recorded_at,
              device_id: ws.device_id,
            };
          });
          const isToday = (dString: string) => {
            const d = new Date(dString);
            const t = new Date();
            return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
          };

          const allItems = [...cmdItems, ...wsItems]
            .filter(item => isToday(item.created_at))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          // We don't slice immediately so we can distribute logs to each robot's card
          setActivityItems(allItems);
        }
      }
    };

    void loadStats();
  }, [selectedGroup, groupedRobots, showFleetOverview]);

  const validFleet = groupedRobots.filter(g => g.battery !== null).length;
  
  const criticalPct =
    validFleet === 0
      ? 0
      : Math.round((batteryBuckets.critical / validFleet) * 100);
  const warningPct =
    validFleet === 0
      ? 0
      : Math.round((batteryBuckets.warning / validFleet) * 100);
  const healthyPct =
    validFleet === 0
      ? 0
      : Math.round((batteryBuckets.healthy / validFleet) * 100);

  if (isInitializing) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const renderActivityItem = (item: ActivityItem) => {
    const isWs = item.source === 'ws_traffic';
    const dotColor = isWs
      ? item.code === 'READY' ? 'bg-emerald-500 shadow-emerald-500/50'
        : item.code === 'ERROR' ? 'bg-rose-500 shadow-rose-500/50'
        : item.code === 'DISCONNECT' ? 'bg-slate-400 shadow-slate-400/50'
        : 'bg-blue-500 shadow-blue-500/50' // INIT
      : item.status !== 'success' ? 'bg-rose-500 shadow-rose-500/50' : 'bg-emerald-500 shadow-emerald-500/50';

    return (
      <div key={item.id} className="flex items-start gap-2.5 py-2 group">
        <div className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-medium text-txt-main font-mono truncate">
              {item.code || "UNKNOWN"}
            </span>
            {isWs && (
              <span className="text-[8px] px-1 py-[1px] rounded bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-mono border border-indigo-300 dark:border-indigo-500/20 leading-none">
                WS
              </span>
            )}
            <span className="text-[9px] text-txt-sec ml-auto whitespace-nowrap">
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {item.message ? (
            <p className="text-[10px] text-txt-sec truncate group-hover:whitespace-normal group-hover:text-txt-main transition-colors">
              {item.message}
            </p>
          ) : (
            <p className="text-[9px] text-txt-sec uppercase tracking-wider font-semibold mt-0.5">
              {item.status}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Robot Selector and Notification Bell */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-[60]">
        <div>
          <h1 className="text-2xl font-bold text-txt-main tracking-tight">
            {showFleetOverview ? dict.dashboard.home.fleet_overview_title : dict.dashboard.home.title}
          </h1>
          <p className="text-sm text-txt-sec">
            {showFleetOverview ? dict.dashboard.home.fleet_overview_subtitle : dict.dashboard.home.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <RobotSelectorModal
            selectedGroupId={selectedGroupId}
            groupedRobots={groupedRobots}
            activeCount={activeGroups.length}
            onSelect={handleRobotSelect}
            allRobotsLabel={dict.dashboard.home.all_robots}
            selectRobotLabel={dict.dashboard.home.switch_robot}
            activeCountLabel={dict.dashboard.home.active_count}
          />

          {/* Notification Bell */}
          <NotificationBell allowedDeviceIds={selectedGroup ? selectedGroup.devices.map(d => typeof d.device_id === 'string' ? parseInt(d.device_id, 10) : d.device_id) : undefined} />
        </div>
      </div>

      {showFleetOverview ? (
        /* FLEET OVERVIEW / ROBOT PICKER SCREEN */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {groupedRobots.length === 0 ? (
            <div className="text-center p-12 glass-panel rounded-2xl border-dashed border-2 border-border-base mt-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sidebar mb-4 border border-border-base">
                <svg className="w-8 h-8 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-txt-main">{dict.dashboard.home.robot_picker_no_robots}</p>
              <p className="text-sm text-txt-sec mt-2">Tambahkan robot terlebih dahulu melalui halaman Kelola Robot.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {groupedRobots.map(robot => {
                // Get 2 latest activity items for this robot
                const robotActivities = activityItems.filter(item => 
                  item.device_id !== undefined && robot.devices.some(d => d.device_id === item.device_id)
                ).slice(0, 3);

                return (
                  <button
                    key={robot.groupId}
                    onClick={() => handleRobotSelect(robot.groupId)}
                    className="group flex flex-col justify-between p-6 rounded-2xl glass-panel border border-border-base hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left shadow-lg hover:shadow-emerald-500/10 min-h-[220px] relative overflow-hidden"
                  >
                    <div className={`absolute top-0 right-0 w-24 h-24 ${robot.isOnline ? 'bg-emerald-100 dark:bg-emerald-500/10' : 'bg-slate-50 dark:bg-slate-500/5'} rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110`}></div>
                    
                    <div className="relative z-10 flex-1 w-full">
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner group-hover:scale-105 transition-transform ${robot.isOnline ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'}`}>
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        </div>
                        {robot.isOnline ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 " />
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Online</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Offline</span>
                          </span>
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-bold text-txt-main group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {robot.displayName}
                        </h3>
                        <div className="flex items-center gap-3 mt-2">
                          {robot.battery !== null && (
                            <div className="flex items-center gap-1 text-xs font-semibold text-txt-sec">
                              <BatteryIcon level={robot.battery} className={`w-4 h-4 ${robot.battery <= 20 ? 'text-rose-500' : robot.battery <= 50 ? 'text-amber-500' : 'text-emerald-500'}`} />
                              <span className={robot.battery <= 20 ? 'text-rose-500' : ''}>{robot.battery}%</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[10px] font-mono text-txt-sec bg-sidebar px-1.5 py-0.5 rounded border border-border-base">
                            {robot.rbDevice?.device_code || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-border-base w-full">
                        <p className="text-[10px] text-txt-sec font-semibold uppercase tracking-wider mb-2">Aktivitas Terakhir</p>
                        {robotActivities.length > 0 ? (
                          <div className="space-y-1">
                            {robotActivities.map(item => renderActivityItem(item))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-txt-sec italic">Tidak ada aktivitas baru hari ini.</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* SINGLE ROBOT DASHBOARD VIEW */
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
          <button 
            onClick={() => handleRobotSelect(null)}
            className="flex items-center gap-1.5 text-sm font-medium text-txt-sec hover:text-blue-500 transition-colors w-fit group"
          >
            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict.dashboard.home.robot_picker_fleet_overview || 'Kembali ke Semua Robot'}
          </button>
          
          {/* Selected Robot Info Banner */}
      {selectedGroup && (
        <div className="glass-panel rounded-xl p-4 border-l-4 border-blue-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-blue-900/20 flex items-center justify-center border border-blue-800/30 flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-txt-main truncate">{dict.dashboard.home.robot_detail}: {selectedGroup.displayName}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {selectedGroup.rbDevice && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-mono">
                      {selectedGroup.rbDevice.device_code}
                    </span>
                  )}
                  {selectedGroup.uiDevice && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 font-mono">
                      {selectedGroup.uiDevice.device_code}
                    </span>
                  )}
                  <span className="text-[10px] text-txt-sec">• {selectedGroup.mode || 'UNKNOWN'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 pl-[52px] sm:pl-0">
              {selectedGroup.battery !== null && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${selectedGroup.battery <= 20 ? 'bg-rose-500/15 border border-rose-500/30' :
                  selectedGroup.battery <= 50 ? 'bg-amber-500/15 border border-amber-500/30' :
                    'bg-emerald-500/15 border border-emerald-500/30'
                  }`}>
                  <BatteryIcon level={selectedGroup.battery} className={`w-5 h-5 ${selectedGroup.battery <= 20 ? 'text-rose-500' :
                    selectedGroup.battery <= 50 ? 'text-amber-500' :
                      'text-emerald-400'
                    }`} />
                  <span className={`text-sm font-bold tabular-nums ${selectedGroup.battery <= 20 ? 'text-rose-400' :
                    selectedGroup.battery <= 50 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>{selectedGroup.battery}%</span>
                </div>
              )}
              <Link
                href={`/robots/${selectedGroup.primaryDeviceId}`}
                className="text-xs text-txt-accent hover:text-blue-700 dark:text-blue-400 transition-colors font-medium whitespace-nowrap"
              >
                {dict.dashboard.robots.access_terminal} →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Robot Control Panel - only when a robot is selected */}
      {selectedGroup && (
        <RobotControlPanel selectedGroup={selectedGroup} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Active Robots Card */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-txt-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" /></svg>
          </div>
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-widest">{dict.dashboard.home.active_robots}</p>
          <p className="mt-3 metric-value">
            {selectedGroupId !== null ? "1" : (activeGroups.length === 0 ? "0" : `${activeGroups.length}`)}
            {!selectedGroupId && groupedRobots.length > 0 && <span className="text-lg text-txt-sec ml-1 font-semibold">/ {groupedRobots.length}</span>}
          </p>
          <p className="mt-2 text-[11px] sm:text-xs text-txt-sec">
            {selectedGroupId !== null
              ? selectedGroup?.displayName
              : "Total node online vs terdaftar."}
          </p>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-600 to-transparent opacity-50" />
        </div>

        {/* Avg Battery Card */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest leading-tight">
            {selectedGroup ? "Level Baterai Saat Ini" : "Baterai Armada (Terakhir Diketahui)"}
          </p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1 mt-3">
            <div>
              <p className="metric-value">
                {avgBattery === null ? "-" : `${avgBattery}%`}
              </p>
              {selectedGroup && <p className="text-[10px] text-txt-sec font-medium mt-1 uppercase">SoC (Charge)</p>}
            </div>
            {selectedGroup && selectedGroup.batteryLevel !== null && (
              <div>
                <p className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">
                  {selectedGroup.batteryLevel}%
                </p>
                <p className="text-[10px] text-txt-sec font-medium mt-1 uppercase">SoH (Health)</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-txt-sec leading-relaxed">
            {selectedGroup 
              ? "State of Charge (SoC) dan State of Health (SoH) real-time."
              : `Rata-rata State of Charge dari ${validFleet} robot terdaftar.`}
          </p>
        </div>

        {/* Critical Errors Card */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden sm:col-span-2 md:col-span-1">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-400 uppercase tracking-widest">
            {dict.dashboard.home.critical_errors}
          </p>
          <p className="mt-3 metric-value">
            {errorCount === null ? "-" : errorCount}
          </p>
          <p className="mt-2 text-[11px] sm:text-xs text-txt-sec">
            {dict.dashboard.home.critical_errors_desc}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Battery Health Distribution or Single Robot SoC */}
          <div className="glass-panel rounded-2xl p-5">
            {!selectedGroup ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-txt-main">
                      Distribusi Baterai Armada
                    </p>
                    <p className="text-[11px] text-txt-sec">
                      Status State of Charge seluruh armada (Terakhir Diketahui)
                    </p>
                  </div>
                  <span className="rounded-full bg-sidebar border border-border-base px-2 py-1 text-[11px] text-txt-sec">
                    {validFleet} robot
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-sidebar flex border border-border-base">
                  <div
                    className="h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                    style={{ width: `${criticalPct}%` }}
                  />
                  <div
                    className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                    style={{ width: `${warningPct}%` }}
                  />
                  <div
                    className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                    style={{ width: `${healthyPct}%` }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-txt-sec">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]" />{" "}
                    {dict.dashboard.home.healthy} ({batteryBuckets.healthy})
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b]" />{" "}
                    {dict.dashboard.home.warning} ({batteryBuckets.warning})
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_4px_#f43f5e]" />{" "}
                    {dict.dashboard.home.critical} ({batteryBuckets.critical})
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-txt-main mb-4">
                  Status Daya: {selectedGroup.displayName}
                </p>
                
                {/* State of Charge (SoC) */}
                <div className="mb-4">
                  <div className="flex justify-between items-center text-sm mb-1.5">
                    <span className="text-txt-sec text-xs uppercase tracking-wider font-medium">State of Charge (SoC)</span>
                    <span className={`font-bold ${
                      selectedGroup.battery !== null && selectedGroup.battery <= 20 ? 'text-rose-700 dark:text-rose-400' :
                      selectedGroup.battery !== null && selectedGroup.battery <= 50 ? 'text-amber-700 dark:text-amber-400' :
                      'text-emerald-700 dark:text-emerald-400'
                    }`}>
                      {selectedGroup.battery !== null ? `${selectedGroup.battery}%` : 'Unknown'}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-sidebar flex border border-border-base relative">
                    <div 
                      className={`h-full ${
                        selectedGroup.battery !== null && selectedGroup.battery <= 20 
                          ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' 
                          : selectedGroup.battery !== null && selectedGroup.battery <= 50 
                            ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' 
                            : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                      }`}
                      style={{ width: `${selectedGroup.battery || 0}%`, transition: 'width 0.5s ease-in-out' }}
                    />
                  </div>
                </div>

                {/* State of Health (SoH) */}
                <div>
                  <div className="flex justify-between items-center text-sm mb-1.5">
                    <span className="text-txt-sec text-xs uppercase tracking-wider font-medium">State of Health (SoH)</span>
                    <span className={`font-bold ${
                      selectedGroup.batteryLevel !== null && selectedGroup.batteryLevel <= 20 ? 'text-rose-700 dark:text-rose-400' :
                      selectedGroup.batteryLevel !== null && selectedGroup.batteryLevel <= 50 ? 'text-amber-700 dark:text-amber-400' :
                      'text-blue-700 dark:text-blue-400'
                    }`}>
                      {selectedGroup.batteryLevel !== null ? `${selectedGroup.batteryLevel}%` : 'Unknown'}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-sidebar flex border border-border-base relative">
                    <div 
                      className={`h-full ${
                        selectedGroup.batteryLevel !== null && selectedGroup.batteryLevel <= 20 
                          ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' 
                          : selectedGroup.batteryLevel !== null && selectedGroup.batteryLevel <= 50 
                            ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' 
                            : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
                      }`}
                      style={{ width: `${selectedGroup.batteryLevel || 0}%`, transition: 'width 0.5s ease-in-out' }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Inactive Robot History - now uses grouped robots */}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-txt-main">
                  {dict.dashboard.home.robot_history}
                </p>
                <p className="text-[11px] text-txt-sec">
                  {dict.dashboard.home.latest_devices}
                </p>
              </div>
              <Link
                href="/robots"
                className="text-[11px] font-semibold text-txt-accent hover:text-blue-700 dark:text-blue-400 transition-colors"
              >
                {dict.dashboard.home.view_all}
              </Link>
            </div>
            <div className="max-h-64 overflow-y-auto pr-2">
              {inactiveGroups.length === 0 ? (
                <p className="text-sm text-txt-sec py-4 text-center">
                  {dict.dashboard.home.no_inactive_robots}
                </p>
              ) : (
                <ul className="space-y-2">
                  {inactiveGroups.map((group) => (
                    <li
                      key={group.groupId}
                      className="group flex items-center justify-between gap-3 p-3 rounded-xl bg-sidebar border border-transparent hover:border-border-highlight hover:bg-card-bg transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-slate-900/50 flex items-center justify-center border border-slate-700/30 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/robots/${group.primaryDeviceId}`}
                            className="text-sm font-medium text-txt-main group-hover:text-txt-accent transition-colors truncate block"
                          >
                            {group.displayName}
                          </Link>
                          <div className="flex items-center gap-1">
                            {group.rbDevice && (
                              <span className="text-[9px] px-1 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-mono">
                                {group.rbDevice.device_code}
                              </span>
                            )}
                            {group.uiDevice && (
                              <span className="text-[9px] px-1 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 font-mono">
                                {group.uiDevice.device_code}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-700/30 border border-slate-600/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
                          <span className="text-[10px] font-medium text-slate-700 dark:text-slate-400">{dict.common.offline}</span>
                        </div>
                        <Link
                          href={`/robots/${group.primaryDeviceId}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-primary-glow text-txt-accent hover:bg-blue-100 dark:bg-blue-500/20"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-0 overflow-hidden flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-base">
              <div>
                <p className="text-sm font-semibold text-txt-main">
                  {dict.dashboard.home.activity_log}
                </p>
                <p className="text-[11px] text-txt-sec">
                  {dict.dashboard.home.latest_commands}
                </p>
              </div>
              <Link
                href={selectedGroup ? `/notifications?robot=${selectedGroup.primaryDeviceId}` : "/notifications"}
                className="text-[11px] font-semibold text-txt-accent hover:text-blue-700 dark:text-blue-400"
              >
                {dict.dashboard.home.full_log}
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[400px]">
              {activityItems.length === 0 ? (
                <div className="px-5 py-6 text-sm text-txt-sec text-center">
                  {dict.dashboard.home.no_activity}
                </div>
              ) : (
                <div className="divide-y divide-border-base px-5">
                  {activityItems.slice(0, 10).map(item => renderActivityItem(item))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
