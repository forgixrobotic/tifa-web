import fs from 'fs';
import path from 'path';

export interface CommunicationSettings {
    wsUrl: string;
    uiId: string;
    robotId: string;
    mapId: string;
    activeUserEmail?: string | null;
    isWsTurnedOn?: boolean;
    jwtToken?: string;
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'settings.json');

export function getSettings(): CommunicationSettings {
    try {
        if (fs.existsSync(SETTINGS_FILE_PATH)) {
            const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
            return JSON.parse(data) as CommunicationSettings;
        }
    } catch (err) {
        console.error('[Settings] Failed to read settings.json:', err);
    }
    
    // Default fallback
    return {
        wsUrl: process.env.WS_ROBOT_URL ?? 'wss://tifa-ws.forgixrobotic.com',
        uiId: 'TFWB1',
        robotId: 'TFRB1',
        mapId: '50',
        activeUserEmail: null,
        isWsTurnedOn: false
    };
}

export function saveSettings(settings: Partial<CommunicationSettings>): CommunicationSettings {
    const current = getSettings();
    const updated = { ...current, ...settings };
    
    try {
        const dir = path.dirname(SETTINGS_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
        console.error('[Settings] Failed to save settings.json:', err);
    }
    
    return updated;
}
