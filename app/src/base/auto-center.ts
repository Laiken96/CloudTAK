/**
 * Auto Center: when the app opens, the map jumps to the own position.
 *
 * - Start: the known location (last fix of the profile, or the preset
 *   location) moves the map at once, a fresh GPS fix corrects it if it lies
 *   more than CORRECTION_M away. Zoom 14 like the "My Location" button, or
 *   closer if the map already is
 * - Back from the background after AWAY_MS: the same once more. iOS often
 *   keeps a home screen app in memory instead of starting it anew
 * - Never against the user: once the map moved since the start or since the
 *   last jump (pan, zoom, a link flying to an object) it stays where it is.
 *   A resize keeps the center, so the iOS viewport settling is no move
 * - Only within WINDOW_MS: a fix arriving much later would surprise
 * - A reload shortly after leaving (the update banner) keeps the position
 *   from the URL hash. A hash with other data (an EFP fire grid link) is
 *   never overridden
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

export const AUTO_CENTER_ZOOM = 14;
export const WINDOW_MS = 60_000;
export const AWAY_MS = 5 * 60_000;
export const CORRECTION_M = 100;
export const HIDDEN_AT_KEY = 'cloudtak-hidden-at';

export type LngLat = [number, number];

type AutoCenterMap = Pick<MapLibreMap, 'getCenter' | 'getZoom' | 'jumpTo'>;
type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

/** MapLibre position hash: zoom/lat/lng, optionally bearing and pitch */
const POSITION_HASH = /^#?-?\d+(\.\d+)?(\/-?\d+(\.\d+)?){2,4}$/;

/** Below this the map has not moved: floating point noise of a resize */
const CENTER_EPSILON = 1e-7;
const ZOOM_EPSILON = 1e-3;

/** localStorage, or null where it is blocked */
export function localStore(): KeyStore | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** True if the app was hidden at least AWAY_MS ago, or never before */
export function awayLongEnough(storage: KeyStore | null, now: number): boolean {
    let at = NaN;
    try {
        at = Number(storage?.getItem(HIDDEN_AT_KEY));
    } catch {
        // Unreadable: treat as never hidden
    }

    if (!Number.isFinite(at) || at <= 0) return true;
    return now - at >= AWAY_MS;
}

/**
 * May this start jump? Decided before the map reads the URL hash.
 * - No hash: the map opens on the default view, so jump
 * - A position hash: the view was restored (reload, or iOS restoring the URL),
 *   jump only if the app was away long enough
 * - Any other hash: a link with its own purpose, never jump
 */
export function armedAtBoot(hash: string, awayLong: boolean): boolean {
    if (!hash || hash === '#') return true;
    if (!POSITION_HASH.test(hash)) return false;
    return awayLong;
}

function validCoord(coord: LngLat | null | undefined): coord is LngLat {
    if (!coord) return false;
    const [lng, lat] = coord;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    // The worker reports [0, 0] for "no location"
    return !(lng === 0 && lat === 0);
}

/** Distance in metres, accurate enough to tell a correction from GPS noise */
export function distanceM(a: LngLat, b: LngLat): number {
    const rad = Math.PI / 180;
    const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
    const y = (b[1] - a[1]) * rad;
    return Math.sqrt(x * x + y * y) * 6_371_000;
}

export interface AutoCenter {
    /**
     * A position to center on. `fresh` is a GPS fix of this device just now,
     * otherwise a last known or preset location. True if the map jumped.
     */
    offer(coord: LngLat | null | undefined, fresh: boolean): boolean;
    /** Arm again from the current view, e.g. back from the background */
    arm(): void;
    /** Stop waiting for a position */
    disarm(): void;
    readonly armed: boolean;
}

export function createAutoCenter(
    map: AutoCenterMap,
    opts: { armed: boolean; now?: () => number }
): AutoCenter {
    const now = opts.now ?? Date.now;

    /** Where the map was when armed or last jumped - any other view is a move */
    let reference: { lng: number; lat: number; zoom: number } | null = null;
    let until = 0;
    /** Last position jumped to, from a location that was not a fresh fix */
    let provisional: LngLat | null = null;

    function remember(): void {
        const center = map.getCenter();
        reference = { lng: center.lng, lat: center.lat, zoom: map.getZoom() };
    }

    function moved(): boolean {
        if (!reference) return true;
        const center = map.getCenter();
        return Math.abs(center.lng - reference.lng) > CENTER_EPSILON
            || Math.abs(center.lat - reference.lat) > CENTER_EPSILON
            || Math.abs(map.getZoom() - reference.zoom) > ZOOM_EPSILON;
    }

    function arm(): void {
        remember();
        until = now() + WINDOW_MS;
        provisional = null;
    }

    function disarm(): void {
        reference = null;
        provisional = null;
    }

    if (opts.armed) arm();

    return {
        get armed() {
            return reference !== null && now() <= until;
        },
        arm,
        disarm,
        offer(coord, fresh) {
            if (!reference) return false;

            if (now() > until || moved()) {
                disarm();
                return false;
            }

            if (!validCoord(coord)) return false;

            // Already shown from a known location: a fix nearby changes nothing
            if (provisional && distanceM(provisional, coord) < CORRECTION_M) {
                if (fresh) disarm();
                return false;
            }

            map.jumpTo({
                center: [coord[0], coord[1]],
                zoom: Math.max(map.getZoom(), AUTO_CENTER_ZOOM)
            });

            if (fresh) {
                disarm();
            } else {
                // Wait for a fresh fix that may correct a stale location
                remember();
                provisional = [coord[0], coord[1]];
            }

            return true;
        }
    };
}

/**
 * Note when the app is hidden, call `onBack` when it shows again after
 * AWAY_MS. Returns the function that stops watching.
 */
export function watchAway(
    doc: Document,
    storage: KeyStore | null,
    onBack: () => void,
    now: () => number = Date.now
): () => void {
    let hiddenAt: number | null = null;

    function hidden(): void {
        hiddenAt = now();
        try {
            storage?.setItem(HIDDEN_AT_KEY, String(hiddenAt));
        } catch {
            // Full or blocked: the in-memory time still serves a resume
        }
    }

    function onVisibility(): void {
        if (doc.visibilityState === 'hidden') {
            hidden();
        } else if (hiddenAt !== null) {
            const away = now() - hiddenAt;
            hiddenAt = null;
            if (away >= AWAY_MS) onBack();
        }
    }

    const view = doc.defaultView;

    doc.addEventListener('visibilitychange', onVisibility);
    view?.addEventListener('pagehide', hidden);

    return () => {
        doc.removeEventListener('visibilitychange', onVisibility);
        view?.removeEventListener('pagehide', hidden);
    };
}
