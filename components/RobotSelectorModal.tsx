"use client";

import { useState, useRef, useEffect } from "react";
import type { GroupedRobotWithStatus } from "@/lib/api";
import { BatteryIcon } from "@/components/BatteryIcon";

interface RobotSelectorModalProps {
    selectedGroupId: string | null;
    groupedRobots: GroupedRobotWithStatus[];
    activeCount: number;
    onSelect: (groupId: string | null) => void;
    allRobotsLabel: string;
    selectRobotLabel: string;
    activeCountLabel: string;
}

export default function RobotSelectorModal({
    selectedGroupId,
    groupedRobots,
    activeCount,
    onSelect,
    allRobotsLabel,
    selectRobotLabel,
    activeCountLabel,
}: RobotSelectorModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const modalRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Get selected robot display name
    const selectedRobot = selectedGroupId
        ? groupedRobots.find(g => g.groupId === selectedGroupId)
        : null;
    const displayName = selectedRobot?.displayName || allRobotsLabel;

    // Filter robots based on search
    const filteredRobots = groupedRobots.filter(robot =>
        robot.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        robot.rbDevice?.device_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        robot.uiDevice?.device_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Separate online and offline robots
    const onlineRobots = filteredRobots.filter(r => r.isOnline);
    const offlineRobots = filteredRobots.filter(r => !r.isOnline);

    // Close modal when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                modalRef.current &&
                !modalRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }

        return () => {
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen]);

    const handleSelect = (groupId: string | null) => {
        onSelect(groupId);
        setIsOpen(false);
        setSearchQuery("");
    };

    // Get battery color based on level
    const getBatteryColor = (battery: number | null) => {
        if (battery === null) return "text-slate-700 dark:text-slate-400";
        if (battery <= 30) return "text-rose-700 dark:text-rose-400";
        if (battery <= 60) return "text-amber-700 dark:text-amber-400";
        return "text-emerald-700 dark:text-emerald-400";
    };

    const getBatteryBg = (battery: number | null) => {
        if (battery === null) return "bg-slate-100 dark:bg-slate-500/10";
        if (battery <= 30) return "bg-rose-100 dark:bg-rose-500/10";
        if (battery <= 60) return "bg-amber-100 dark:bg-amber-500/10";
        return "bg-emerald-100 dark:bg-emerald-500/10";
    };

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="group flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border-base bg-gradient-to-r from-sidebar to-card-bg hover:from-card-bg hover:to-sidebar hover:border-border-highlight transition-all duration-300 min-w-[220px] shadow-lg hover:shadow-xl"
            >
                {/* Robot Icon with animated ring */}
                <div className="relative">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-300 dark:border-blue-500/30 group-hover:border-blue-400/50 transition-colors">
                        <svg className="w-5 h-5 text-blue-700 dark:text-blue-400 group-hover:text-blue-700 dark:text-blue-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                    </div>
                    {/* Pulse indicator for active selection */}
                    {selectedGroupId && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-sidebar " />
                    )}
                </div>

                {/* Selected Robot Info */}
                <div className="flex-1 text-left">
                    <span className="block text-[10px] uppercase tracking-wider text-txt-sec font-medium">
                        {selectRobotLabel}
                    </span>
                    <span className="block text-sm font-semibold text-txt-main truncate group-hover:text-blue-700 dark:text-blue-400 transition-colors">
                        {displayName}
                    </span>
                </div>

                {/* Dropdown Arrow */}
                <svg
                    className={`w-4 h-4 text-txt-sec transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Active Count Badge */}
            <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-[10px] text-white font-bold shadow-lg shadow-emerald-500/30">
                {activeCount} {activeCountLabel}
            </div>

            {/* Modal Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" />

                    {/* Modal */}
                    <div
                        ref={modalRef}
                        className="absolute top-full left-0 md:left-auto md:right-0 mt-3 w-[300px] sm:w-[360px] max-w-[90vw] max-h-[70vh] flex flex-col bg-gradient-to-br from-sidebar via-card-bg to-sidebar rounded-2xl border border-border-base shadow-2xl shadow-black/30 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
                    >
                        {/* Header */}
                        <div className="px-4 py-4 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border-b border-border-base">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-txt-main flex items-center gap-2">
                                    <span className="h-6 w-6 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-blue-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                        </svg>
                                    </span>
                                    Select Robot
                                </h3>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-txt-sec hover:text-txt-main transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search robots..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-sidebar/80 border border-border-base text-sm text-txt-main placeholder:text-txt-sec/60 focus:outline-none focus:border-blue-400 dark:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                        </div>

                        {/* Robot List */}
                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                            {/* All Robots Option */}
                            <button
                                onClick={() => handleSelect(null)}
                                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/10 transition-all border-b border-border-base/50 ${selectedGroupId === null ? 'bg-gradient-to-r from-blue-500/15 to-purple-500/15' : ''
                                    }`}
                            >
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-300 dark:border-blue-500/30">
                                    <svg className="w-5 h-5 text-blue-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </div>
                                <div className="flex-1 text-left">
                                    <span className="block text-sm font-semibold text-txt-main">{allRobotsLabel}</span>
                                    <span className="block text-[11px] text-txt-sec">{groupedRobots.length} robots total</span>
                                </div>
                                {selectedGroupId === null && (
                                    <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                )}
                            </button>

                            {/* Online Robots Section */}
                            {onlineRobots.length > 0 && (
                                <div>
                                    <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/5 border-b border-border-base/50">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 " />
                                            Online ({onlineRobots.length})
                                        </span>
                                    </div>
                                    {onlineRobots.map((robot) => (
                                        <button
                                            key={robot.groupId}
                                            onClick={() => handleSelect(robot.groupId)}
                                            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-teal-500/10 transition-all group ${selectedGroupId === robot.groupId ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15' : ''
                                                }`}
                                        >
                                            {/* Robot Avatar */}
                                            <div className="relative">
                                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-300 dark:border-emerald-500/30 group-hover:border-emerald-400/50 transition-colors">
                                                    <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                                    </svg>
                                                </div>
                                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-sidebar" />
                                            </div>

                                            {/* Robot Info */}
                                            <div className="flex-1 text-left min-w-0">
                                                <span className="block text-sm font-semibold text-txt-main truncate group-hover:text-emerald-700 dark:text-emerald-400 transition-colors">
                                                    {robot.displayName}
                                                </span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {robot.rbDevice && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 font-mono font-medium">
                                                            {robot.rbDevice.device_code}
                                                        </span>
                                                    )}
                                                    {robot.uiDevice && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 font-mono font-medium">
                                                            UI
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Battery Level */}
                                            {robot.battery !== null && (
                                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${getBatteryBg(robot.battery)}`}>
                                                    <BatteryIcon level={robot.battery} className={`w-4 h-4 ${getBatteryColor(robot.battery)}`} />
                                                    <span className={`text-xs font-bold ${getBatteryColor(robot.battery)}`}>
                                                        {robot.battery}%
                                                    </span>
                                                </div>
                                            )}

                                            {/* Selected Checkmark */}
                                            {selectedGroupId === robot.groupId && (
                                                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Offline Robots Section */}
                            {offlineRobots.length > 0 && (
                                <div>
                                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-500/5 border-b border-border-base/50">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-slate-500" />
                                            Offline ({offlineRobots.length})
                                        </span>
                                    </div>
                                    {offlineRobots.map((robot) => (
                                        <button
                                            key={robot.groupId}
                                            onClick={() => handleSelect(robot.groupId)}
                                            className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-100 dark:bg-slate-500/10 transition-all group ${selectedGroupId === robot.groupId ? 'bg-slate-100 dark:bg-slate-500/15' : ''
                                                }`}
                                        >
                                            {/* Robot Avatar */}
                                            <div className="relative">
                                                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-500/10 flex items-center justify-center border border-slate-300 dark:border-slate-500/20 group-hover:border-slate-400/30 transition-colors">
                                                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                                    </svg>
                                                </div>
                                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-slate-500 border-2 border-sidebar" />
                                            </div>

                                            {/* Robot Info */}
                                            <div className="flex-1 text-left min-w-0">
                                                <span className="block text-sm font-medium text-slate-700 dark:text-slate-400 truncate group-hover:text-slate-700 dark:text-slate-300 transition-colors">
                                                    {robot.displayName}
                                                </span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {robot.rbDevice && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-500/10 text-slate-500 font-mono">
                                                            {robot.rbDevice.device_code}
                                                        </span>
                                                    )}
                                                    {robot.uiDevice && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-500/10 text-slate-500 font-mono">
                                                            UI
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Selected Checkmark */}
                                            {selectedGroupId === robot.groupId && (
                                                <div className="h-6 w-6 rounded-full bg-slate-500 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* No Results */}
                            {filteredRobots.length === 0 && searchQuery && (
                                <div className="px-4 py-8 text-center">
                                    <svg className="w-12 h-12 mx-auto text-txt-sec/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm text-txt-sec">No robots found for &quot;{searchQuery}&quot;</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 bg-gradient-to-r from-sidebar to-card-bg border-t border-border-base mt-auto">
                            <div className="flex items-center justify-between text-[10px] text-txt-sec">
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                    {onlineRobots.length} online
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                                    {offlineRobots.length} offline
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slide-in-from-top-2 {
          from { transform: translateY(-8px); }
          to { transform: translateY(0); }
        }
        
        .animate-in {
          animation: fade-in 0.2s ease-out, slide-in-from-top-2 0.2s ease-out;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
      `}</style>
        </div>
    );
}
