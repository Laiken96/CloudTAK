import { reactive } from 'vue';
import KV from './kv.ts';
import { GRID_TYPES, type GridType } from '../utils/grid-lines.ts';

/**
 * Grid line preferences, as in ATAK's Overlay Manager ("Grid Lines") and its
 * grid line preferences: shown or not, MGRS or a latitude/longitude graticule,
 * and the line colour. Kept on this device (Dexie KV).
 */

export interface GridLinesSettings {
    visible: boolean;
    type: GridType;
    /** `#rrggbb` */
    color: string;
}

export const GRID_LINES_KEY = 'grid-lines';

/** ATAK's defaults: off, MGRS, white */
export const GRID_LINES_DEFAULTS: GridLinesSettings = {
    visible: false,
    type: 'MGRS',
    color: '#ffffff'
};

const state = reactive<GridLinesSettings & { loaded: boolean }>({
    loaded: false,
    ...GRID_LINES_DEFAULTS
});

let loading: Promise<GridLinesSettings> | null = null;

function current(): GridLinesSettings {
    return { visible: state.visible, type: state.type, color: state.color };
}

export default class GridLines {
    /** Reactive settings, filled by load() */
    static readonly state = state;

    /** Read stored settings, falling back to the defaults for anything malformed */
    static parse(value: string | undefined): GridLinesSettings {
        let raw: Partial<GridLinesSettings> = {};

        if (value) {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object') raw = parsed;
            } catch {
                raw = {};
            }
        }

        return {
            visible: typeof raw.visible === 'boolean' ? raw.visible : GRID_LINES_DEFAULTS.visible,
            type: GRID_TYPES.includes(raw.type as GridType) ? raw.type as GridType : GRID_LINES_DEFAULTS.type,
            color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : GRID_LINES_DEFAULTS.color
        };
    }

    static async load(): Promise<GridLinesSettings> {
        if (state.loaded) return current();
        if (loading) return loading;

        loading = (async () => {
            const settings = GridLines.parse(await KV.value(GRID_LINES_KEY));
            Object.assign(state, settings, { loaded: true });
            return settings;
        })();

        try {
            return await loading;
        } finally {
            loading = null;
        }
    }

    static async update(patch: Partial<GridLinesSettings>): Promise<GridLinesSettings> {
        await GridLines.load();

        const settings = GridLines.parse(JSON.stringify({ ...current(), ...patch }));
        Object.assign(state, settings);
        await KV.update(GRID_LINES_KEY, JSON.stringify(settings));

        return settings;
    }
}
