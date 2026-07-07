'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import { getAllMaps, uploadMapFull, deleteMap, getDraftGoals, getGoalsByMap, createDestination as apiCreateGoal, updateDestination as apiUpdateGoal, deleteDestination as apiDeleteGoal, getMapFiles, getMapImageUrl, type Map, type Goal } from "@/lib/api";

type Category = {
    category_id: number | null;
    category_name: string;
    category_type: string;
    color: string;
    sort_order: number;
    is_active: number;
};

type Destination = {
    destination_id: number | null;
    category_id: number | null;
    destination_name: string;
    destination_code: string;
    x: number;
    y: number;
    yaw: number;
    zone: string;
    is_home: number;
};

// Component to render PGM images on a canvas
const PgmViewer = ({ url, alt }: { url: string; alt: string }) => {
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchAndRender = async () => {
            try {
                setLoading(true);
                setError(false);
                const res = await fetch(url);
                if (!res.ok) throw new Error('Fetch failed');
                
                const buffer = await res.arrayBuffer();
                const data = new Uint8Array(buffer);
                
                // Parse PGM
                let offset = 0;
                const skipWhitespaceAndComments = () => {
                    while (offset < data.length) {
                        while (offset < data.length && data[offset] <= 32) offset++;
                        if (offset < data.length && data[offset] === 35) { // '#'
                            while (offset < data.length && data[offset] !== 10) offset++;
                        } else {
                            break;
                        }
                    }
                };

                const readToken = () => {
                    skipWhitespaceAndComments();
                    let token = '';
                    while (offset < data.length && data[offset] > 32) {
                        token += String.fromCharCode(data[offset++]);
                    }
                    return token;
                };

                const magic = readToken();
                if (magic !== 'P5') {
                    // Try to fall back to normal image if it's not P5 (e.g. it was a PNG all along)
                    if (isMounted) setError(true);
                    return;
                }

                const width = parseInt(readToken(), 10);
                const height = parseInt(readToken(), 10);
                const maxVal = parseInt(readToken(), 10);

                if (offset < data.length && data[offset] <= 32) offset++; // skip single whitespace

                if (isNaN(width) || isNaN(height) || isNaN(maxVal)) {
                    if (isMounted) setError(true);
                    return;
                }

                const canvas = canvasRef.current;
                if (!canvas) return;
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                const imgData = ctx.createImageData(width, height);
                const pixels = imgData.data;

                let pIdx = 0;
                for (let i = 0; i < width * height; i++) {
                    if (offset >= data.length) break;
                    let val = data[offset++];
                    if (maxVal !== 255) val = Math.floor((val / maxVal) * 255);
                    const idx = pIdx * 4;
                    pixels[idx] = val;
                    pixels[idx + 1] = val;
                    pixels[idx + 2] = val;
                    pixels[idx + 3] = 255;
                    pIdx++;
                }

                ctx.putImageData(imgData, 0, 0);
                if (isMounted) setLoading(false);
            } catch (err) {
                console.error("Error rendering map:", err);
                if (isMounted) setError(true);
            }
        };

        fetchAndRender();

        return () => { isMounted = false; };
    }, [url]);

    if (error) {
        // Fallback to normal img tag which might trigger its own onError, or just show fallback UI
        return (
            <img 
                src={url} 
                alt={alt}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                }}
            />
        );
    }

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            <canvas 
                ref={canvasRef} 
                className={`max-w-full max-h-full object-contain rounded-lg shadow-lg bg-gray-200 dark:bg-gray-800 transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
                title={alt}
            />
        </div>
    );
};

export default function ManageMapsPage() {
    const { dict } = useLanguage();
    const [maps, setMaps] = useState<Map[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // List view expandable destinations
    const [expandedMapId, setExpandedMapId] = useState<number | null>(null);
    const [mapDestinations, setMapDestinations] = useState<Record<number, Goal[]>>({});
    const [loadingDestinations, setLoadingDestinations] = useState<Record<number, boolean>>({});

    // Map Viewer Modal State
    const [viewingMapId, setViewingMapId] = useState<number | null>(null);
    const [isMapViewerOpen, setIsMapViewerOpen] = useState(false);
    const [mapFiles, setMapFiles] = useState<any[]>([]);
    const [loadingMapImage, setLoadingMapImage] = useState(false);

    // Goal CRUD Modal State
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
    const [goalForm, setGoalForm] = useState({
        goal_name: "", goal_code: "", goal_type: "CUSTOM", x: 0, y: 0, yaw: 0
    });
    const [isSavingGoal, setIsSavingGoal] = useState(false);

    const loadMaps = async () => {
        setLoading(true);
        const { data, error: apiError } = await getAllMaps();
        if (apiError) {
            setError(apiError);
        } else {
            setMaps(data ?? []);
        }
        setLoading(false);
    };

    const toggleMapExpand = async (mapId: number) => {
        if (expandedMapId === mapId) {
            setExpandedMapId(null);
            return;
        }
        setExpandedMapId(mapId);
        
        if (!mapDestinations[mapId]) {
            setLoadingDestinations(prev => ({ ...prev, [mapId]: true }));
            const result = await getGoalsByMap(mapId);
            if (!result.error && result.data) {
                setMapDestinations(prev => ({ ...prev, [mapId]: result.data! }));
            }
            setLoadingDestinations(prev => ({ ...prev, [mapId]: false }));
        }
    };

    const openMapViewer = async (mapId: number) => {
        setViewingMapId(mapId);
        setIsMapViewerOpen(true);
        setLoadingMapImage(true);
        
        const result = await getMapFiles(mapId);
        if (result.data) {
            setMapFiles(result.data.files || []);
        }
        
        setLoadingMapImage(false);
    };

    const closeMapViewer = () => {
        setIsMapViewerOpen(false);
        setViewingMapId(null);
        setMapFiles([]);
    };

    const openAddGoalModal = () => {
        setEditingGoal(null);
        setGoalForm({ goal_name: "", goal_code: "", goal_type: "CUSTOM", x: 0, y: 0, yaw: 0 });
        setIsGoalModalOpen(true);
    };

    const openEditGoalModal = (goal: Goal) => {
        setEditingGoal(goal);
        setGoalForm({
            goal_name: goal.goal_name || "",
            goal_code: goal.goal_code || "",
            goal_type: goal.goal_type || "CUSTOM",
            x: goal.x ?? 0,
            y: goal.y ?? 0,
            yaw: goal.yaw ?? 0
        });
        setIsGoalModalOpen(true);
    };

    const closeGoalModal = () => {
        setIsGoalModalOpen(false);
        setEditingGoal(null);
    };

    const handleSaveGoal = async () => {
        if (!expandedMapId || !goalForm.goal_name) return;
        setIsSavingGoal(true);
        
        try {
            // Remap snake_case form fields to camelCase keys expected by the API route
            const apiPayload = {
                goalName: goalForm.goal_name,
                goalCode: goalForm.goal_code,
                goalType: goalForm.goal_type,
                x: goalForm.x,
                y: goalForm.y,
                yaw: goalForm.yaw,
            };

            if (editingGoal) {
                const res = await apiUpdateGoal({ ...apiPayload, goalId: editingGoal.goal_id });
                if (res.data) {
                    setMapDestinations(prev => ({
                        ...prev, [expandedMapId]: prev[expandedMapId].map(g => g.goal_id === editingGoal.goal_id ? res.data! : g)
                    }));
                } else if (res.error) {
                    setError(res.error);
                    setTimeout(() => setError(null), 3000);
                    setIsSavingGoal(false);
                    return;
                }
            } else {
                const res = await apiCreateGoal({ ...apiPayload, mapId: expandedMapId });
                if (res.data) {
                    setMapDestinations(prev => ({
                        ...prev, [expandedMapId]: [...(prev[expandedMapId] || []), res.data!]
                    }));
                } else if (res.error) {
                    setError(res.error);
                    setTimeout(() => setError(null), 3000);
                    setIsSavingGoal(false);
                    return;
                }
            }
            closeGoalModal();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to save goal");
            setTimeout(() => setError(null), 3000);
        }
        setIsSavingGoal(false);
    };

    const handleDeleteGoal = async (goalId: number, goalName: string) => {
        if (!expandedMapId || !confirm(`Are you sure you want to hard delete destination "${goalName}"?`)) return;
        try {
            const res = await apiDeleteGoal(goalId);
            if (!res.error) {
                setMapDestinations(prev => ({
                    ...prev, [expandedMapId]: prev[expandedMapId].filter(g => g.goal_id !== goalId)
                }));
            } else {
                setError(res.error);
                setTimeout(() => setError(null), 3000);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to delete goal");
            setTimeout(() => setError(null), 3000);
        }
    };

    const handleDeleteMap = async (mapId: number, mapName: string) => {
        if (!confirm(`Are you sure you want to delete map "${mapName}"? This will also delete all associated destinations.`)) return;
        
        try {
            const res = await deleteMap(mapId);
            if (res.error) {
                setError(res.error);
            } else {
                setSuccess(`Map "${mapName}" deleted successfully.`);
                setExpandedMapId(null);
                await loadMaps();
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to delete map");
        }
        setTimeout(() => setSuccess(null), 3000);
        setTimeout(() => setError(null), 3000);
    };

    useEffect(() => {
        void loadMaps();
    }, []);


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/dashboard" className="text-txt-sec hover:text-txt-main transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-bold text-txt-main tracking-tight">
                            {dict.dashboard.maps?.title || "Manage Maps"}
                        </h1>
                    </div>
                    <p className="text-sm text-txt-sec">
                        {dict.dashboard.maps?.subtitle || "Administrative controls for maps and destinations"}
                    </p>
                </div>
            </div>

            {/* Success/Error Alerts */}
            {success && (
                <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-900/50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <p className="text-sm text-emerald-200">{success}</p>
                </div>
            )}
            
            {error && (
                <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            {/* MAP LIST VIEW */}
            <div className="glass-panel rounded-xl overflow-x-auto border border-border-base w-full">
                <table className="min-w-full divide-y divide-border-base whitespace-nowrap">
                    <thead className="bg-black">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase">{dict.dashboard.maps?.map_name || "Map Name"}</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase">{dict.dashboard.maps?.map_floor || "Floor"}</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase">Created</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold text-txt-accent uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base bg-card-bg">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-txt-sec">
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-txt-accent border-t-transparent rounded-full animate-spin"></div>
                                        Loading maps...
                                    </div>
                                </td>
                            </tr>
                        ) : maps.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-txt-sec">
                                    {dict.dashboard.maps?.no_maps || "No maps uploaded yet."}
                                </td>
                            </tr>
                        ) : (
                            maps.map(map => (
                                <React.Fragment key={map.map_id}>
                                    <tr 
                                        className={`hover:bg-[#1e293b]/50 transition-colors group cursor-pointer ${expandedMapId === map.map_id ? 'bg-[#1e293b]/30' : ''}`}
                                        onClick={() => toggleMapExpand(map.map_id)}
                                    >
                                        <td className="px-6 py-4 font-medium text-txt-main">
                                            <div className="flex items-center gap-3">
                                                <svg className={`w-4 h-4 transition-transform ${expandedMapId === map.map_id ? 'rotate-90 text-blue-700 dark:text-blue-400' : 'text-txt-sec'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                {map.map_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-txt-sec">{map.map_floor || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-txt-sec">{new Date(map.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                className="p-2 mr-2 text-txt-sec hover:text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:bg-blue-500/10 rounded-lg transition-colors" 
                                                title={(dict.dashboard.maps as any)?.see_map || "See Map"}
                                                onClick={(e) => { e.stopPropagation(); openMapViewer(map.map_id); }}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </button>
                                            <button 
                                                className="p-2 text-txt-sec hover:text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:bg-rose-500/10 rounded-lg transition-colors" 
                                                title={dict.dashboard.maps?.delete_map || "Delete"}
                                                onClick={(e) => { e.stopPropagation(); handleDeleteMap(map.map_id, map.map_name); }}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedMapId === map.map_id && (
                                        <tr>
                                            <td colSpan={4} className="p-0 border-b-0 border-t border-border-base/50 bg-[#0f172a]/30 relative">
                                                {/* Vertical indicator line */}
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                                                
                                                <div className="p-6 overflow-hidden animate-in slide-in-from-top-2 fade-in">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <svg className="w-4 h-4 text-blue-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                            <h4 className="text-sm font-semibold text-txt-main flex-1">Destinations on this map</h4>
                                                            {mapDestinations[map.map_id] && !loadingDestinations[map.map_id] && (
                                                                <span className="text-[10px] font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full mr-2">
                                                                    {mapDestinations[map.map_id].length} Total
                                                                </span>
                                                            )}
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); openAddGoalModal(); }}
                                                                className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md transition border border-blue-300 dark:border-blue-500/30 flex items-center gap-1.5 shadow-lg shadow-blue-900/20"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                                Add Destination
                                                            </button>
                                                        </div>
                                                    
                                                    {loadingDestinations[map.map_id] ? (
                                                        <div className="flex justify-center p-6">
                                                            <div className="flex items-center gap-3 text-txt-sec text-sm">
                                                                <div className="w-5 h-5 border-2 border-txt-accent border-t-transparent rounded-full animate-spin"></div>
                                                                Fetching destinations from database...
                                                            </div>
                                                        </div>
                                                    ) : mapDestinations[map.map_id] && mapDestinations[map.map_id].length > 0 ? (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                                {mapDestinations[map.map_id].map(dest => (
                                                                    <div key={dest.goal_id} className="bg-card-bg/80 border border-border-base p-3 rounded-xl flex flex-col hover:border-blue-300 dark:border-blue-500/30 transition-colors shadow-sm relative group">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <span className="text-xs font-bold text-txt-main truncate pr-2 flex-1" title={dest.goal_name || undefined}>{dest.goal_name}</span>
                                                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-card-bg/95 backdrop-blur-sm px-1.5 py-1 rounded-lg shadow-lg border border-border-base z-10">
                                                                                <button onClick={(e) => { e.stopPropagation(); openEditGoalModal(dest); }} className="text-txt-sec hover:text-blue-700 dark:text-blue-400 p-1 rounded hover:bg-blue-100 dark:bg-blue-500/10 transition-colors" title="Edit"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                                                                <div className="w-px h-3 bg-border-base"></div>
                                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteGoal(dest.goal_id, dest.goal_name || 'Dest'); }} className="text-txt-sec hover:text-rose-700 dark:text-rose-400 p-1 rounded hover:bg-rose-100 dark:bg-rose-500/10 transition-colors" title="Delete"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                                            </div>
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-mono whitespace-nowrap">{dest.goal_code || dest.goal_name}</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-txt-sec font-mono mt-auto pt-2.5 border-t border-border-base/50">
                                                                            <div className="flex justify-between bg-black/20 px-1.5 py-0.5 rounded"><span className="text-txt-main/40 uppercase text-[9px] mt-0.5">X</span><span>{(dest.x ?? 0).toFixed(2)}</span></div>
                                                                            <div className="flex justify-between bg-black/20 px-1.5 py-0.5 rounded"><span className="text-txt-main/40 uppercase text-[9px] mt-0.5">Y</span><span>{(dest.y ?? 0).toFixed(2)}</span></div>
                                                                            <div className="flex justify-between bg-black/20 px-1.5 py-0.5 rounded"><span className="text-txt-main/40 uppercase text-[9px] mt-0.5">Yaw</span><span>{(dest.yaw ?? 0).toFixed(2)}</span></div>
                                                                            <div className="flex justify-between bg-black/20 px-1.5 py-0.5 rounded capitalize"><span className="text-txt-main/40 uppercase text-[9px] mt-0.5">Type</span><span className="truncate max-w-[50px]" title={dest.goal_type || undefined}>{dest.goal_type?.toLowerCase() || 'custom'}</span></div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="bg-card-bg/50 border border-dashed border-border-base rounded-xl p-8 text-center">
                                                                <svg className="w-8 h-8 text-txt-sec/50 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                <p className="text-xs text-txt-sec font-medium">No destinations registered on this map.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

            {/* ===== GOAL CRUD MODAL ===== */}
            {isGoalModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeGoalModal}>
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    
                    {/* Modal Panel */}
                    <div 
                        className="relative bg-[#0f172a] border border-border-base rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in zoom-in-95 fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${editingGoal ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400'}`}>
                                    {editingGoal ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-txt-main">{editingGoal ? 'Edit Destination' : 'New Destination'}</h3>
                                    <p className="text-[11px] text-txt-sec">Map ID: {expandedMapId}</p>
                                </div>
                            </div>
                            <button onClick={closeGoalModal} className="text-txt-sec hover:text-txt-main p-1.5 rounded-lg hover:bg-white/5 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-txt-sec mb-1.5 block">Destination Name <span className="text-rose-700 dark:text-rose-400">*</span></label>
                                    <input 
                                        value={goalForm.goal_name} 
                                        onChange={e => setGoalForm(f => ({...f, goal_name: e.target.value}))} 
                                        placeholder="e.g. Table 1"
                                        className="input-dark w-full px-3 py-2.5 rounded-lg text-sm border border-border-base focus:border-blue-400 dark:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-txt-sec mb-1.5 block">Goal Code</label>
                                    <input 
                                        value={goalForm.goal_code} 
                                        onChange={e => setGoalForm(f => ({...f, goal_code: e.target.value}))} 
                                        placeholder="e.g. TB1"
                                        className="input-dark w-full px-3 py-2.5 rounded-lg text-sm border border-border-base focus:border-blue-400 dark:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition outline-none font-mono" 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-txt-sec mb-1.5 block">Type / Category</label>
                                <select 
                                    value={goalForm.goal_type} 
                                    onChange={e => setGoalForm(f => ({...f, goal_type: e.target.value}))}
                                    className="input-dark w-full px-3 py-2.5 rounded-lg text-sm border border-border-base focus:border-blue-400 dark:border-blue-500/50 transition outline-none"
                                >
                                    <option value="CUSTOM">Custom</option>
                                    <option value="TABLE">Table</option>
                                    <option value="CHARGE">Charging Station</option>
                                    <option value="HOME">Home Base</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-txt-sec mb-1.5 block">X Coordinate</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={goalForm.x} 
                                        onChange={e => setGoalForm(f => ({...f, x: parseFloat(e.target.value) || 0}))} 
                                        className="input-dark w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-border-base focus:border-blue-400 dark:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-txt-sec mb-1.5 block">Y Coordinate</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={goalForm.y} 
                                        onChange={e => setGoalForm(f => ({...f, y: parseFloat(e.target.value) || 0}))} 
                                        className="input-dark w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-border-base focus:border-blue-400 dark:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-txt-sec mb-1.5 block">Yaw (°)</label>
                                    <input 
                                        type="number" step="0.01"
                                        value={goalForm.yaw} 
                                        onChange={e => setGoalForm(f => ({...f, yaw: parseFloat(e.target.value) || 0}))} 
                                        className="input-dark w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-border-base focus:border-blue-400 dark:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition outline-none" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-base bg-black/20 rounded-b-2xl">
                            <button 
                                onClick={closeGoalModal} 
                                className="px-4 py-2 text-sm font-medium text-txt-sec hover:text-txt-main rounded-lg hover:bg-white/5 transition"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveGoal}
                                disabled={isSavingGoal || !goalForm.goal_name}
                                className={`px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition shadow-lg ${
                                    editingGoal 
                                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20 disabled:bg-amber-600/50' 
                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20 disabled:bg-blue-600/50'
                                } disabled:cursor-not-allowed`}
                            >
                                {isSavingGoal && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                {isSavingGoal ? 'Saving...' : (editingGoal ? 'Update Destination' : 'Create Destination')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ===== MAP VIEWER MODAL ===== */}
            {isMapViewerOpen && viewingMapId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeMapViewer}>
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    
                    {/* Modal Panel */}
                    <div 
                        className="relative bg-[#0f172a] border border-border-base rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] mx-4 flex flex-col animate-in zoom-in-95 fade-in duration-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border-base bg-[#1e293b]/50">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-txt-main">Map Viewer</h3>
                                    <p className="text-[11px] text-txt-sec">Map ID: {viewingMapId}</p>
                                </div>
                            </div>
                            <button onClick={closeMapViewer} className="text-txt-sec hover:text-txt-main p-1.5 rounded-lg hover:bg-white/5 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                            {/* Left: Image Viewer */}
                            <div className="flex-1 bg-black/40 flex items-center justify-center p-6 relative min-h-[300px] border-r border-border-base">
                                {loadingMapImage ? (
                                    <div className="flex flex-col items-center gap-3 text-txt-sec">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-sm">Loading map details...</p>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center relative group">
                                        {/* Render PGM to Canvas or fallback to Image */}
                                        <PgmViewer 
                                            url={getMapImageUrl(viewingMapId)} 
                                            alt={`Map ${viewingMapId}`} 
                                        />
                                        <div id="img-fallback" className="hidden flex-col items-center justify-center text-center p-6 border-2 border-dashed border-border-base rounded-xl bg-card-bg/50 mt-4 absolute inset-0 m-auto h-fit w-fit">
                                            <svg className="w-12 h-12 text-txt-sec/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            <p className="text-sm font-medium text-txt-main">Image Preview Unavailable</p>
                                            <p className="text-xs text-txt-sec mt-1 max-w-[250px]">The map file might be in a format (like PGM) that your browser cannot display directly, or the file is not accessible on the server.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right: File Metadata */}
                            <div className="w-full md:w-80 bg-card-bg overflow-y-auto p-5">
                                <h4 className="text-sm font-bold text-txt-main mb-4 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Map Files Metadata
                                </h4>
                                
                                {loadingMapImage ? (
                                    <div className="space-y-4">
                                        {[1, 2].map(i => (
                                            <div key={i} className="animate-pulse flex flex-col gap-2 p-3 bg-[#1e293b]/30 rounded-lg border border-border-base/50">
                                                <div className="h-4 bg-border-base rounded w-3/4"></div>
                                                <div className="h-3 bg-border-base rounded w-1/2"></div>
                                            </div>
                                        ))}
                                    </div>
                                ) : mapFiles.length > 0 ? (
                                    <div className="space-y-3">
                                        {mapFiles.map((file, idx) => (
                                            <div key={idx} className="p-3 bg-[#1e293b]/40 border border-border-base rounded-xl">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="font-mono text-xs font-bold text-blue-400 break-all pr-2">{file.file_name}</div>
                                                    <div className="text-[10px] font-medium bg-black/30 px-1.5 py-0.5 rounded text-txt-sec uppercase">{file.file_type}</div>
                                                </div>
                                                <div className="text-[11px] text-txt-sec mb-2">
                                                    Size: {(file.file_size / 1024).toFixed(1)} KB
                                                </div>
                                                
                                                {file.metadata && Object.keys(file.metadata).length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-border-base/50">
                                                        <div className="text-[10px] uppercase text-txt-sec font-semibold mb-1.5">YAML Data</div>
                                                        <div className="grid grid-cols-1 gap-1">
                                                            {Object.entries(file.metadata).map(([key, val]) => (
                                                                <div key={key} className="flex justify-between text-[11px]">
                                                                    <span className="text-txt-sec/80 capitalize">{key.replace(/_/g, ' ')}</span>
                                                                    <span className="font-mono text-txt-main max-w-[120px] truncate" title={String(val)}>{String(val)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center p-6 border border-dashed border-border-base rounded-xl text-txt-sec">
                                        <p className="text-sm">No files associated with this map.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
