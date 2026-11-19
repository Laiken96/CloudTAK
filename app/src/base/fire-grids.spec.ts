import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import KV from './kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from './fire-grids.ts';
import { FIRE_GRID_DEFAULTS, fireGridCenter } from '../utils/fire-grid.ts';
import { lv95ToWgs } from '../utils/lv95.ts';

const P = FIRE_GRID_DEFAULTS;

/** Map position of the centre of a fine field in the default grid */
function position(i: number, j: number, k: number): [number, number] {
    const [E, N] = fireGridCenter(P, { i, j, k });
    const [lat, lng] = lv95ToWgs(E, N);
    return [lng, lat];
}

describe('FireGrids', () => {
    beforeEach(async () => {
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
    });

    it('stores a grid on this device', async () => {
        const grid = await FireGrids.add({ name: ' EFP MERKUR ', ...P });

        expect(grid.name).toEqual('EFP MERKUR');
        expect(grid.visible).toBe(true);

        FireGrids.state.loaded = false;
        expect(await FireGrids.load()).toEqual([grid]);
        expect(JSON.parse(await KV.value(FIRE_GRIDS_KEY) as string)).toEqual([grid]);
    });

    it('refuses an invalid grid', async () => {
        await expect(FireGrids.add({ name: 'Bad', ...P, z: 300 })).rejects.toThrow('Cell size');
        expect(FireGrids.state.grids).toEqual([]);
    });

    it('changes and removes a grid', async () => {
        const grid = await FireGrids.add({ name: 'A', ...P });

        await FireGrids.update(grid.id, { visible: false, ncols: 30 });
        expect(FireGrids.state.grids[0]).toMatchObject({ visible: false, ncols: 30 });

        await expect(FireGrids.update(grid.id, { ncols: 100 })).rejects.toThrow('Columns');

        await FireGrids.remove(grid.id);
        expect(FireGrids.state.grids).toEqual([]);
    });

    it('drops malformed stored entries', () => {
        const stored = JSON.stringify([
            { id: 'a', name: 'A', visible: true, ...P },
            { id: 'a', name: 'Repeated', ...P },
            { id: 'b', name: 'Bad size', ...P, z: 300 },
            { name: 'No id', ...P },
            'nonsense',
        ]);

        expect(FireGrids.parse(stored).map((g) => g.name)).toEqual(['A']);
        expect(FireGrids.parse('not json')).toEqual([]);
    });

    it('reads a map position as a fine field of every shown grid', async () => {
        const grid = await FireGrids.add({ name: 'A', ...P });

        const [lng, lat] = position(4, 2, 6);
        expect(FireGrids.locate(lng, lat).map((h) => [h.designation, h.spoken])).toEqual([['D2/6', 'Delta Two Six']]);

        await FireGrids.update(grid.id, { visible: false });
        expect(FireGrids.locate(lng, lat)).toEqual([]);
    });

    it('finds a designation only in the shown grids that hold it', async () => {
        await FireGrids.add({ name: 'Small', ...P, ncols: 3, nrows: 3 });
        await FireGrids.add({ name: 'Large', ...P });

        expect(FireGrids.find('d2/6').map((h) => h.grid.name)).toEqual(['Large']);
        expect(FireGrids.find('B2').map((h) => h.grid.name)).toEqual(['Small', 'Large']);
        expect(FireGrids.find('Pz Kp 2')).toEqual([]);
    });
});
