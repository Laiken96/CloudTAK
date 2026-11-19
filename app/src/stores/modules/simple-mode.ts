import { ref, readonly } from 'vue';

/**
 * Simple view: only the map, layers (Overlays, Basemaps), placing signatures
 * and the own position are shown. Chosen per device, like the language.
 */

export const SIMPLE_MODE_STORAGE_KEY = 'cloudtak-simple-mode';

/** Main menu entries kept in the simple view */
export const SIMPLE_MODE_MENU_KEYS: readonly string[] = ['overlays', 'basemaps', 'signatures'];

function stored(): boolean {
    try {
        return globalThis.localStorage?.getItem(SIMPLE_MODE_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

const enabled = ref<boolean>(stored());

/** Reactive, read only - change it with setSimpleMode() */
export const simpleMode = readonly(enabled);

export function isSimpleMode(): boolean {
    return enabled.value;
}

export function setSimpleMode(on: boolean): void {
    enabled.value = on;

    try {
        globalThis.localStorage?.setItem(SIMPLE_MODE_STORAGE_KEY, on ? 'true' : 'false');
    } catch {
        // Storage blocked: the choice lasts for this page only
    }
}

export function toggleSimpleMode(): boolean {
    setSimpleMode(!enabled.value);
    return enabled.value;
}

/** Whether a main menu entry is shown in the current view */
export function menuItemVisible(key: string): boolean {
    return !enabled.value || SIMPLE_MODE_MENU_KEYS.includes(key);
}
