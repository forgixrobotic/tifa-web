import { NextResponse } from 'next/server';
import { getMapFileBuffer } from '@/lib/api/maps';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const idParam = await params;
        const mapId = parseInt(idParam.id, 10);
        if (isNaN(mapId)) {
            return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 });
        }

        let fileData = await getMapFileBuffer(mapId, 'yaml');
        if (!fileData) {
            fileData = await getMapFileBuffer(mapId, 'yml');
        }

        if (!fileData) {
            return NextResponse.json({ error: 'Map YAML file not found on server' }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(fileData.buffer), {
            headers: {
                'Content-Type': 'text/yaml; charset=utf-8',
                'Content-Disposition': `inline; filename="${fileData.fileName}"`,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Server error' },
            { status: 500 }
        );
    }
}
