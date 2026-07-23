'use client';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getRobots, createRobot, updateRobot, deleteRobot, getCurrentUser, type Robot } from "@/lib/api";
import { groupRobots, type GroupedRobot } from "@/lib/utils/robotGrouping";

export default function ManageRobotsPage() {
    const [robots, setRobots] = useState<Robot[]>([]);
    const [groupedRobots, setGroupedRobots] = useState<GroupedRobot[]>([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [editingRbId, setEditingRbId] = useState<number | null>(null);
    const [editingUiId, setEditingUiId] = useState<number | null>(null);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [robotLocalIp, setRobotLocalIp] = useState("");
    const [robotLocalSsid, setRobotLocalSsid] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadRobots = async () => {
        setLoading(true);
        setError(null);

        const { data, error: apiError } = await getRobots();

        if (apiError) {
            setError(apiError);
        } else {
            setRobots(data ?? []);
            setGroupedRobots(groupRobots(data ?? []));
        }

        setLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadRobots();
        getCurrentUser().then(res => { if (res.data) setUserRole(res.data.role); });
    }, []);

    const resetForm = () => {
        setEditingRbId(null);
        setEditingUiId(null);
        setName("");
        setCode("");
        setRobotLocalIp("");
        setRobotLocalSsid("");
        setError(null);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (userRole !== 'admin' && userRole !== 'super_admin') {
            setError("Only administrators can register or edit robots.");
            return;
        }

        if (!name || !code) {
            setError("Name and device code are required.");
            return;
        }

        if (editingRbId || editingUiId) {
            if (editingRbId) {
                const rbData = {
                    device_name: name,
                    device_code: name,
                    robot_local_ip: robotLocalIp || null,
                    robot_local_ssid: robotLocalSsid || null,
                };
                const { error: apiError } = await updateRobot(editingRbId, rbData);
                if (apiError) {
                    setError(`Error updating Robot node: ${apiError}`);
                    return;
                }
            }

            if (editingUiId) {
                const uiData = {
                    device_name: code,
                    device_code: code,
                    robot_local_ip: robotLocalIp || null,
                    robot_local_ssid: robotLocalSsid || null,
                };
                const { error: apiError } = await updateRobot(editingUiId, uiData);
                if (apiError) {
                    setError(`Error updating UI node: ${apiError}`);
                    return;
                }
            }
            
            setSuccess("Robot group updated successfully!");
        } else {
            // New Registration Flow: Split into two devices as per user requirement
            const robotData = {
                device_name: name,
                device_code: name,
                robot_local_ip: robotLocalIp || null,
                robot_local_ssid: robotLocalSsid || null,
            };

            const uiData = {
                device_name: code,
                device_code: code,
                robot_local_ip: robotLocalIp || null,
                robot_local_ssid: robotLocalSsid || null,
            };

            const { error: robotError } = await createRobot(robotData);
            if (robotError) {
                setError("Error creating Robot node: " + robotError);
                return;
            }

            const { error: uiError } = await createRobot(uiData);
            if (uiError) {
                setError("Error creating UI node: " + uiError);
                return;
            }
            
            setSuccess("Robot and UI nodes registered successfully!");
        }

        resetForm();
        setFormOpen(false);
        await loadRobots();

        setTimeout(() => setSuccess(null), 3000);
    };

    const handleEdit = (group: GroupedRobot) => {
        setEditingRbId(group.rbDevice?.device_id ?? null);
        setEditingUiId(group.uiDevice?.device_id ?? null);
        setName(group.rbDevice?.device_name ?? "");
        setCode(group.uiDevice?.device_code ?? "");
        
        const primaryDevice = group.rbDevice || group.uiDevice || group.devices[0];
        setRobotLocalIp(primaryDevice?.robot_local_ip ?? "");
        setRobotLocalSsid(primaryDevice?.robot_local_ssid ?? "");
        setFormOpen(true);
        setError(null);
    };

    const handleDelete = async (group: GroupedRobot) => {
        const ok = window.confirm(`Permanently remove "${group.displayName}" and all its nodes? This cannot be undone.`);
        if (!ok) return;

        for (const device of group.devices) {
            const { error: apiError } = await deleteRobot(device.device_id);
            if (apiError) {
                setError(`Error deleting ${device.device_code}: ${apiError}`);
                return;
            }
        }
        
        setSuccess("Robot group removed successfully!");
        await loadRobots();

        setTimeout(() => setSuccess(null), 3000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/robots" className="text-txt-sec hover:text-txt-main transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-bold text-txt-main tracking-tight">Manage Fleet</h1>
                    </div>
                    <p className="text-sm text-txt-sec">
                        Administrative controls for robot devices
                    </p>
                </div>
                {userRole === 'admin' && (
                    <button
                        type="button"
                        onClick={() => {
                            resetForm();
                            setFormOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all border border-blue-300 dark:border-blue-500/30"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Register New Node
                    </button>
                )}
            </div>

            {/* Success Message */}
            {success && (
                <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-900/50 backdrop-blur-sm flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-emerald-200 font-medium">{success}</p>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-xl bg-red-900/20 border border-red-900/50 backdrop-blur-sm flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            {/* Add/Edit Form */}
            {formOpen && (
                <div className="glass-panel rounded-xl p-6 border border-border-base">
                    <h2 className="text-lg font-semibold text-txt-main mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                        {editingRbId || editingUiId ? "Edit Configuration" : "New Device Registration"}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-txt-sec uppercase tracking-wider">
                                    Device Name (TFRB) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="input-dark w-full px-4 py-3 rounded-lg text-sm"
                                    placeholder="e.g., TIFA Delivery Unit 1"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-txt-sec uppercase tracking-wider">
                                    Device Code (TFUI) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className="input-dark w-full px-4 py-3 rounded-lg text-sm font-mono"
                                    placeholder="e.g., TIFA-001"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-txt-sec uppercase tracking-wider">
                                    Internal IP (Optional)
                                </label>
                                <input
                                    value={robotLocalIp}
                                    onChange={(e) => setRobotLocalIp(e.target.value)}
                                    className="input-dark w-full px-4 py-3 rounded-lg text-sm font-mono"
                                    placeholder="e.g., 192.168.1.100"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-txt-sec uppercase tracking-wider">
                                    SSID (Optional)
                                </label>
                                <input
                                    value={robotLocalSsid}
                                    onChange={(e) => setRobotLocalSsid(e.target.value)}
                                    className="input-dark w-full px-4 py-3 rounded-lg text-sm"
                                    placeholder="e.g., TIFA_MESH_NET"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-6 border-t border-border-base">
                            <button
                                type="button"
                                onClick={() => {
                                    resetForm();
                                    setFormOpen(false);
                                }}
                                className="px-4 py-2 rounded-lg border border-border-base bg-transparent text-sm font-medium text-txt-sec hover:text-txt-main hover:bg-card-bg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500 transition-all"
                            >
                                {editingRbId || editingUiId ? "Save Changes" : "Register Device"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Robot Table */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-black border-b border-border-base">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase tracking-wider">Device</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase tracking-wider">Nodes</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase tracking-wider">IP Address</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-txt-accent uppercase tracking-wider">SSID</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-txt-accent uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-base">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex items-center justify-center gap-3 text-txt-sec">
                                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-sm">Fetching records...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : groupedRobots.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-txt-sec">
                                        No devices registered in the database.
                                    </td>
                                </tr>
                            ) : (
                                groupedRobots.map((group) => (
                                    <tr key={group.groupId} className="hover:bg-card-bg transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-sidebar flex items-center justify-center border border-border-base">
                                                    <svg className="w-4 h-4 text-txt-sec group-hover:text-txt-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                                    </svg>
                                                </div>
                                                <span className="font-medium text-txt-main group-hover:text-txt-accent transition-colors">{group.displayName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="flex items-center gap-2">
                                                {group.rbDevice && (
                                                    <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 font-mono text-xs border border-blue-500/20">
                                                        {group.rbDevice.device_code}
                                                    </span>
                                                )}
                                                {group.uiDevice && (
                                                    <span className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 font-mono text-xs border border-purple-500/20">
                                                        {group.uiDevice.device_code}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-txt-sec font-mono">
                                            {(group.rbDevice?.robot_local_ip || group.uiDevice?.robot_local_ip) || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-txt-sec">
                                            {(group.rbDevice?.robot_local_ssid || group.uiDevice?.robot_local_ssid) || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                            <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                {userRole === 'admin' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(group)}
                                                        className="p-1.5 rounded-lg text-txt-sec hover:bg-blue-100 dark:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {userRole === 'admin' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(group)}
                                                        className="p-1.5 rounded-lg text-txt-sec hover:bg-rose-100 dark:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
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
