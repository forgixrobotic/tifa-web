/**
 * Per-User Unique UI Client ID
 *
 * Generates a unique UI Client ID per user account + browser tab.
 * - Different user  → different ID  (based on email hash)
 * - Different tab   → different ID  (random suffix)
 * - Page refresh    → same ID       (sessionStorage persists within tab)
 * - Logout + login  → new ID        (sessionStorage cleared on login)
 *
 * Format: "TFWB_{emailHash}_{tabSuffix}" e.g. "TFWB_b7a1_3f8e"
 */

const SESSION_KEY = "tifa_ui_client_id";
const JWT_TOKEN_KEY = "tifa_jwt_token";

/**
 * Simple hash of a string to 4 hex chars.
 * Produces consistent output for the same input.
 */
function hashTo4Hex(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    // Take absolute value and convert to hex, pad to 4 chars
    return Math.abs(hash).toString(16).slice(0, 4).padStart(4, '0');
}

function generateTabSuffix(): string {
    return Math.random().toString(16).slice(2, 6);
}

/**
 * Generate and store a unique UI Client ID for this user + tab combination.
 * Call this after successful login to bind the ID to the user.
 */
export function initSessionUiId(userEmail: string, token?: string): string {
    if (typeof window === "undefined") return "TFWB_SSR";
    
    const emailHash = hashTo4Hex(userEmail);
    const tabSuffix = generateTabSuffix();
    const id = `TFWB_${emailHash}_${tabSuffix}`;
    
    sessionStorage.setItem(SESSION_KEY, id);
    if (token) {
        sessionStorage.setItem(JWT_TOKEN_KEY, token);
    }
    return id;
}

/**
 * Get the unique UI Client ID for this browser session (tab).
 * If not yet initialized (pre-login), returns a temporary ID.
 */
export function getSessionUiId(): string {
    if (typeof window === "undefined") {
        return "TFWB_SSR";
    }

    const id = sessionStorage.getItem(SESSION_KEY);
    if (id) return id;

    // Fallback: generate a temporary ID if not yet logged in
    const tempId = `TFWB_tmp_${generateTabSuffix()}`;
    sessionStorage.setItem(SESSION_KEY, tempId);
    return tempId;
}

/**
 * Get the active JWT token for this browser session.
 */
export function getSessionJwtToken(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(JWT_TOKEN_KEY);
}

/**
 * Store active JWT token for this browser session.
 */
export function setSessionJwtToken(token: string): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(JWT_TOKEN_KEY, token);
}

/**
 * Clear the session UI ID & JWT token (call on logout).
 */
export function clearSessionUiId(): void {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(JWT_TOKEN_KEY);
}

