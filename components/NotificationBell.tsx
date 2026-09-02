"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getLowBatteryDevices, getLatestWsTrafficPerDevice, getRobots, groupRobots, type SystemNotification } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";

const WS_CODE_LABELS: Record<string, string> = {
    INIT: 'Initializing',
    READY: 'Ready',
    ERROR: 'Error',
    DISCONNECT: 'Disconnected',
    MAPPING_DONE: 'Mapping Complete',
};

export default function NotificationBell({ allowedDeviceIds }: { allowedDeviceIds?: number[] }) {
    const { dict } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const popupRef = useRef<HTMLDivElement>(null);
    const deviceNameMapRef = useRef<Map<number, string>>(new Map());

    // Load device names once
    useEffect(() => {
        const loadDeviceNames = async () => {
            const { data } = await getRobots();
            if (data) {
                const grouped = groupRobots(data);
                grouped.forEach(g => {
                    if (g.rbDevice) {
                        const id = typeof g.rbDevice.device_id === 'string' ? parseInt(g.rbDevice.device_id, 10) : g.rbDevice.device_id;
                        deviceNameMapRef.current.set(id, g.displayName);
                    }
                    if (g.uiDevice) {
                        const id = typeof g.uiDevice.device_id === 'string' ? parseInt(g.uiDevice.device_id, 10) : g.uiDevice.device_id;
                        deviceNameMapRef.current.set(id, g.displayName);
                    }
                });
            }
        };
        void loadDeviceNames();
    }, []);

    const loadNotifications = async () => {
        setLoading(true);

        // Get low battery devices
        const { data: lowBattery } = await getLowBatteryDevices();

        // Generate notifications from low battery devices (filtered)
        const batteryNotifs: SystemNotification[] = (lowBattery ?? [])
            .filter(device => {
                const id = typeof device.device_id === 'string' ? parseInt(device.device_id, 10) : device.device_id;
                return id && (!allowedDeviceIds || allowedDeviceIds.includes(id));
            })
            .map((device) => {
                const isCritical = device.battery_percent !== null && device.battery_percent < 30;
                return {
                    id: `battery-${isCritical ? 'critical' : 'low'}-${device.device_id}-${new Date().toLocaleDateString('en-GB')}`,
                    device_id: device.device_id,
                    device_name: device.device_name,
                    type: 'low_battery' as const,
                    title: isCritical 
                        ? (dict.dashboard.notifications?.critical_battery_title || 'Critical Battery Alert')
                        : (dict.dashboard.notifications?.low_battery_title || 'Low Battery Alert'),
                    message: `${device.device_name || device.device_code} - ${device.battery_percent}%`,
                    is_read: false,
                    created_at: device.status_updated_at || new Date().toISOString(),
                };
            });

        // Get latest WS traffic per device (filtered)
        const { data: wsTraffic } = await getLatestWsTrafficPerDevice();
        const wsNotifs: SystemNotification[] = (wsTraffic ?? [])
            .filter(evt => {
                const id = typeof evt.device_id === 'string' ? parseInt(evt.device_id, 10) : evt.device_id;
                return ['INIT', 'READY', 'ERROR', 'DISCONNECT', 'MAPPING_DONE'].includes(evt.code) && id && (!allowedDeviceIds || allowedDeviceIds.includes(id));
            })
            .map((evt) => {
                const parsedId = typeof evt.device_id === 'string' ? parseInt(evt.device_id, 10) : evt.device_id;
                const deviceName = parsedId
                    ? deviceNameMapRef.current.get(parsedId) ?? `Device #${parsedId}`
                    : 'Unknown Device';
                const codeLabel = WS_CODE_LABELS[evt.code] ?? evt.code;

                return {
                    id: `ws-${evt.h_ws_traffic_id}`,
                    device_id: evt.device_id,
                    device_name: deviceName,
                    type: 'ws_traffic' as const,
                    title: evt.code === 'MAPPING_DONE' ? `Map: ${deviceName}` : `Robot ${codeLabel}`,
                    message: evt.code === 'MAPPING_DONE' ? 'A new map has been successfully finalized and rendered.' : `${deviceName} — ${codeLabel}`,
                    is_read: evt.code === 'READY' || evt.code === 'INIT', // READY/INIT are informational
                    created_at: evt.recorded_at,
                };
            });

        // Combine: WS traffic first (sorted by time), then battery
        const allNotifs = [...wsNotifs, ...batteryNotifs].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setNotifications(allNotifs);
        setLoading(false);
    };

    const allowedDeviceIdsStr = allowedDeviceIds?.join(',');

    useEffect(() => {
        void loadNotifications();
        // Refresh every 15 seconds
        const interval = setInterval(() => {
            void loadNotifications();
        }, 15000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedDeviceIdsStr]);

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Load read state from localStorage exclusively on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('tifa_read_notifs');
            if (saved) {
                setReadNotifIds(new Set(JSON.parse(saved)));
            }
        } catch (e) {
            console.error("Failed to load read notifs", e);
        }
    }, []);

    // Mark notifications as read when opening the popup and save to localStorage
    useEffect(() => {
        if (isOpen && notifications.length > 0) {
            setReadNotifIds(prev => {
                const newSet = new Set(prev);
                let changed = false;
                notifications.forEach(n => {
                    if (!newSet.has(n.id)) {
                        newSet.add(n.id);
                        changed = true;
                    }
                });
                
                if (changed) {
                    const arr = Array.from(newSet);
                    // Keep the storage from growing infinitely (keep last 300)
                    if (arr.length > 300) {
                        arr.splice(0, arr.length - 300);
                    }
                    try {
                        localStorage.setItem('tifa_read_notifs', JSON.stringify(arr));
                    } catch {
                         // ignore
                    }
                    return new Set(arr);
                }
                return newSet;
            });
        }
    }, [isOpen, notifications]);

    const unreadCount = notifications.filter(n => !n.is_read && !readNotifIds.has(n.id)).length;

    const getNotificationIcon = (type: SystemNotification['type'], title?: string) => {
        if (type === 'ws_traffic') {
            // Determine WS traffic code from title
            if (title?.includes('Ready')) {
                return (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            }
            if (title?.includes('Error')) {
                return (
                    <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            }
            if (title?.includes('Disconnect')) {
                return (
                    <svg className="w-4 h-4 text-slate-700 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17L7 7" />
                    </svg>
                );
            }
            if (title?.includes('Map:')) {
                return (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                );
            }
            // INIT
            return (
                <svg className="w-4 h-4 text-blue-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            );
        }
        switch (type) {
            case 'low_battery':
                const isBatteryCritical = title?.includes('Critical') || title?.includes('Kritis');
                return (
                    <svg className={`w-4 h-4 ${isBatteryCritical ? 'text-rose-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                );
            case 'error':
                return (
                    <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'activity':
                return (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-4 h-4 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                );
        }
    };

    const getNotifBgColor = (type: SystemNotification['type'], title?: string) => {
        if (type === 'ws_traffic') {
            if (title?.includes('Ready')) return 'bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20';
            if (title?.includes('Error')) return 'bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20';
            if (title?.includes('Disconnect')) return 'bg-slate-100 dark:bg-slate-500/10 border border-slate-300 dark:border-slate-500/20';
            if (title?.includes('Map:')) return 'bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
            return 'bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20';
        }
        if (type === 'low_battery') {
            const isBatteryCritical = title?.includes('Critical') || title?.includes('Kritis');
            return isBatteryCritical 
                ? 'bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20'
                : 'bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20';
        }
        if (type === 'error') return 'bg-rose-100 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20';
        return 'bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20';
    };

    return (
        <div className="relative" ref={popupRef}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-lg hover:bg-sidebar transition-colors group"
                aria-label="Notifications"
            >
                <svg
                    className="w-5 h-5 text-txt-sec group-hover:text-txt-main transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>

                {/* Badge */}
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-lg shadow-rose-500/30 ">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Popup Panel */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 glass-panel rounded-xl border border-border-highlight shadow-2xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-border-base bg-sidebar/50">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-txt-main">
                                {dict.dashboard.notifications?.popup_title || 'Notifications'}
                            </h3>
                            <span className="text-[10px] text-txt-sec font-mono">
                                {notifications.length} {dict.dashboard.notifications?.items || 'items'}
                            </span>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="p-6 text-center">
                                <div className="w-5 h-5 border-2 border-txt-sec border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                <span className="text-xs text-txt-sec">{dict.common?.loading || 'Loading...'}</span>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-6 text-center">
                                <svg className="w-10 h-10 text-txt-sec/30 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                <p className="text-xs text-txt-sec">
                                    {dict.dashboard.notifications?.no_notifications || 'No new notifications'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border-base">
                                {notifications.map((notif) => {
                                    const isUnread = !notif.is_read && !readNotifIds.has(notif.id);
                                    return (
                                        <div
                                            key={notif.id}
                                            className={`px-4 py-3 hover:bg-card-bg transition-colors ${isUnread ? 'bg-primary-glow/30' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className="flex-shrink-0 mt-0.5">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getNotifBgColor(notif.type, notif.title)}`}>
                                                        {getNotificationIcon(notif.type, notif.title)}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-txt-main truncate">
                                                        {notif.title}
                                                    </p>
                                                    <p className="text-[11px] text-txt-sec mt-0.5 truncate">
                                                        {notif.message}
                                                    </p>
                                                    <p className="text-[10px] text-txt-sec/70 mt-1 font-mono">
                                                        {(() => {
                                                            const d = new Date(notif.created_at);
                                                            const now = new Date();
                                                            const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                                                            if (isToday) {
                                                                const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
                                                                const diffHrs = Math.floor(diffMins / 60);
                                                                let rel = 'just now';
                                                                if (diffMins > 0 && diffMins < 60) rel = `${diffMins}m ago`;
                                                                else if (diffHrs >= 1) rel = `${diffHrs}h ago`;
                                                                const tStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                return `${tStr} — ${rel}`;
                                                            }
                                                            return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
                                                        })()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="px-4 py-2 border-t border-border-base bg-sidebar/50">
                            <Link
                                href="/notifications"
                                onClick={() => setIsOpen(false)}
                                className="text-[11px] text-txt-accent hover:text-blue-700 dark:text-blue-400 transition-colors font-medium block w-full text-left"
                            >
                                {dict.dashboard.notifications?.view_all || 'View All Notifications →'}
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
