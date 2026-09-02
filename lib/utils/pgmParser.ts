/**
 * PGM Image Parser for HTML5 Canvas
 * Supports Binary (P5) and ASCII (P2) Grayscale Portable Graymap formats.
 */

export interface ParsedPgm {
    width: number;
    height: number;
    maxVal: number;
    pixels: Uint8ClampedArray; // RGBA pixel buffer ready for ctx.putImageData()
}

export function parsePgm(buffer: ArrayBuffer): ParsedPgm {
    const data = new Uint8Array(buffer);
    let offset = 0;

    const skipWhitespaceAndComments = () => {
        while (offset < data.length) {
            while (offset < data.length && data[offset] <= 32) offset++;
            if (offset < data.length && data[offset] === 35) { // '#'
                while (offset < data.length && data[offset] !== 10) offset++;
            } else {
                break;
            }
        }
    };

    const readToken = (): string => {
        skipWhitespaceAndComments();
        let token = '';
        while (offset < data.length && data[offset] > 32) {
            token += String.fromCharCode(data[offset++]);
        }
        return token;
    };

    const magic = readToken();
    if (magic !== 'P5' && magic !== 'P2') {
        throw new Error(`Unsupported PGM format magic number: ${magic}. Expected P5 or P2.`);
    }

    const width = parseInt(readToken(), 10);
    const height = parseInt(readToken(), 10);
    const maxVal = parseInt(readToken(), 10);

    if (isNaN(width) || isNaN(height) || isNaN(maxVal) || width <= 0 || height <= 0) {
        throw new Error('Invalid PGM dimensions or max value');
    }

    if (offset < data.length && data[offset] <= 32) offset++; // skip single delimiter space

    const totalPixels = width * height;
    const rgba = new Uint8ClampedArray(totalPixels * 4);

    if (magic === 'P5') {
        // Binary P5 format
        for (let i = 0; i < totalPixels; i++) {
            if (offset >= data.length) break;
            let val = data[offset++];
            if (maxVal !== 255) {
                val = Math.floor((val / maxVal) * 255);
            }
            const idx = i * 4;
            rgba[idx] = val;     // R
            rgba[idx + 1] = val; // G
            rgba[idx + 2] = val; // B
            rgba[idx + 3] = 255; // A
        }
    } else {
        // ASCII P2 format
        for (let i = 0; i < totalPixels; i++) {
            const token = readToken();
            if (!token) break;
            let val = parseInt(token, 10);
            if (maxVal !== 255) {
                val = Math.floor((val / maxVal) * 255);
            }
            const idx = i * 4;
            rgba[idx] = val;     // R
            rgba[idx + 1] = val; // G
            rgba[idx + 2] = val; // B
            rgba[idx + 3] = 255; // A
        }
    }

    return {
        width,
        height,
        maxVal,
        pixels: rgba,
    };
}
