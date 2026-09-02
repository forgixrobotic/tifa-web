'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { parsePgm } from '@/lib/utils/pgmParser';
import { parseMapYaml, MapYamlMeta } from '@/lib/utils/yamlParser';
import { pixelToWorld, worldToPixel, Point2D } from '@/lib/utils/coordinateTransform';
import type { Goal } from '@/lib/types/database';

interface RobotPose {
    device_id: number;
    device_code: string;
    device_name?: string | null;
    x: number;
    y: number;
    yaw: number;
}

interface MapCanvasEditorProps {
    mapId: number;
    imageUrl: string;
    yamlUrl?: string;
    goals: Goal[];
    robotPoses?: RobotPose[];
    userRole?: string | null;
    onGoalCreated?: (newGoal: Goal) => void;
    onGoalSelected?: (goal: Goal) => void;
}

export default function MapCanvasEditor({
    mapId,
    imageUrl,
    yamlUrl,
    goals = [],
    robotPoses = [],
    userRole = 'operator',
    onGoalCreated,
    onGoalSelected,
}: MapCanvasEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Image & Meta State
    const [imgWidth, setImgWidth] = useState<number>(0);
    const [imgHeight, setImgHeight] = useState<number>(0);
    const [mapMeta, setMapMeta] = useState<MapYamlMeta>({
        image: 'map.pgm',
        resolution: 0.05,
        origin: [0, 0, 0],
        occupiedThresh: 0.65,
        freeThresh: 0.25,
        negate: 0,
    });
    const [imageLoaded, setImageLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Canvas Viewport State (Zoom & Pan)
    const [scale, setScale] = useState<number>(1); 
    const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    // Interactive Placement State
    const [isAddMode, setIsAddMode] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [showBackground, setShowBackground] = useState(false); // OFF by default per mentor request
    const [hoveredWorld, setHoveredWorld] = useState<Point2D | null>(null);
    const [pendingGoalPos, setPendingGoalPos] = useState<{ px: number; py: number; world: Point2D; yaw: number } | null>(null);
    const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

    // Form Modal for New Goal Placement
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalCode, setNewGoalCode] = useState('');
    const [newGoalType, setNewGoalType] = useState<string>('TABLE');
    const [newGoalYaw, setNewGoalYaw] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);

    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    // -------------------------------------------------------------
    // 1. Fetch & Decode PGM Map to Offscreen Canvas
    // -------------------------------------------------------------
    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const loadMapAssets = async () => {
            try {
                // 1. Fetch PGM Image
                const imageRes = await fetch(imageUrl);
                if (!imageRes.ok) throw new Error(`Failed to load map image (${imageRes.status})`);

                const buffer = await imageRes.arrayBuffer();

                // Create Offscreen Canvas for Base Map Layer
                const offscreen = document.createElement('canvas');
                const offCtx = offscreen.getContext('2d');
                if (!offCtx) throw new Error('Canvas 2D Context initialization failed');

                try {
                    // Try PGM decoder (P5 binary / P2 ascii)
                    const parsed = parsePgm(buffer);
                    offscreen.width = parsed.width;
                    offscreen.height = parsed.height;

                    const imgData = offCtx.createImageData(parsed.width, parsed.height);
                    imgData.data.set(parsed.pixels);
                    offCtx.putImageData(imgData, 0, 0);

                    if (isMounted) {
                        offscreenCanvasRef.current = offscreen;
                        setImgWidth(parsed.width);
                        setImgHeight(parsed.height);

                        const mainCanvas = canvasRef.current;
                        if (mainCanvas) {
                            mainCanvas.width = parsed.width;
                            mainCanvas.height = parsed.height;
                        }
                        setImageLoaded(true);
                    }
                } catch {
                    // Fallback to Image Blob for standard formats (PNG/JPG)
                    const blob = new Blob([buffer]);
                    const blobUrl = URL.createObjectURL(blob);
                    const img = new Image();
                    img.onload = () => {
                        if (isMounted) {
                            offscreen.width = img.width;
                            offscreen.height = img.height;
                            offCtx.drawImage(img, 0, 0);

                            offscreenCanvasRef.current = offscreen;
                            setImgWidth(img.width);
                            setImgHeight(img.height);

                            const mainCanvas = canvasRef.current;
                            if (mainCanvas) {
                                mainCanvas.width = img.width;
                                mainCanvas.height = img.height;
                            }
                            setImageLoaded(true);
                        }
                    };
                    img.src = blobUrl;
                }

                // 2. Fetch YAML Metadata
                if (yamlUrl) {
                    try {
                        const yamlRes = await fetch(yamlUrl);
                        if (yamlRes.ok) {
                            const yamlText = await yamlRes.text();
                            const parsedMeta = parseMapYaml(yamlText);
                            if (isMounted) setMapMeta(parsedMeta);
                        }
                    } catch {
                        // Keep default meta
                    }
                }
            } catch (err: unknown) {
                if (isMounted) setError(err instanceof Error ? err.message : 'Error loading map assets');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void loadMapAssets();
        return () => { isMounted = false; };
    }, [imageUrl, yamlUrl]);

    // -------------------------------------------------------------
    // 2. Render Loop (Clear -> Draw Base PGM -> Draw Grid -> Draw Overlays)
    // -------------------------------------------------------------
    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const offscreen = offscreenCanvasRef.current;
        if (!canvas || !offscreen || !imageLoaded || imgWidth === 0 || imgHeight === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Turn off smoothing for crisp ROS map pixels
        ctx.imageSmoothingEnabled = false;

        // 1. Clear Main Canvas
        ctx.clearRect(0, 0, imgWidth, imgHeight);

        // 2. Draw Base Map (PGM background) — OFF by default per mentor request
        if (showBackground) {
            ctx.drawImage(offscreen, 0, 0);
        } else {
            // Clean dark background
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, imgWidth, imgHeight);
        }

        // 3. Draw 1-Meter Grid Lines
        if (showGrid) {
            ctx.strokeStyle = showBackground ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.12)';
            ctx.lineWidth = 1;
            const gridSpacingPx = Math.round(1.0 / mapMeta.resolution); // 1.0m in pixels

            for (let x = 0; x < imgWidth; x += gridSpacingPx) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, imgHeight);
                ctx.stroke();
            }
            for (let y = 0; y < imgHeight; y += gridSpacingPx) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(imgWidth, y);
                ctx.stroke();
            }
        }

        // 4. Draw Waypoint / Goal Markers
        goals.forEach((goal) => {
            if (goal.x === null || goal.y === null) return;
            const { px, py } = worldToPixel(goal.x, goal.y, imgHeight, mapMeta.resolution, mapMeta.origin);

            const isSelected = selectedGoal?.goal_id === goal.goal_id;

            // Goal Pin Circle (Smaller)
            ctx.beginPath();
            ctx.arc(px, py, isSelected ? 6 : 4, 0, 2 * Math.PI);
            ctx.fillStyle = goal.goal_type === 'TABLE' ? '#3b82f6' :
                            goal.goal_type === 'CHARGE' ? '#eab308' :
                            goal.goal_type === 'HOME' ? '#22c55e' : '#a855f7';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Heading Arrow (Yaw)
            if (goal.yaw !== undefined && goal.yaw !== null) {
                const arrowLength = 12;
                const canvasYaw = -goal.yaw; // Canvas Y is inverted
                const endPx = px + arrowLength * Math.cos(canvasYaw);
                const endPy = py + arrowLength * Math.sin(canvasYaw);

                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(endPx, endPy);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Minimal Goal Label (No Box, Text Stroke Only)
            const label = goal.goal_name || goal.goal_code || `G${goal.goal_id}`;
            ctx.font = '600 10px sans-serif';
            const textWidth = ctx.measureText(label).width;

            ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText(label, px - textWidth / 2, py - 8);
            
            ctx.fillStyle = isSelected ? '#60a5fa' : '#ffffff';
            ctx.fillText(label, px - textWidth / 2, py - 8);
        });

        // 5. Draw Real-Time Robot Poses
        robotPoses.forEach((robot) => {
            const { px, py } = worldToPixel(robot.x, robot.y, imgHeight, mapMeta.resolution, mapMeta.origin);

            // Pulsing Outer Ring
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.fill();

            // Inner Circle
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, 2 * Math.PI);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Heading Line
            const headingLength = 20;
            const canvasYaw = -robot.yaw;
            const endPx = px + headingLength * Math.cos(canvasYaw);
            const endPy = py + headingLength * Math.sin(canvasYaw);

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endPx, endPy);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Label
            const rLabel = robot.device_name || robot.device_code;
            ctx.font = 'bold 10px sans-serif';
            const rWidth = ctx.measureText(rLabel).width;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.fillRect(px - rWidth / 2 - 3, py + 10, rWidth + 6, 13);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(rLabel, px - rWidth / 2, py + 20);
        });

        // 6. Draw Pending Goal Placement Pin
        if (pendingGoalPos) {
            const { px, py, yaw } = pendingGoalPos;

            ctx.beginPath();
            ctx.arc(px, py, 9, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            const canvasYaw = -yaw;
            const endPx = px + 18 * Math.cos(canvasYaw);
            const endPy = py + 18 * Math.sin(canvasYaw);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(endPx, endPy);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }, [imageLoaded, imgWidth, imgHeight, showGrid, showBackground, mapMeta, goals, robotPoses, selectedGoal, pendingGoalPos]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas]);

    // -------------------------------------------------------------
    // 3. User Mouse Interaction (Pan, Zoom, Goal Selection/Placement)
    // -------------------------------------------------------------
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 0 && !isAddMode) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const px = clientX * scaleX;
        const py = clientY * scaleY;

        const worldPos = pixelToWorld(px, py, imgHeight, mapMeta.resolution, mapMeta.origin);
        setHoveredWorld(worldPos);

        if (isDragging && !isAddMode) {
            setPanOffset({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isDragging) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const px = (clientX * canvas.width) / rect.width;
        const py = (clientY * canvas.height) / rect.height;

        const world = pixelToWorld(px, py, imgHeight, mapMeta.resolution, mapMeta.origin);

        if (isAddMode && isAdmin) {
            setPendingGoalPos({ px, py, world, yaw: newGoalYaw });
        } else {
            const clickedGoal = goals.find((g) => {
                if (g.x === null || g.y === null) return false;
                const pt = worldToPixel(g.x, g.y, imgHeight, mapMeta.resolution, mapMeta.origin);
                const dist = Math.hypot(pt.px - px, pt.py - py);
                return dist <= 15;
            });

            if (clickedGoal) {
                setSelectedGoal(clickedGoal);
                if (onGoalSelected) onGoalSelected(clickedGoal);
            } else {
                setSelectedGoal(null);
            }
        }
    };

    // Zoom Controls
    const zoomIn = () => setScale((s) => Math.min(s * 1.25, 5));
    const zoomOut = () => setScale((s) => Math.max(s / 1.25, 0.4));
    const resetZoom = () => {
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    };

    // Save Goal Handler
    const handleSaveNewGoal = async () => {
        if (!pendingGoalPos || !newGoalName.trim()) return;
        setIsSaving(true);

        try {
            const body = {
                mapId,
                goalName: newGoalName.trim(),
                goalCode: newGoalCode.trim() || newGoalName.trim().toUpperCase(),
                goalType: newGoalType,
                x: pendingGoalPos.world.x,
                y: pendingGoalPos.world.y,
                yaw: newGoalYaw,
            };

            const res = await fetch('/api/goals?action=create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (data.data) {
                if (onGoalCreated) onGoalCreated(data.data);
                setPendingGoalPos(null);
                setIsAddMode(false);
                setNewGoalName('');
                setNewGoalCode('');
            } else if (data.error) {
                alert(`Failed to create goal: ${data.error}`);
            }
        } catch (err: unknown) {
            alert(`Error creating goal: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative">
            {/* Toolbar Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ROS Map Viewer</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono">ID: {mapId}</span>
                    {hoveredWorld && (
                        <span className="text-xs font-mono text-slate-300 hidden sm:inline ml-2 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                            X: <span className="text-blue-400 font-bold">{hoveredWorld.x}</span>m, Y: <span className="text-blue-400 font-bold">{hoveredWorld.y}</span>m
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Background Toggle */}
                    <button
                        onClick={() => setShowBackground(!showBackground)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                            showBackground
                                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                        title="Toggle PGM Map Background"
                    >
                        {showBackground ? 'Map ON' : 'Map OFF'}
                    </button>

                    {/* Grid Toggle */}
                    <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                            showGrid
                                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                        title="Toggle 1m Grid Overlay"
                    >
                        Grid 1m
                    </button>

                    {/* Add Mode Toggle (ADMIN only) */}
                    {isAdmin && (
                        <button
                            onClick={() => {
                                setIsAddMode(!isAddMode);
                                if (!isAddMode) setPendingGoalPos(null);
                            }}
                            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                                isAddMode
                                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            {isAddMode ? 'Click Canvas to Place' : 'Add Goal'}
                        </button>
                    )}

                    {/* Zoom Buttons */}
                    <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 p-0.5">
                        <button onClick={zoomOut} className="px-2 py-1 text-slate-300 hover:text-white text-xs font-bold">-</button>
                        <span className="px-2 text-xs font-mono text-slate-400">{Math.round(scale * 100)}%</span>
                        <button onClick={zoomIn} className="px-2 py-1 text-slate-300 hover:text-white text-xs font-bold">+</button>
                        <button onClick={resetZoom} className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 border-l border-slate-700 ml-1">Reset</button>
                    </div>
                </div>
            </div>

            {/* Canvas Viewport Area */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden bg-slate-950 cursor-crosshair flex items-center justify-center min-h-[420px]"
            >
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 z-20 gap-3">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-medium text-slate-300">Decoding PGM Grayscale Map & ROS Metadata...</p>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-20 p-6 text-center">
                        <svg className="w-10 h-10 text-rose-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm font-semibold text-rose-400">{error}</p>
                    </div>
                )}

                <div
                    style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                        transformOrigin: 'center center',
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    }}
                    className="relative flex items-center justify-center"
                >
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onClick={handleCanvasClick}
                        className="rounded-lg shadow-2xl bg-slate-900 border border-slate-800"
                    />
                </div>
            </div>

            {/* Goal Placement Form Drawer (When Canvas Clicked in Add Mode) */}
            {pendingGoalPos && (
                <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-slate-900 border border-amber-500/50 rounded-xl p-4 shadow-2xl z-30 animate-in slide-in-from-bottom-3">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                        <h4 className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400 "></span>
                            New Waypoint Position
                        </h4>
                        <button onClick={() => setPendingGoalPos(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
                    </div>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2 rounded-lg text-slate-300 border border-slate-800">
                            <div>X: <span className="text-blue-400 font-bold">{pendingGoalPos.world.x} m</span></div>
                            <div>Y: <span className="text-blue-400 font-bold">{pendingGoalPos.world.y} m</span></div>
                        </div>

                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Goal Name *</label>
                            <input
                                value={newGoalName}
                                onChange={(e) => setNewGoalName(e.target.value)}
                                placeholder="e.g. Table 1"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Goal Code</label>
                                <input
                                    value={newGoalCode}
                                    onChange={(e) => setNewGoalCode(e.target.value)}
                                    placeholder="e.g. TB1"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Type</label>
                                <select
                                    value={newGoalType}
                                    onChange={(e) => setNewGoalType(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                                >
                                    <option value="TABLE">Table</option>
                                    <option value="CHARGE">Charge</option>
                                    <option value="HOME">Home</option>
                                    <option value="CUSTOM">Custom</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Yaw / Orientation (rad)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={newGoalYaw}
                                onChange={(e) => setNewGoalYaw(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500 outline-none"
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => setPendingGoalPos(null)}
                                className="flex-1 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNewGoal}
                                disabled={isSaving || !newGoalName.trim()}
                                className="flex-1 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Goal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
