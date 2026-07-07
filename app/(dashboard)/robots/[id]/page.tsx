 
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getRobotById, getBatteryHistory, getActivityData, getHourlyBatteryData, getRobotSummary, type DeviceInfo, type BatteryRow, type ActivityData, type HourlyBatteryData } from "@/lib/api";

export default function RobotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const deviceId = Number(id);

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [latestBattery, setLatestBattery] = useState<BatteryRow | null>(null);
  const [batteryHistory, setBatteryHistory] = useState<BatteryRow[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [batteryHourly, setBatteryHourly] = useState<HourlyBatteryData[]>([]);
  const [activityRange, setActivityRange] = useState<'1d' | '1w' | '1m' | '3m'>('1d');
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // Load device info
      const { data: deviceData, error: deviceError } = await getRobotById(deviceId);

      if (deviceError) {
        setError(deviceError);
      } else if (deviceData) {
        setDeviceInfo(deviceData);
      }

      // Load battery history
      const { data: batteryData, error: batteryError } = await getBatteryHistory(deviceId, 50);

      if (batteryError) {
        setError(batteryError);
      } else if (batteryData) {
        setLatestBattery(batteryData[0] ?? null);
        setBatteryHistory(batteryData);
      }

      // Load Activity Data + Hourly Battery Data in parallel
      const [activityResult, batteryHourlyResult] = await Promise.all([
        getActivityData(deviceId, activityRange),
        getHourlyBatteryData(deviceId, activityRange),
      ]);

      if (activityResult.data) {
        setActivityData(activityResult.data);
      }
      if (batteryHourlyResult.data) {
        setBatteryHourly(batteryHourlyResult.data);
      }

      // Load connection status
      const { data: summaryData } = await getRobotSummary(deviceId);
      if (summaryData) {
        setIsOnline(summaryData.is_online);
      }

      setLoading(false);
    };

    void loadData();
  }, [deviceId, activityRange]);

  const batteryColor =
    latestBattery && Number(latestBattery.battery_percent ?? 0) <= 30
      ? "text-rose-500"
      : latestBattery && Number(latestBattery.battery_percent ?? 0) <= 60
        ? "text-amber-500"
        : "text-emerald-500";

  // Find max value for graph scaling
  const maxActivity = Math.max(...activityData.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-txt-sec hover:text-white transition-colors w-fit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            BACK TO DASHBOARD
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-txt-main tracking-tight leading-none">
              {deviceInfo?.device_name ?? "Loading Device..."}
            </h1>
            <div className="flex flex-wrap gap-4 text-xs font-mono text-txt-accent mt-2">
              <span className="bg-primary-glow px-2 py-0.5 rounded border border-border-highlight">ID: {deviceId}</span>
              {deviceInfo?.device_code && <span>CODE: {deviceInfo.device_code}</span>}
            {deviceInfo?.robot_local_ip && <span>IP: {deviceInfo.robot_local_ip}</span>}
            {deviceInfo?.robot_local_ssid && <span>NET: {deviceInfo.robot_local_ssid}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-emerald-500 uppercase tracking-widest">Online</span>
            </>
          ) : (
            <>
              <span className="flex h-2 w-2 relative">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-xs font-medium text-red-500 uppercase tracking-widest">Offline</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 border border-red-900/50 bg-red-900/20 rounded-lg px-4 py-3">
          Error: {error}
        </p>
      )}

      {/* Battery Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5 relative overflow-hidden">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest">
            Battery Charge
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${batteryColor} text-shadow-glow`}>
            {latestBattery && latestBattery.battery_percent != null
              ? `${Number(latestBattery.battery_percent)}%`
              : "-"}
          </p>
          <p className="mt-2 text-xs text-txt-sec font-mono">
            {latestBattery
              ? `LAST UPDATE: ${new Date(latestBattery.recorded_at).toLocaleTimeString()}`
              : "WAITING FOR TELEMETRY..."}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest">Device ID</p>
          <p className="mt-2 text-xl font-bold text-txt-main tracking-tight">
            {latestBattery?.device_id ?? "-"}
          </p>
          <p className="mt-2 text-xs text-txt-sec">
            Device identifier
          </p>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <p className="text-xs font-medium text-txt-sec uppercase tracking-widest">Voltage</p>
          <p className="mt-2 text-xl font-bold text-txt-main tracking-tight">
            {latestBattery?.voltage != null ? `${latestBattery.voltage} V` : "-"}
          </p>
          <p className="mt-2 text-xs text-txt-sec">
            Terminal voltage
          </p>
        </div>
      </div>

      {/* Robot Activity Graph + Battery Overlay */}
      <div className="glass-panel rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-txt-main uppercase tracking-widest">Activity Monitor</h2>
            <p className="text-xs text-txt-sec mt-1">
              {activityRange === '1d' ? 'Frekuensi command & baterai per jam (hari ini)' : activityRange === '1w' ? 'Frekuensi command & baterai per hari (7 hari terakhir)' : activityRange === '1m' ? 'Frekuensi command & baterai per hari (30 hari terakhir)' : 'Frekuensi command & baterai per hari (3 bulan terakhir)'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Legend */}
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-blue-500"></div>
                <span className="text-[10px] text-txt-sec font-medium">Commands</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] text-txt-sec font-medium">Baterai %</span>
              </div>
            </div>
            <span className="text-[10px] font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-500/10 text-blue-500 border border-blue-300 dark:border-blue-500/20 uppercase tracking-wider">
              Live Data
            </span>
          </div>
        </div>

        {/* Range Filter Buttons */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { value: '1d' as const, label: 'Hari Ini' },
            { value: '1w' as const, label: '1 Minggu' },
            { value: '1m' as const, label: '1 Bulan' },
            { value: '3m' as const, label: '3 Bulan' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setActivityRange(option.value)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium transition-all duration-200 border ${activityRange === option.value
                ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-400 dark:border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.2)]'
                : 'bg-transparent text-txt-sec border-border-base hover:border-border-highlight hover:text-txt-main'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {activityData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-txt-sec text-xs font-mono">
            Belum ada data untuk hari ini...
          </div>
        ) : (
          <>
            <div className="flex h-56 w-full">
              {/* Y-Axis Labels (Commands) */}
              <div className="flex flex-col justify-between text-[10px] text-blue-400 font-mono pr-2 py-0 shrink-0 items-end w-10">
                <span>{maxActivity}</span>
                <span>{Math.round(maxActivity * 0.66)}</span>
                <span>{Math.round(maxActivity * 0.33)}</span>
                <span>0</span>
              </div>

              {/* Chart Area */}
              <div className="relative flex-1 h-full">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="w-full border-b border-dashed border-border-base h-0"></div>
                  <div className="w-full border-b border-dashed border-border-base h-0"></div>
                  <div className="w-full border-b border-dashed border-border-base h-0"></div>
                  <div className="w-full border-b border-border-base h-0"></div>
                </div>

                {/* Bars */}
                <div className="absolute inset-0 flex items-end justify-between px-2 gap-1">
                  {activityData.map((data, index) => {
                    const heightPct = (data.count / maxActivity) * 100;
                    const visualHeight = data.count > 0 ? Math.max(heightPct, 4) : 0;
                    const batteryPoint = batteryHourly[index];
                    const hasBattery = batteryPoint && batteryPoint.avg_battery >= 0;

                    return (
                      <div key={index} className="flex flex-col items-center justify-end h-full w-full group relative cursor-pointer outline-none" tabIndex={0}>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 group-active:opacity-100 group-focus:opacity-100 transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 group-active:translate-y-0 group-focus:translate-y-0 bg-sidebar border border-border-highlight text-txt-main text-[10px] font-medium px-3 py-2 rounded-lg shadow-xl pointer-events-none whitespace-nowrap z-20">
                          <div className="font-semibold text-[11px] mb-1 text-txt-accent">{data.label ?? `${data.hour}:00`}</div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-1.5 h-1.5 rounded-[1px] bg-blue-500"></div>
                            <span><span className="font-bold">{data.count}</span> commands</span>
                          </div>
                          {hasBattery && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                              <span>Baterai: <span className="font-bold">{batteryPoint.avg_battery}%</span></span>
                            </div>
                          )}
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-sidebar border-b border-r border-border-highlight rotate-45"></div>
                        </div>

                        {/* Bar */}
                        <div
                          className="w-full max-w-[14px] rounded-t-[3px] transition-all duration-500 ease-out hover:brightness-125 relative group-hover:shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                          style={{
                            height: `${visualHeight}%`,
                            background: data.count > 0
                              ? 'linear-gradient(180deg, rgba(59,130,246,0.95) 0%, rgba(59,130,246,0.6) 100%)'
                              : 'rgba(59, 130, 246, 0.05)',
                            opacity: data.count > 0 ? 0.8 + (data.count / maxActivity) * 0.2 : 1,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Battery Line Overlay (SVG for line/area + HTML divs for dots) */}
                {batteryHourly.length > 0 && (() => {
                  const total = activityData.length;
                  if (total === 0) return null;

                  // Calculate points
                  const validPoints: { x: number; y: number; battery: number }[] = [];
                  batteryHourly.forEach((bp, i) => {
                    if (bp.avg_battery >= 0 && i < total) {
                      const x = ((i + 0.5) / total) * 100;
                      const y = 100 - bp.avg_battery; // battery is 0-100%
                      validPoints.push({ x, y, battery: bp.avg_battery });
                    }
                  });

                  if (validPoints.length === 0) return null;

                  // Build smooth path (only if 2+ points)
                  const hasLine = validPoints.length >= 2;
                  const pathParts = hasLine ? validPoints.map((pt, idx) => {
                    if (idx === 0) return `M ${pt.x} ${pt.y}`;
                    const prev = validPoints[idx - 1];
                    const cpx1 = prev.x + (pt.x - prev.x) * 0.4;
                    const cpx2 = pt.x - (pt.x - prev.x) * 0.4;
                    return `C ${cpx1} ${prev.y}, ${cpx2} ${pt.y}, ${pt.x} ${pt.y}`;
                  }) : [];

                  const areaPath = hasLine
                    ? [...pathParts, `L ${validPoints[validPoints.length - 1].x} 100`, `L ${validPoints[0].x} 100`, 'Z'].join(' ')
                    : '';

                  return (
                    <>
                      {/* SVG layer: line + area fill (no circles here — they get squished by preserveAspectRatio=none) */}
                      {hasLine && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          <path
                            d={areaPath}
                            fill="url(#batteryGradient)"
                            className="transition-all duration-700"
                          />
                          <path
                            d={pathParts.join(' ')}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ vectorEffect: 'non-scaling-stroke' }}
                            className="drop-shadow-sm transition-all duration-700"
                          />
                        </svg>
                      )}

                      {/* HTML dots layer: perfectly round, not affected by SVG distortion */}
                      <div className="absolute inset-0 pointer-events-none">
                        {validPoints.map((pt, idx) => (
                          <div
                            key={idx}
                            className="absolute w-[10px] h-[10px] rounded-full border-2 border-emerald-800 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                            style={{
                              left: `${pt.x}%`,
                              top: `${pt.y}%`,
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: '#10b981',
                            }}
                          />
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Y-Axis Labels (Battery %) */}
              <div className="flex flex-col justify-between text-[10px] text-emerald-400 font-mono pl-2 py-0 shrink-0 items-start w-10">
                <span>100%</span>
                <span>66%</span>
                <span>33%</span>
                <span>0%</span>
              </div>
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-between mt-3 text-[10px] text-txt-sec px-12 font-mono overflow-hidden">
              {activityData.length > 0 && (() => {
                const total = activityData.length;
                const maxLabels = 8;
                const step = Math.max(1, Math.floor(total / maxLabels));
                const indices: number[] = [];
                for (let i = 0; i < total; i += step) indices.push(i);
                if (indices[indices.length - 1] !== total - 1) indices.push(total - 1);
                return indices.map((i) => (
                  <span key={i} className="text-center">{activityData[i]?.label ?? `${activityData[i]?.hour}:00`}</span>
                ));
              })()}
            </div>

            {/* Mobile legend */}
            <div className="flex sm:hidden items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-blue-500"></div>
                <span className="text-[10px] text-txt-sec font-medium">Commands</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] text-txt-sec font-medium">Baterai %</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Battery History Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base">
          <h2 className="text-sm font-semibold text-txt-main uppercase tracking-widest">
            Battery History
          </h2>
          {loading && (
            <span className="text-[10px] text-blue-700 dark:text-blue-400 animate-pulse uppercase tracking-wider">Syncing...</span>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto custom-scrollbar">
          <table className="min-w-full text-xs">
            <thead className="bg-black text-left text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Charge</th>
                <th className="px-6 py-3">Voltage</th>
                <th className="px-6 py-3">Device ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {batteryHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-txt-sec">
                    No battery telemetry recorded.
                  </td>
                </tr>
              ) : (
                batteryHistory.map((item) => (
                  <tr key={item.h_battery_id} className="hover:bg-card-bg transition-colors">
                    <td className="px-6 py-3 text-txt-sec font-mono">
                      {new Date(item.recorded_at).toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 font-medium text-txt-main">
                      {item.battery_percent != null
                        ? `${Number(item.battery_percent)}%`
                        : "-"}
                    </td>
                    <td className="px-6 py-3 text-txt-sec">
                      {item.voltage != null ? `${item.voltage} V` : "-"}
                    </td>
                    <td className="px-6 py-3 text-txt-sec font-mono text-[10px]">
                      {item.device_id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
