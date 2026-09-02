// Maps API - Abstraction layer for map operations
// Matches m_map table from tifa_dump.sql
// Uses PostgreSQL via pg package

import { query } from '@/lib/dbClient';
import type { Map, ApiResult } from '@/lib/types/database';

/**
 * Get all maps
 */
export async function getAllMaps(companyId?: number): Promise<ApiResult<Map[]>> {
    try {
        const params: (string | number)[] = [];
        let sql = `
            SELECT map_id, map_name, description, map_floor, file_group_id, 
                   created_by, created_at, updated_at
            FROM m_map
            WHERE file_group_id IS NOT NULL
        `;
        if (companyId) {
            sql += ` AND company_id = $1`;
            params.push(companyId);
        }
        sql += ` ORDER BY map_name ASC`;
        const data = await query<Map>(sql, params.length > 0 ? params : undefined);

        return {
            data,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Get single map by ID
 */
export async function getMapById(mapId: number): Promise<ApiResult<Map>> {
    try {
        const rows = await query<Map>(
            `SELECT map_id, map_name, description, map_floor, file_group_id, 
                    created_by, created_at, updated_at
             FROM m_map
             WHERE map_id = $1`,
            [mapId]
        );

        return {
            data: rows[0] ?? null,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Get maps by floor
 */
export async function getMapsByFloor(floor: string, companyId?: number): Promise<ApiResult<Map[]>> {
    try {
        const params: (string | number)[] = [floor];
        let sql = `
            SELECT map_id, map_name, description, map_floor, file_group_id, 
                    created_by, created_at, updated_at
             FROM m_map
             WHERE map_floor = $1 AND file_group_id IS NOT NULL
        `;
        if (companyId) {
            sql += ` AND company_id = $2`;
            params.push(companyId);
        }
        sql += ` ORDER BY map_name ASC`;
        const data = await query<Map>(sql, params);

        return {
            data,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Count total maps
 */
export async function getMapCount(companyId?: number): Promise<ApiResult<number>> {
    try {
        let sql = `SELECT COUNT(*) as count FROM m_map`;
        const params: number[] = [];

        if (companyId) {
            sql += ` WHERE company_id = $1`;
            params.push(companyId);
        }

        const rows = await query<{ count: string }>(sql, params.length > 0 ? params : undefined);

        return {
            data: parseInt(rows[0]?.count ?? '0', 10),
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: 0,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * Delete single map by ID
 */
export async function deleteMap(mapId: number): Promise<ApiResult<null>> {
    try {
        // Delete related goals
        await query(`DELETE FROM m_goal WHERE map_id = $1`, [mapId]);
        // Delete related map versions
        await query(`DELETE FROM m_map_version WHERE map_id = $1`, [mapId]);
        // Delete the map
        await query(`DELETE FROM m_map WHERE map_id = $1`, [mapId]);

        return {
            data: null,
            error: null,
        };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            data: null,
            error: error.message ?? 'Database error',
        };
    }
}

/**
 * File record from g_file table
 */
export type MapFile = {
    g_file_id: number;
    file_group_id: number;
    file_name: string;
    file_path: string;
    file_type: string;
    file_size: number;
    metadata: Record<string, unknown> | null;
};

/**
 * Get files associated with a map via file_group_id
 * Queries g_file table using the map's file_group_id from m_map
 */
export async function getMapFiles(mapId: number): Promise<ApiResult<MapFile[]>> {
    try {
        // First get file_group_id from m_map
        const mapRows = await query<{ file_group_id: number }>(
            `SELECT file_group_id FROM m_map WHERE map_id = $1 AND file_group_id IS NOT NULL`,
            [mapId]
        );

        if (mapRows.length === 0 || !mapRows[0].file_group_id) {
            return { data: [], error: null };
        }

        const fileGroupId = mapRows[0].file_group_id;

        // Query g_file for all files in this group
        const files = await query<MapFile>(
            `SELECT g_file_id, file_group_id, file_name, file_path, file_type, file_size, metadata
             FROM g_file WHERE file_group_id = $1
             ORDER BY file_type ASC`,
            [fileGroupId]
        );

        return { data: files, error: null };
    } catch (err: unknown) {
        const error = err as Error;
        return { data: null, error: error.message ?? 'Database error' };
    }
}

/**
 * Get the raw file content (Buffer) for a specific g_file record.
 * Reads from file_path on the server filesystem.
 * Returns null if file is not accessible.
 */
export async function getMapFileBuffer(mapId: number, fileType: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    try {
        const mapRows = await query<{ file_group_id: number }>(
            `SELECT file_group_id FROM m_map WHERE map_id = $1 AND file_group_id IS NOT NULL`,
            [mapId]
        );

        if (mapRows.length === 0 || !mapRows[0].file_group_id) return null;

        const fileGroupId = mapRows[0].file_group_id;

        const files = await query<MapFile>(
            `SELECT g_file_id, file_group_id, file_name, file_path, file_type, file_size, metadata
             FROM g_file WHERE file_group_id = $1 AND file_type = $2
             LIMIT 1`,
            [fileGroupId, fileType]
        );

        if (files.length === 0) return null;

        const file = files[0];
        const fs = await import('fs');
        const path = await import('path');

        // Try multiple paths (production vs dev vs sample fallback)
        const candidates = [
            file.file_path,
            path.join(process.cwd(), 'docs', 'sample', file.file_name),
            path.join(process.cwd(), 'docs', 'sample', `map.${file.file_type}`),
            path.join(process.cwd(), '..', 'docs', 'sample', file.file_name),
            path.join(process.cwd(), '..', 'docs', 'sample', `map.${file.file_type}`),
            path.join('/opt', 'tifa', 'uploads', 'maps', String(mapId), '2', `map.${file.file_type}`),
            path.join('/opt', 'tifa', 'uploads', 'maps', String(mapId), '1', `map.${file.file_type}`),
            path.join(process.cwd(), 'docs', 'sample', `map1_save.${file.file_type}`),
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                const buffer = fs.readFileSync(candidate);
                const mimeMap: Record<string, string> = {
                    pgm: 'image/x-portable-graymap',
                    yaml: 'text/yaml',
                    yml: 'text/yaml',
                    png: 'image/png',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                };
                return {
                    buffer,
                    fileName: file.file_name,
                    mimeType: mimeMap[file.file_type] || 'application/octet-stream',
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}
