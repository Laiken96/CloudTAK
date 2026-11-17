import { reactive } from 'vue';
import { v4 as randomUUID } from 'uuid';
import KV from './kv.ts';
import {
    cellAt,
    designation,
    inGrid,
    parseDesignation,
    spoken,
    validateFireGrid,
    type FireGridCell,
    type FireGridParams,
} from '../utils/fire-grid.ts';

/**
 * Fire grids (Einheitsfeuerplan rasters) shown on the map. Kept on this device
 * only (Dexie KV): a grid is a handful of numbers, shared as an Einheitsfeuerplan
 * link rather than as map data.
 */

export interface FireGrid extends FireGridParams {
    id: string;
    name: string;
    visible: boolean;
}

/** A cell or fine field found in a grid */
export interface FireGridHit {
    grid: FireGrid;
    cell: FireGridCell;
    /** `D2/6` */
    designation: string;
    /** `Delta Two Six` */
    spoken: string;
}

export const FIRE_GRIDS_KEY = 'fire-grids';

/** Magenta of the Einheitsfeuerplan grid */
export const FIRE_GRID_COLOR = '#e91e8c';

const state = reactive<{ loaded: boolean; grids: FireGrid[] }>({
    loaded: false,
    grids: []
});

let loading: Promise<FireGrid[]> | null = null;

export default class FireGrids {
    /** Reactive list, filled by load() */
    static readonly state = state;

    /** Parse a stored list, dropping malformed entries and repeated ids */
    static parse(value: string | undefined): FireGrid[] {
        if (!value) return [];

        let raw: unknown;
        try {
            raw = JSON.parse(value);
        } catch {
            return [];
        }

        if (!Array.isArray(raw)) return [];

        const seen = new Set<string>();
        const list: FireGrid[] = [];

        for (const entry of raw) {
            if (!entry || typeof entry !== 'object') continue;
            const g = entry as Partial<FireGrid>;

            if (typeof g.id !== 'string' || !g.id || seen.has(g.id)) continue;

            const params = { e0: Number(g.e0), n0: Number(g.n0), z: Number(g.z), ncols: Number(g.ncols), nrows: Number(g.nrows) };
            if (validateFireGrid(params).length) continue;

            seen.add(g.id);
            list.push({
                id: g.id,
                name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : 'Fire Grid',
                visible: g.visible !== false,
                ...params
            });
        }

        return list;
    }

    /** Read the stored grids once; later calls return the same list */
    static async load(): Promise<FireGrid[]> {
        if (state.loaded) return state.grids;

        if (!loading) {
            loading = (async () => {
                try {
                    state.grids = this.parse(await KV.value(FIRE_GRIDS_KEY));
                } catch (err) {
                    console.error('Failed to load fire grids', err);
                    state.grids = [];
                }

                state.loaded = true;
                return state.grids;
            })().finally(() => {
                loading = null;
            });
        }

        return await loading;
    }

    private static async persist(): Promise<void> {
        await KV.update(FIRE_GRIDS_KEY, JSON.stringify(state.grids));
    }

    /** Add a grid; throws with the validation messages if the parameters are invalid */
    static async add(grid: Omit<FireGrid, 'id' | 'visible'> & { visible?: boolean }): Promise<FireGrid> {
        await this.load();

        const errors = validateFireGrid(grid);
        if (errors.length) throw new Error(errors.join(' · '));

        const entry: FireGrid = {
            id: randomUUID(),
            name: grid.name.trim() || 'Fire Grid',
            visible: grid.visible !== false,
            e0: grid.e0,
            n0: grid.n0,
            z: grid.z,
            ncols: grid.ncols,
            nrows: grid.nrows
        };

        state.grids = [...state.grids, entry];
        await this.persist();

        return entry;
    }

    /** Change a grid; throws with the validation messages if the result is invalid */
    static async update(id: string, patch: Partial<Omit<FireGrid, 'id'>>): Promise<FireGrid> {
        await this.load();

        const current = state.grids.find((g) => g.id === id);
        if (!current) throw new Error('Fire grid not found');

        const next: FireGrid = { ...current, ...patch, id };
        if (typeof next.name === 'string') next.name = next.name.trim() || 'Fire Grid';

        const errors = validateFireGrid(next);
        if (errors.length) throw new Error(errors.join(' · '));

        state.grids = state.grids.map((g) => g.id === id ? next : g);
        await this.persist();

        return next;
    }

    static async remove(id: string): Promise<void> {
        await this.load();

        state.grids = state.grids.filter((g) => g.id !== id);
        await this.persist();
    }

    static hit(grid: FireGrid, cell: FireGridCell): FireGridHit {
        return { grid, cell, designation: designation(cell), spoken: spoken(cell) };
    }

    /** The fine field at a position in every visible grid */
    static locate(lng: number, lat: number): FireGridHit[] {
        const hits: FireGridHit[] = [];

        for (const grid of state.grids) {
            if (!grid.visible) continue;

            const cell = cellAt(grid, lng, lat);
            if (cell) hits.push(this.hit(grid, cell));
        }

        return hits;
    }

    /** A designation (`D2`, `D2/6`) in every visible grid that holds it */
    static find(text: string): FireGridHit[] {
        const cell = parseDesignation(text);
        if (!cell) return [];

        return state.grids
            .filter((grid) => grid.visible && inGrid(grid, cell))
            .map((grid) => this.hit(grid, cell));
    }
}
