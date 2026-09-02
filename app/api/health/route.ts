import { NextResponse } from 'next/server';
import { query } from '@/lib/dbClient';
import net from 'net';

export const dynamic = 'force-dynamic';

interface ServiceHealth {
    status: 'UP' | 'DOWN';
    latencyMs: number;
    details: string;
}

/**
 * Test TCP connectivity to host:port with a timeout
 */
function checkTcpPort(host: string, port: number, timeoutMs: number = 2000): Promise<{ isUp: boolean; latencyMs: number }> {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            const latencyMs = Date.now() - start;
            socket.destroy();
            resolve({ isUp: true, latencyMs });
        });

        socket.on('error', () => {
            socket.destroy();
            resolve({ isUp: false, latencyMs: Date.now() - start });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ isUp: false, latencyMs: timeoutMs });
        });

        socket.connect(port, host);
    });
}

export async function GET() {
    const timestamp = new Date().toISOString();

    // 1. Check PostgreSQL Database
    const dbPromise = (async (): Promise<ServiceHealth> => {
        const start = Date.now();
        try {
            await query('SELECT 1');
            const latencyMs = Date.now() - start;
            return {
                status: 'UP',
                latencyMs,
                details: 'PostgreSQL 15 Connected (Port 5433)',
            };
        } catch (err: unknown) {
            return {
                status: 'DOWN',
                latencyMs: Date.now() - start,
                details: err instanceof Error ? err.message : 'Database Connection Failed',
            };
        }
    })();

    // 2. Check WebSocket Gateway (Port 3001)
    const wsPromise = (async (): Promise<ServiceHealth> => {
        const tcpCheck = await checkTcpPort('127.0.0.1', 3001, 2000);
        return {
            status: tcpCheck.isUp ? 'UP' : 'DOWN',
            latencyMs: tcpCheck.latencyMs,
            details: tcpCheck.isUp ? 'tifa-ws Listening (Port 3001)' : 'WebSocket Gateway Unreachable',
        };
    })();

    // 3. Check Spring Boot Backend (Port 8080)
    const bePromise = (async (): Promise<ServiceHealth> => {
        const tcpCheck = await checkTcpPort('127.0.0.1', 8080, 2000);
        return {
            status: tcpCheck.isUp ? 'UP' : 'DOWN',
            latencyMs: tcpCheck.latencyMs,
            details: tcpCheck.isUp ? 'tifa-be Active (Port 8080)' : 'Backend Service Unreachable',
        };
    })();

    const [dbHealth, wsHealth, beHealth] = await Promise.all([dbPromise, wsPromise, bePromise]);

    // Overall Status Determination
    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    if (dbHealth.status === 'DOWN' || wsHealth.status === 'DOWN') {
        overallStatus = 'DOWN';
    } else if (beHealth.status === 'DOWN') {
        overallStatus = 'DEGRADED';
    }

    return NextResponse.json({
        status: overallStatus,
        timestamp,
        services: {
            database: dbHealth,
            websocket: wsHealth,
            backend: beHealth,
        },
    });
}
