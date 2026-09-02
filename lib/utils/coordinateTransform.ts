/**
 * ROS Map 2D Coordinate Transformation Utilities
 * Converts between HTML5 Canvas Pixel Coordinates (px, py)
 * and ROS Real-World World Coordinates (x, y, yaw in meters/radians).
 * 
 * ROS Coordinate System Standard:
 * - World Origin (0,0) is defined by origin[0], origin[1] in meters.
 * - In ROS, Y grows UPWARDS.
 * - In Canvas, Y grows DOWNWARDS.
 * - Therefore:
 *     world_x = origin_x + (px * resolution)
 *     world_y = origin_y + ((image_height - py) * resolution)
 * 
 * Inverse Transformation (World -> Pixel):
 *     px = (world_x - origin_x) / resolution
 *     py = image_height - ((world_y - origin_y) / resolution)
 */

export interface Point2D {
    x: number;
    y: number;
}

export interface PixelPoint {
    px: number;
    py: number;
}

export interface MapOrigin {
    x: number;
    y: number;
    yaw?: number;
}

/**
 * Convert Canvas Pixel (px, py) to ROS World (x, y) meters
 */
export function pixelToWorld(
    px: number,
    py: number,
    imgHeight: number,
    resolution: number,
    origin: [number, number, number] | MapOrigin
): Point2D {
    const originX = Array.isArray(origin) ? origin[0] : origin.x;
    const originY = Array.isArray(origin) ? origin[1] : origin.y;

    const x = originX + px * resolution;
    const y = originY + (imgHeight - py) * resolution;

    return {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
    };
}

/**
 * Convert ROS World (x, y) meters to Canvas Pixel (px, py)
 */
export function worldToPixel(
    x: number,
    y: number,
    imgHeight: number,
    resolution: number,
    origin: [number, number, number] | MapOrigin
): PixelPoint {
    const originX = Array.isArray(origin) ? origin[0] : origin.x;
    const originY = Array.isArray(origin) ? origin[1] : origin.y;

    const px = (x - originX) / resolution;
    const py = imgHeight - (y - originY) / resolution;

    return {
        px: Number(px.toFixed(2)),
        py: Number(py.toFixed(2)),
    };
}

export function radiansToDegrees(rad: number): number {
    return Number(((rad * 180) / Math.PI).toFixed(2));
}

export function degreesToRadians(deg: number): number {
    return Number(((deg * Math.PI) / 180).toFixed(4));
}
