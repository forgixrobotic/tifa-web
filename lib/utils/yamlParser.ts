/**
 * Lightweight ROS Map YAML Metadata Parser
 * Reads YAML fields: resolution, origin, image, occupied_thresh, free_thresh, negate
 */

export interface MapYamlMeta {
    image: string;
    resolution: number;
    origin: [number, number, number]; // [x_origin, y_origin, yaw_origin]
    occupiedThresh: number;
    freeThresh: number;
    negate: number;
}

export function parseMapYaml(yamlText: string): MapYamlMeta {
    const lines = yamlText.split('\n');
    const result: MapYamlMeta = {
        image: 'map.pgm',
        resolution: 0.05,
        origin: [0, 0, 0],
        occupiedThresh: 0.65,
        freeThresh: 0.25,
        negate: 0,
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex).trim();
        const valueStr = line.substring(colonIndex + 1).trim();

        switch (key) {
            case 'image':
                result.image = valueStr.replace(/['"]/g, '');
                break;
            case 'resolution':
                result.resolution = parseFloat(valueStr) || 0.05;
                break;
            case 'occupied_thresh':
                result.occupiedThresh = parseFloat(valueStr) || 0.65;
                break;
            case 'free_thresh':
                result.freeThresh = parseFloat(valueStr) || 0.25;
                break;
            case 'negate':
                result.negate = parseInt(valueStr, 10) || 0;
                break;
            case 'origin':
                // Parses array like [-3.96, -5.22, 0] or [-3.96, -5.22, 0.0]
                try {
                    const cleanArray = valueStr.replace(/[\[\]]/g, '').split(',');
                    if (cleanArray.length >= 3) {
                        result.origin = [
                            parseFloat(cleanArray[0].trim()) || 0,
                            parseFloat(cleanArray[1].trim()) || 0,
                            parseFloat(cleanArray[2].trim()) || 0,
                        ];
                    }
                } catch {
                    // Fall back to default [0, 0, 0]
                }
                break;
        }
    }

    return result;
}
