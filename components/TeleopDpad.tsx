"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { sendTeleopCommand, sendTeleopDoneCommand, sendMappingCommand, sendTalkCommand } from "@/lib/client-api";
import { useLanguage } from "@/components/LanguageProvider";
import { getSessionUiId } from "@/lib/sessionId";
import type { GroupedRobotWithStatus } from "@/lib/api";

// ============================================
// TYPES
// ============================================

type Direction = "forward" | "backward" | "left" | "right" | "forward_left" | "forward_right" | "backward_left" | "backward_right" | null;

type Props = {
    selectedGroup: GroupedRobotWithStatus;
    onDone: () => void;
};

// ============================================
// VELOCITY HELPERS
// ============================================

// Speed levels as per PM: "S" (Slow), "F" (Fast), "VF" (Very Fast)
type SpeedLevel = "S" | "F" | "VF";

const SPEED_CONFIG: Record<SpeedLevel, { linear: number; angular: number }> = {
    S: { linear: 0.2, angular: 0.35 },
    F: { linear: 0.4, angular: 0.7 },
    VF: { linear: 0.6, angular: 1.0 },
};

// Acceleration / Deceleration ramp steps (fraction of target speed)
// 4 steps: 25% → 50% → 75% → 100%
const ACCEL_STEPS = [0.25, 0.5, 0.75, 1.0];
// Deceleration: 75% → 50% → 25% → 0% (reverse ramp before full stop)
const DECEL_STEPS = [0.75, 0.5, 0.25, 0];
// Time between each ramp step (ms)
const RAMP_INTERVAL_MS = 150;

/**
 * Get the velocity vector for a given direction at a specific fraction of the target speed.
 * @param direction - The movement direction
 * @param speedLevel - The selected speed tier (S/F/VF)
 * @param fraction - 0..1 fraction of target speed (used for accel/decel ramping)
 */
function getVelocity(direction: Direction, speedLevel: SpeedLevel, fraction: number = 1.0) {
    const linear = { x: 0, y: 0, z: 0 };
    const angular = { x: 0, y: 0, z: 0 };
    const cfg = SPEED_CONFIG[speedLevel];
    const lin = cfg.linear * fraction;
    const ang = cfg.angular * fraction;

    switch (direction) {
        case "forward":
            linear.x = lin;
            break;
        case "backward":
            linear.x = -lin;
            break;
        case "left":
            angular.z = ang;
            break;
        case "right":
            angular.z = -ang;
            break;
        case "forward_left":
            linear.x = lin;
            angular.z = ang;
            break;
        case "forward_right":
            linear.x = lin;
            angular.z = -ang;
            break;
        case "backward_left":
            linear.x = -lin;
            angular.z = ang;
            break;
        case "backward_right":
            linear.x = -lin;
            angular.z = -ang;
            break;
    }

    return { linear, angular };
}

// ============================================
// COMPONENT
// ============================================

export default function TeleopDpad({ selectedGroup, onDone }: Props) {
    const { dict } = useLanguage();
    const t = dict.dashboard.teleop;

    const [activeDirection, setActiveDirection] = useState<Direction>(null);
    const [speedLevel, setSpeedLevel] = useState<SpeedLevel>("S");
    const [lastSendStatus, setLastSendStatus] = useState<"idle" | "ok" | "error">("idle");
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isPressingRef = useRef(false);
    const hasShownOfflineWarningRef = useRef(false);

    // Acceleration / Deceleration state
    const [accelPhase, setAccelPhase] = useState<number>(0); // 0..ACCEL_STEPS.length (0 = stopped)
    const accelRampRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const decelRampRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentAccelStepRef = useRef<number>(0); // tracks current step index during ramp
    const isDeceleratingRef = useRef(false);

    const robotId = selectedGroup.rbDevice?.device_code ?? `RB${selectedGroup.groupId}`;
    const originId = getSessionUiId();

    // Live Mapping State
    const [isMapping, setIsMapping] = useState(false);
    const [isMappingDone, setIsMappingDone] = useState(false); // true after save map succeeds

    const [showFlaggingPrompt, setShowFlaggingPrompt] = useState(false);
    const [flagDestName, setFlagDestName] = useState("");
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [showSaveMapPrompt, setShowSaveMapPrompt] = useState(false);
    const [mapName, setMapName] = useState("");
    const [mapCategory, setMapCategory] = useState("laboratorium");
    const [mapCategoryType, setMapCategoryType] = useState("custom");
    const [isWaitingForSaveConfirm, setIsWaitingForSaveConfirm] = useState(false);
    const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

    // Voice / Talk State
    const [isTalkActive, setIsTalkActive] = useState(false);
    const [isTalkingLoading, setIsTalkingLoading] = useState(false);

    // Toast auto-dismiss
    useEffect(() => {
        if (!toast) return;
        const duration = toast.type === "warning" ? 6000 : 3000;
        const timer = setTimeout(() => setToast(null), duration);
        return () => clearTimeout(timer);
    }, [toast]);

    // Poll Voice Control Status
    useEffect(() => {
        const fetchTalkStatus = async () => {
            try {
                const res = await fetch('/api/robot-control?action=talk-status');
                if (res.ok) {
                    const data = await res.json();
                    if (typeof data.listening === 'boolean') {
                        setIsTalkActive(data.listening);
                    }
                }
            } catch {
                // Ignore silent errors
            }
        };

        // Poll every 1 second
        const interval = setInterval(fetchTalkStatus, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleStartMapping = async () => {
        try {
            const result = await sendMappingCommand({
                code: 'MAPPING_START',
                data: {
                    robot_id: robotId,
                    ui_id: 'TFWB1',
                    status: true,
                    is_auto: false,
                    timestamp: new Date().toISOString()
                }
            });
            if (result.error) {
                setToast({ type: "error", message: result.error });
            } else if (result.data && (result.data as Record<string, unknown>).ws_error) {
                setToast({ type: "success", message: "Mapping queued (WS Offline)" });
                setIsMapping(true);
            } else {
                setToast({ type: "success", message: "Mapping started!" });
                setIsMapping(true);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((result as any).robot_may_be_offline) {
                    setTimeout(() => {
                        setToast({ type: "warning", message: `⚠️ Robot mungkin tidak aktif. Perintah tetap dikirim.` });
                    }, 500);
                }
            }
        } catch {
            setToast({ type: "error", message: "Failed to start mapping" });
        }
    };

    const handleSaveMapping = async () => {
        if (!mapName) return;
        const sanitizedMapName = mapName.trim().replace(/\s+/g, '_');
        setIsWaitingForSaveConfirm(true);
        try {
            const result = await sendMappingCommand({
                code: 'MAPPING_SAVE',
                data: {
                    robot_id: robotId,
                    ui_id: 'TFWB1',
                    status: true,
                    is_auto: false,
                    map_name: sanitizedMapName,
                    category: mapCategory,
                    category_type: mapCategoryType
                }
            });

            if (result.error) {
                setToast({ type: "error", message: result.error });
            } else {
                setToast({ type: "success", message: `Map "${mapName}" saved! Live mapping complete.` });
                setIsMapping(false);
                setIsMappingDone(true);
                setShowSaveMapPrompt(false);
                setMapName("");

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((result as any).robot_may_be_offline) {
                    setTimeout(() => {
                        setToast({ type: "warning", message: `⚠️ Robot mungkin tidak aktif. Perintah tetap dikirim.` });
                    }, 500);
                }
            }
        } catch {
            setToast({ type: "error", message: "Failed to save mapping" });
        } finally {
            setIsWaitingForSaveConfirm(false);
        }
    };

    const handleStopMapping = async () => {
        try {
            const result = await sendMappingCommand({
                code: 'MAPPING_STOP',
                data: {
                    robot_id: robotId,
                    ui_id: 'TFWB1',
                    status: false,
                    is_auto: false,
                }
            });
            setIsMapping(false);
            setToast({ type: "success", message: "Mapping canceled" });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((result as any).robot_may_be_offline) {
                setTimeout(() => {
                    setToast({ type: "warning", message: `⚠️ Robot mungkin tidak aktif. Perintah tetap dikirim.` });
                }, 500);
            }
        } catch {
            setToast({ type: "error", message: "Failed to stop mapping" });
        }
    };

    const submitFlaggingCord = async () => {
        if (!flagDestName) {
            setToast({ type: "error", message: "Please enter a destination name" });
            return;
        }
        if (!selectedGroup.rbDevice?.device_id) {
            setToast({ type: "error", message: "Robot device not found. Cannot flag coordinate." });
            return;
        }
        setIsSavingDraft(true);
        try {
            // Notify Robot via WS so it knows what physical coordinate to bind to this flag
            const result = await sendMappingCommand({
                code: 'MAPPING_FLAG',
                data: {
                    robot_id: robotId,
                    ui_id: 'TFWB1',
                    status: true,
                    is_auto: false,
                    goal_name: flagDestName
                }
            });

            if (result.error) {
                setToast({ type: "error", message: `Flag failed: ${result.error}` });
            } else if (result.data && (result.data as Record<string, unknown>).ws_error) {
                setToast({ type: "success", message: `Flagged (queued offline): ${flagDestName}` });
                setShowFlaggingPrompt(false);
                setFlagDestName("");
            } else {
                setToast({ type: "success", message: `Flagged: ${flagDestName}` });
                setShowFlaggingPrompt(false);
                setFlagDestName("");

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((result as any).robot_may_be_offline) {
                    setTimeout(() => {
                        setToast({ type: "warning", message: `⚠️ Robot mungkin tidak aktif. Perintah tetap dikirim.` });
                    }, 500);
                }
            }
        } catch {
            setToast({ type: "error", message: "Failed to save coordinate" });
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleTalkToggle = async (action: 'TALK_ON' | 'TALK_OFF') => {
        setIsTalkingLoading(true);
        try {
            const res = await sendTalkCommand({
                robot_id: 'TFAIRB1',
                origin_id: originId,
                action
            });
            if (res.error) {
                setToast({ type: "error", message: res.error });
            } else {
                setToast({ type: "success", message: `Voice Control: ${action === 'TALK_ON' ? 'Activated' : 'Deactivated'}` });
                setIsTalkActive(action === 'TALK_ON');
            }
        } catch {
            setToast({ type: "error", message: "Failed to send talk command" });
        } finally {
            setIsTalkingLoading(false);
        }
    };

    // Send velocity command with optional speed fraction for ramping
    const sendVelocity = useCallback(
        async (direction: Direction, fraction: number = 1.0) => {
            const { linear, angular } = getVelocity(direction, speedLevel, fraction);
            try {
                const result = await sendTeleopCommand({
                    robot_id: robotId,
                    origin_id: originId,
                    linear,
                    angular,
                    speed: speedLevel,
                });
                setLastSendStatus(result.sent ? "ok" : "error");

                if (!result.sent) {
                    setToast({
                        type: "error",
                        message: result.error || "Gagal mengirim: Sesi WebSocket belum aktif. Silakan ambil kontrol WS (Take WS Control) di bar atas."
                    });
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((result as any).robot_may_be_offline && !hasShownOfflineWarningRef.current) {
                    hasShownOfflineWarningRef.current = true;
                    setToast({
                        type: "warning",
                        message: `⚠️ Robot mungkin tidak aktif. Perintah teleop tetap dikirim.`,
                    });
                    // Reset warning flag after 10s so it can show again if needed
                    setTimeout(() => {
                        hasShownOfflineWarningRef.current = false;
                    }, 10000);
                }
            } catch {
                setLastSendStatus("error");
            }
        },
        [speedLevel, robotId, originId]
    );

    const handleDone = async () => {
        try {
            // If live mapping was started (either currently active or just finished saving), send MAPPING_STOP
            if (isMapping || isMappingDone) {
                await sendMappingCommand({
                    code: 'MAPPING_STOP',
                    data: {
                        robot_id: robotId,
                        ui_id: 'TFWB1',
                        status: false,
                        is_auto: false,
                    }
                });
                setIsMapping(false);
                setIsMappingDone(false);
            }
            await sendTeleopDoneCommand({ robot_id: robotId, origin_id: originId });
        } catch {
            // ignore error
        }
        onDone();
    };


    // Helper to clear all ramp timers
    const clearAllRamps = useCallback(() => {
        if (accelRampRef.current) {
            clearTimeout(accelRampRef.current);
            accelRampRef.current = null;
        }
        if (decelRampRef.current) {
            clearTimeout(decelRampRef.current);
            decelRampRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        isDeceleratingRef.current = false;
    }, []);

    // Start pressing: accelerate through ramp steps, then hold at full speed
    const handlePress = useCallback(
        (direction: Direction) => {
            // Cancel any ongoing deceleration or previous ramp
            clearAllRamps();

            isPressingRef.current = true;
            isDeceleratingRef.current = false;
            setActiveDirection(direction);
            currentAccelStepRef.current = 0;

            // Acceleration ramp function
            const runAccelStep = (stepIndex: number) => {
                if (!isPressingRef.current || isDeceleratingRef.current) return;

                const fraction = ACCEL_STEPS[stepIndex];
                setAccelPhase(stepIndex + 1);
                void sendVelocity(direction, fraction);
                currentAccelStepRef.current = stepIndex;

                if (stepIndex < ACCEL_STEPS.length - 1) {
                    // Schedule next acceleration step
                    accelRampRef.current = setTimeout(() => {
                        runAccelStep(stepIndex + 1);
                    }, RAMP_INTERVAL_MS);
                } else {
                    // Reached full speed — keep sending at full speed every 200ms
                    intervalRef.current = setInterval(() => {
                        if (isPressingRef.current && !isDeceleratingRef.current) {
                            void sendVelocity(direction, 1.0);
                        }
                    }, 200);
                }
            };

            // Start acceleration from step 0
            runAccelStep(0);
        },
        [sendVelocity, clearAllRamps]
    );

    // Stop pressing: decelerate through ramp steps, then send full STOP
    const handleRelease = useCallback(() => {
        const lastDirection = activeDirection;
        isPressingRef.current = false;
        isDeceleratingRef.current = true;

        // Stop acceleration ramp and continuous interval
        if (accelRampRef.current) {
            clearTimeout(accelRampRef.current);
            accelRampRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // If no direction was active, just send stop immediately
        if (!lastDirection) {
            setActiveDirection(null);
            setAccelPhase(0);
            void sendVelocity(null, 0);
            isDeceleratingRef.current = false;
            return;
        }

        // Deceleration ramp function
        const runDecelStep = (stepIndex: number) => {
            if (isPressingRef.current) {
                // User pressed again during deceleration, abort decel
                isDeceleratingRef.current = false;
                return;
            }

            const fraction = DECEL_STEPS[stepIndex];
            setAccelPhase(Math.max(0, ACCEL_STEPS.length - stepIndex - 1));

            if (fraction === 0) {
                // Final step: full stop
                setActiveDirection(null);
                setAccelPhase(0);
                void sendVelocity(null, 0);
                isDeceleratingRef.current = false;
            } else {
                void sendVelocity(lastDirection, fraction);
                if (stepIndex < DECEL_STEPS.length - 1) {
                    decelRampRef.current = setTimeout(() => {
                        runDecelStep(stepIndex + 1);
                    }, RAMP_INTERVAL_MS);
                }
            }
        };

        // Start deceleration from step 0
        runDecelStep(0);
    }, [sendVelocity, activeDirection]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (accelRampRef.current) {
                clearTimeout(accelRampRef.current);
            }
            if (decelRampRef.current) {
                clearTimeout(decelRampRef.current);
            }
        };
    }, []);

    // Keyboard support
    useEffect(() => {
        const keyMap: Record<string, Direction> = {
            ArrowUp: "forward",
            w: "forward",
            W: "forward",
            ArrowDown: "backward",
            s: "backward",
            S: "backward",
            ArrowLeft: "left",
            a: "left",
            A: "left",
            ArrowRight: "right",
            d: "right",
            D: "right",
            q: "forward_left",
            Q: "forward_left",
            e: "forward_right",
            E: "forward_right",
            z: "backward_left",
            Z: "backward_left",
            c: "backward_right",
            C: "backward_right",
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const dir = keyMap[e.key];
            if (dir) {
                e.preventDefault();
                if (!isPressingRef.current) {
                    handlePress(dir);
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const dir = keyMap[e.key];
            if (dir) {
                e.preventDefault();
                handleRelease();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [handlePress, handleRelease]);

    // D-pad button component
    const DpadButton = ({
        direction,
        label,
        icon,
        className,
    }: {
        direction: Direction;
        label: string;
        icon: React.ReactNode;
        className?: string;
    }) => {
        const isActive = activeDirection === direction;
        return (
            <button
                onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handlePress(direction);
                }}
                onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    handleRelease();
                }}
                onPointerLeave={() => {
                    if (isActive) handleRelease();
                }}
                onPointerCancel={() => {
                    if (isActive) handleRelease();
                }}
                onContextMenu={(e) => e.preventDefault()}
                className={`
                    relative flex flex-col items-center justify-center gap-1 rounded-xl border transition-all duration-150 select-none touch-none
                    ${isActive
                        ? "bg-accent/15 border-accent text-accent shadow-[0_0_15px_var(--primary-glow)] scale-95"
                        : "bg-sidebar border-border-base text-txt-sec hover:border-accent hover:text-txt-main"
                    }
                    active:scale-95
                    ${className ?? ""}
                `}
                aria-label={label}
            >
                {icon}
                <span className="text-[10px] font-medium">{label}</span>
                {isActive && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent  shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
            </button>
        );
    };

    return (
        <div className="space-y-5">
            {toast && (
                <div className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${toast.type === "success" ? "bg-accent/10 text-accent border border-accent/20" : toast.type === "warning" ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20" : "bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/20"}`}>
                    {toast.type === "warning" ? (
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    ) : null}
                    {toast.message}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                {/* RIGHT SIDE: TELEOP CONTROLS */}
                <div className="flex-1 space-y-5 order-2 lg:order-2">
                    {/* Info banner */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar border border-border-base">
                        <svg className="w-4 h-4 text-txt-sec flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[11px] text-txt-sec">
                            {t.release_to_stop} • WASD / QEZC / Arrow keys
                        </p>
                        <div className="ml-auto flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${lastSendStatus === "ok" ? "bg-accent" : lastSendStatus === "error" ? "bg-rose-500" : "bg-gray-500"}`} />
                            <span className="text-[10px] text-txt-sec">
                                {lastSendStatus === "ok" ? t.ws_connected : lastSendStatus === "error" ? t.ws_disconnected : ""}
                            </span>
                        </div>
                    </div>

                    {/* D-PAD */}
                    <div className="flex justify-center">
                        <div className="grid grid-cols-3 grid-rows-3 gap-2.5 w-[280px] h-[280px]">
                            {/* Row 1: UP-LEFT - UP - UP-RIGHT */}
                            <DpadButton
                                direction="forward_left"
                                label={t.forward_left || "Maju Kiri"}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                    </svg>
                                }
                            />
                            <DpadButton
                                direction="forward"
                                label={t.forward}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                    </svg>
                                }
                            />
                            <DpadButton
                                direction="forward_right"
                                label={t.forward_right || "Maju Kanan"}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                    </svg>
                                }
                            />

                            {/* Row 2: LEFT - STOP - RIGHT */}
                            <DpadButton
                                direction="left"
                                label={t.left}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                    </svg>
                                }
                            />
                            {/* Center STOP button */}
                            <button
                                onPointerDown={(e) => {
                                    handleRelease();
                                }}
                                className={`
                                    w-full h-full flex flex-col items-center justify-center gap-1 rounded-full border-2 transition-all duration-150 select-none
                                    ${activeDirection
                                        ? "bg-rose-500/20 border-rose-500 text-rose-500  shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                                        : "bg-elevated border-border-base text-txt-sec hover:border-rose-400 hover:text-rose-500"
                                    }
                                `}
                                aria-label="Stop"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                                <span className="text-[9px] font-bold tracking-wider">{t.stop}</span>
                            </button>
                            <DpadButton
                                direction="right"
                                label={t.right}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                }
                            />

                            {/* Row 3: DOWN-LEFT - DOWN - DOWN-RIGHT */}
                            <DpadButton
                                direction="backward_left"
                                label={t.backward_left || "Mundur Kiri"}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                }
                            />
                            <DpadButton
                                direction="backward"
                                label={t.backward}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                }
                            />
                            <DpadButton
                                direction="backward_right"
                                label={t.backward_right || "Mundur Kanan"}
                                className="w-full h-full"
                                icon={
                                    <svg className="w-6 h-6 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                }
                            />
                        </div>
                    </div>

                    {/* Active direction indicator with acceleration progress */}
                    {activeDirection && (
                        <div className="flex flex-col gap-2 py-2.5 px-3 rounded-xl bg-accent/10 border border-accent/30 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center justify-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-accent " />
                                <span className="text-xs font-semibold text-accent">
                                    {t.holding} {t[activeDirection]}
                                </span>
                                <span className="text-[10px] font-mono text-accent/70 ml-1">
                                    {isDeceleratingRef.current ? "⏬" : accelPhase < ACCEL_STEPS.length ? "⏫" : ""} {Math.round((ACCEL_STEPS[Math.min(accelPhase, ACCEL_STEPS.length) - 1] ?? 0) * 100)}%
                                </span>
                            </div>
                            {/* Speed ramp progress bar */}
                            <div className="flex items-center gap-1">
                                {ACCEL_STEPS.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 flex-1 rounded-full transition-all duration-200 ${i < accelPhase
                                                ? "bg-accent shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                                                : "bg-white/10"
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Speed control */}
                    <div className="pt-3 border-t border-border-base mt-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-medium text-txt-sec uppercase tracking-wider">
                                {t.speed}
                            </span>
                            <span className="text-xs font-mono text-accent bg-sidebar border border-border-base px-2 py-0.5 rounded">
                                {speedLevel === "S" ? (t.speed_slow || "Slow") : speedLevel === "F" ? "Fast" : "Very Fast"}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {(["S", "F", "VF"] as SpeedLevel[]).map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setSpeedLevel(level)}
                                    className={`
                                        py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-150 border
                                        ${speedLevel === level
                                            ? "bg-accent text-white border-accent shadow-[0_0_12px_var(--primary-glow)]"
                                            : "bg-sidebar border-border-base text-txt-sec hover:border-accent hover:text-txt-main"
                                        }
                                    `}
                                >
                                    {level === "S" ? `🐢 ${t.speed_slow || "Slow"}` : level === "F" ? `🐇 Fast` : `⚡ V.Fast`}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between mt-1.5 px-1">
                            <span className="text-[9px] text-txt-sec/50">{SPEED_CONFIG.S.linear} m/s</span>
                            <span className="text-[9px] text-txt-sec/50">{SPEED_CONFIG.F.linear} m/s</span>
                            <span className="text-[9px] text-txt-sec/50">{SPEED_CONFIG.VF.linear} m/s</span>
                        </div>
                    </div>
                </div>

                {/* LEFT SIDE: MAPPING & VOICE CONTROLS */}
                <div className="flex-1 flex flex-col gap-5 order-1 lg:order-1">
                    {/* LIVE MAPPING CONTROLS */}
                    <div className="flex-1 p-4 rounded-xl border border-border-base bg-sidebar shadow-inner flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <span className="text-sm font-semibold text-txt-main">Live Mapping</span>
                            </div>
                            {isMapping && (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-400 dark:border-rose-500/40">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 " />
                                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Recording</span>
                                </span>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col justify-center gap-3 mt-2">
                            {isMappingDone ? (
                                /* === MAPPING COMPLETE STATE === */
                                <div className="space-y-3">
                                    <div className="flex flex-col items-center gap-2 py-6 rounded-xl bg-accent/10 border border-accent/30">
                                        <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="text-sm font-bold text-accent">Map Saved Successfully!</span>
                                        <span className="text-[11px] text-accent/70">Live mapping session is complete.</span>
                                    </div>
                                    <button
                                        onClick={handleDone}
                                        className="w-full py-3 rounded-xl bg-accent hover:bg-accent/90 text-[#171717] font-bold text-sm tracking-wide transition-colors flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(3,230,228,0.4)]"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        DONE — EXIT TELEOP
                                    </button>
                                </div>
                            ) : !isMapping ? (
                                <button
                                    onClick={handleStartMapping}
                                    className="w-full py-4 rounded-xl bg-txt-main border border-border-base hover:border-accent text-page font-bold text-sm tracking-wide transition-colors flex justify-center items-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    START MAPPING
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowFlaggingPrompt(true)}
                                        disabled={showFlaggingPrompt || showSaveMapPrompt}
                                        className="w-full py-4 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/40 text-accent font-bold tracking-wide transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        FLAGGING CORD
                                    </button>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleStopMapping}
                                            className="flex-1 py-3 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/50 text-gray-300 font-semibold text-xs transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => setShowSaveMapPrompt(true)}
                                            className="flex-1 py-3 rounded-lg bg-accent hover:bg-accent/90 text-[#171717] font-bold text-xs transition-colors shadow-[0_0_15px_rgba(3,230,228,0.4)]"
                                        >
                                            Finish & Save
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Flagging Prompt Overlay */}
                            {showFlaggingPrompt && (
                                <div className="p-3 bg-sidebar rounded-lg border border-border-highlight shadow-lg">
                                    <p className="text-[11px] text-txt-sec mb-2">Record current robot coordinate. Enter destination name:</p>
                                    <input
                                        type="text"
                                        autoFocus
                                        className="w-full bg-white/5 border border-border-base rounded px-2 py-1.5 text-xs text-txt-main mb-2 focus:outline-none focus:border-accent"
                                        placeholder="e.g. Table 1, Room 2"
                                        value={flagDestName}
                                        onChange={(e) => setFlagDestName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && flagDestName) submitFlaggingCord(); }}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowFlaggingPrompt(false)} className="flex-1 px-2 py-1.5 text-xs text-txt-sec hover:text-white">Cancel</button>
                                        <button onClick={submitFlaggingCord} disabled={!flagDestName || isSavingDraft} className="flex-1 px-2 py-1.5 text-[11px] font-bold bg-accent text-[#171717] rounded disabled:opacity-50 hover:bg-accent/90">
                                            {isSavingDraft ? "Saving..." : "Save Goal"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Save Map Prompt Overlay */}
                            {showSaveMapPrompt && (
                                <div className="p-3 bg-sidebar rounded-lg border border-border-highlight shadow-lg">
                                    <p className="text-[11px] text-txt-sec mb-2">Finish mapping and name your new map file:</p>
                                    <div className="space-y-1.5 mb-3">
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-border-base rounded px-2 py-1.5 text-xs text-txt-main focus:outline-none focus:border-accent"
                                            placeholder="Map Name (e.g. LAB_FLOOR_1)"
                                            value={mapName}
                                            onChange={(e) => setMapName(e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-border-base rounded px-2 py-1.5 text-xs text-txt-main focus:outline-none focus:border-accent"
                                            placeholder="Category (e.g. laboratorium)"
                                            value={mapCategory}
                                            onChange={(e) => setMapCategory(e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            className="w-full bg-white/5 border border-border-base rounded px-2 py-1.5 text-xs text-txt-main focus:outline-none focus:border-accent"
                                            placeholder="Category Type (e.g. custom)"
                                            value={mapCategoryType}
                                            onChange={(e) => setMapCategoryType(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowSaveMapPrompt(false)} className="flex-1 px-2 py-1.5 text-xs text-txt-sec hover:text-white">Cancel</button>
                                        <button onClick={handleSaveMapping} disabled={!mapName || isWaitingForSaveConfirm} className="flex-1 px-2 py-1.5 text-[11px] font-bold bg-accent hover:bg-accent/90 text-[#171717] rounded disabled:opacity-50 flex justify-center items-center gap-2">
                                            {isWaitingForSaveConfirm ? (
                                                <>
                                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save Map"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* VOICE CONTROL CONTROLS */}
                    <div className="p-4 rounded-xl border border-border-base bg-sidebar shadow-inner">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-txt-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                <span className="text-sm font-semibold text-txt-main">Voice Control</span>
                            </div>
                            {isTalkActive && (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/20 border border-accent/40">
                                    <span className="w-2 h-2 rounded-full bg-accent " />
                                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Listening</span>
                                </span>
                            )}
                        </div>

                        {!isTalkActive ? (
                            <button
                                onClick={() => handleTalkToggle('TALK_ON')}
                                disabled={isTalkingLoading}
                                className="w-full py-2.5 rounded-lg bg-txt-main border border-border-base hover:border-accent text-page font-semibold text-xs tracking-wide transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                {isTalkingLoading ? "Activating..." : "TALK ON"}
                            </button>
                        ) : (
                            <button
                                onClick={() => handleTalkToggle('TALK_OFF')}
                                disabled={isTalkingLoading}
                                className="w-full py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 border border-rose-600 text-white font-semibold text-xs tracking-wide transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                                {isTalkingLoading ? "Deactivating..." : "TALK OFF"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Robot info */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-sidebar border border-border-base">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-txt-sec" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    <span className="text-xs font-medium text-txt-main">{selectedGroup.displayName}</span>
                </div>
                <span className="text-[10px] font-mono text-txt-sec bg-white/5 px-2 py-0.5 rounded">
                    {robotId}
                </span>
            </div>
            {/* Done button */}
            <button
                onClick={handleDone}
                className="w-full mt-3 py-3 rounded-xl font-bold tracking-wide text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-txt-main text-page border border-accent shadow-[0_0_15px_rgba(3,230,228,0.2)] active:scale-[0.98] uppercase"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {t.done_teleop || "Selesai Teleop"}
            </button>
        </div>
    );
}

