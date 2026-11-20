import { reactive } from 'vue';
import { v4 as randomUUID } from 'uuid';
import KV from './kv.ts';
import type { FireGridTargetHost } from './fire-grid-targets.ts';
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
 *
 * A grid imported from an Einheitsfeuerplan data package owns its targets:
 * local features of this device (see fire-grid-targets.ts) that are shown and
 * hidden with the grid and deleted with it.
 */

export interface FireGrid extends FireGridParams {
    id: string;
    name: string;
    visible: boolean;
    /** UIDs of the targets that belong to this grid */
    targets: string[];
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

/** Distinct, non-empty UIDs of a stored target list */
function uids(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0))];
}

export default class FireGrids {
    /** Reactive list, filled by load() */
    static readonly state = state;

    /**
     * Where the targets of the grids live, set by the map once it runs. Showing,
     * hiding and deleting a grid with targets goes through it.
     */
    static targetHost: FireGridTargetHost | null = null;

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
                ...params,
                targets: uids(g.targets)
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
    static async add(grid: Omit<FireGrid, 'id' | 'visible' | 'targets'> & { visible?: boolean; targets?: string[] }): Promise<FireGrid> {
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
            nrows: grid.nrows,
            targets: uids(grid.targets)
        };

        state.grids = [...state.grids, entry];
        await this.persist();

        return entry;
    }

    /** The stored grid with the same cells as `P`, if any */
    static same(P: FireGridParams): FireGrid | undefined {
        return state.grids.find((g) => g.e0 === P.e0 && g.n0 === P.n0 && g.z === P.z
            && g.ncols === P.ncols && g.nrows === P.nrows);
    }

    /**
     * Take over a grid from elsewhere (an Einheitsfeuerplan file or object):
     * a grid with the same cells is kept and shown instead of added again
     */
    static async ensure(grid: Omit<FireGrid, 'id' | 'visible' | 'targets'>): Promise<{ grid: FireGrid; added: boolean }> {
        await this.load();

        const existing = this.same(grid);
        if (existing) {
            return { grid: existing.visible ? existing : await this.update(existing.id, { visible: true }), added: false };
        }

        return { grid: await this.add(grid), added: true };
    }

    /**
     * Change a grid; throws with the validation messages if the result is invalid.
     * Showing or hiding the grid shows or hides its targets as well.
     */
    static async update(id: string, patch: Partial<Omit<FireGrid, 'id'>>): Promise<FireGrid> {
        await this.load();

        const current = state.grids.find((g) => g.id === id);
        if (!current) throw new Error('Fire grid not found');

        const next: FireGrid = { ...current, ...patch, id };
        if (typeof next.name === 'string') next.name = next.name.trim() || 'Fire Grid';
        next.targets = uids(next.targets);

        const errors = validateFireGrid(next);
        if (errors.length) throw new Error(errors.join(' · '));

        state.grids = state.grids.map((g) => g.id === id ? next : g);
        await this.persist();

        if (next.visible !== current.visible && next.targets.length) {
            this.targetHost?.setHidden(next.targets, !next.visible);
        }

        return next;
    }

    /**
     * Make targets belong to a grid (added to its list, taken off any other
     * grid: a target belongs to one grid). Their visibility follows the grid.
     */
    static async bindTargets(id: string, targets: string[]): Promise<FireGrid> {
        await this.load();

        const current = state.grids.find((g) => g.id === id);
        if (!current) throw new Error('Fire grid not found');

        const bound = new Set(uids(targets));
        if (!bound.size) return current;

        state.grids = state.grids.map((g) => {
            if (g.id === id) return { ...g, targets: uids([...g.targets, ...bound]) };
            if (g.targets.some((uid) => bound.has(uid))) return { ...g, targets: g.targets.filter((uid) => !bound.has(uid)) };
            return g;
        });
        await this.persist();

        const next = state.grids.find((g) => g.id === id) as FireGrid;
        this.targetHost?.setHidden([...bound], !next.visible);

        return next;
    }

    /** How many targets of the grid are on this device as features */
    static async targetCount(grid: FireGrid): Promise<number> {
        const host = this.targetHost;
        if (!host || !grid.targets.length) return 0;

        const present = await Promise.all(grid.targets.map((uid) => host.has(uid)));
        return present.filter(Boolean).length;
    }

    /**
     * Delete a grid together with its targets. Only local features of this
     * device are deleted: a mission feature with the same UID stays.
     */
    static async remove(id: string): Promise<void> {
        await this.load();

        const grid = state.grids.find((g) => g.id === id);

        if (grid && grid.targets.length) {
            const host = this.targetHost;
            if (!host) throw new Error('The map is not ready, the targets of the grid cannot be deleted yet');

            for (const uid of grid.targets) {
                if (await host.has(uid)) await host.remove(uid);
            }

            // Hidden with the grid: forget it, the UID may come back with a new import
            host.setHidden(grid.targets, false);
        }

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
