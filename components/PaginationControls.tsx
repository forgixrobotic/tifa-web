'use client';

import React from 'react';
import type { PaginationMeta } from '@/lib/api/commands';

interface PaginationControlsProps {
    pagination: PaginationMeta;
    onPageChange: (newPage: number) => void;
    onLimitChange?: (newLimit: number) => void;
    className?: string;
}

export default function PaginationControls({
    pagination,
    onPageChange,
    onLimitChange,
    className = '',
}: PaginationControlsProps) {
    const { page, limit, totalRows, totalPages, hasNextPage, hasPrevPage } = pagination;

    const startRow = totalRows === 0 ? 0 : (page - 1) * limit + 1;
    const endRow = Math.min(page * limit, totalRows);

    return (
        <div className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-400 ${className}`}>
            {/* Rows info */}
            <div className="flex items-center gap-3">
                <span>
                    Showing <strong className="text-slate-200">{startRow}–{endRow}</strong> of <strong className="text-sky-400">{totalRows.toLocaleString()}</strong> records
                </span>

                {onLimitChange && (
                    <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                        <span>Per page:</span>
                        <select
                            value={limit}
                            onChange={(e) => onLimitChange(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-0.5 focus:outline-none focus:border-sky-500"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1.5">
                {/* First Page */}
                <button
                    onClick={() => onPageChange(1)}
                    disabled={!hasPrevPage}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 rounded transition font-mono"
                    title="First Page"
                >
                    «
                </button>

                {/* Previous Page */}
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={!hasPrevPage}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 rounded transition"
                    title="Previous Page"
                >
                    ‹ Prev
                </button>

                {/* Page indicator */}
                <span className="px-3 py-1 bg-slate-950 border border-slate-800 rounded font-mono text-slate-300">
                    Page <strong className="text-sky-400">{page}</strong> / {totalPages}
                </span>

                {/* Next Page */}
                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={!hasNextPage}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 rounded transition"
                    title="Next Page"
                >
                    Next ›
                </button>

                {/* Last Page */}
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={!hasNextPage}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 rounded transition font-mono"
                    title="Last Page"
                >
                    »
                </button>
            </div>
        </div>
    );
}
