"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { getSessionJwtToken } from "@/lib/sessionId";

type SessionStatus = {
    isWsTurnedOn: boolean;
    activeUserEmail: string | null;
};

export default function WebSocketSessionControl({ currentUserEmail }: { currentUserEmail: string }) {
    const { dict } = useLanguage();
    const [status, setStatus] = useState<SessionStatus>({ isWsTurnedOn: false, activeUserEmail: null });
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/ws/session');
            const data = await res.json();
            if (data.success) {
                setStatus({
                    isWsTurnedOn: data.isWsTurnedOn,
                    activeUserEmail: data.activeUserEmail
                });
            }
        } catch (err) {
            console.error("Failed to fetch WS session status", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    const handleAction = async (action: 'turn-on' | 'turn-off') => {
        setActionLoading(true);
        setError(null);
        try {
            const token = getSessionJwtToken();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch('/api/ws/session', {
                method: 'POST',
                headers,
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.success) {
                await fetchStatus();
            } else {
                setError(data.error || `Failed to ${action}`);
                setTimeout(() => setError(null), 3000);
            }
        } catch (err: any) {
            setError(err.message);
            setTimeout(() => setError(null), 3000);
        } finally {
            setActionLoading(false);
        }
    };

    const isAvailable = !status.isWsTurnedOn;
    const isMine = status.isWsTurnedOn && status.activeUserEmail === currentUserEmail;
    const isOthers = status.isWsTurnedOn && status.activeUserEmail !== currentUserEmail;

    if (loading) {
        return <div className="h-8 w-24  bg-sidebar rounded-lg"></div>;
    }

    return (
        <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-base bg-sidebar/50 text-xs font-medium">
            {error && (
                <div className="absolute top-full mt-2 right-0 w-48 bg-rose-100 text-rose-700 p-2 rounded shadow-lg z-50 text-[10px]">
                    {error}
                </div>
            )}
            
            {/* Status Indicator */}
            <div className="flex items-center gap-1.5 mr-2">
                {isAvailable && (
                    <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                        <span className="text-txt-sec">WS Available</span>
                    </>
                )}
                {isMine && (
                    <>
                        <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                        <span className="text-blue-500">Your Session</span>
                    </>
                )}
                {isOthers && (
                    <>
                        <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>
                        <span className="text-amber-500 truncate max-w-[100px]" title={`In use by ${status.activeUserEmail}`}>
                            {status.activeUserEmail?.split('@')[0]}
                        </span>
                    </>
                )}
            </div>

            {/* Action Button */}
            {isAvailable && (
                <button
                    onClick={() => handleAction('turn-on')}
                    disabled={actionLoading}
                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 rounded-md transition-colors disabled:opacity-50"
                >
                    Turn On
                </button>
            )}
            {isMine && (
                <button
                    onClick={() => handleAction('turn-off')}
                    disabled={actionLoading}
                    className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/20 rounded-md transition-colors disabled:opacity-50"
                >
                    Turn Off
                </button>
            )}
            {isOthers && (
                <button
                    disabled
                    className="px-2 py-1 bg-gray-500/10 text-gray-500 border border-gray-500/20 rounded-md cursor-not-allowed opacity-70 flex items-center gap-1"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    Locked
                </button>
            )}
        </div>
    );
}
