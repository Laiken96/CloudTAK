import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KV from './kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from './fire-grids.ts';
import { FIRE_GRID_DEFAULTS, fireGridCenter } from '../utils/fire-grid.ts';
import { lv95ToWgs } from '../utils/lv95.ts';
import { fakeTargetHost } from '../test/fixtures/fire-grid-target-host.ts';
import type { EfpTargetFeature } from '../utils/efp-package.ts';

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
        FireGrids.targetHost = null;
    });

    it('stores a grid on this device', async () => {
        const grid = await FireGrids.add({ name: ' EFP MERKUR ', ...P });

        expect(grid.name).toEqual('EFP MERKUR');
        expect(grid.visible).toBe(true);
        expect(grid.targets).toEqual([]);

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

    it('reads the targets of a stored grid, also from grids stored before targets', () => {
        const stored = JSON.stringify([
            { id: 'old', name: 'Before targets', visible: true, ...P },
            { id: 'efp', name: 'EFP', visible: true, ...P, targets: ['Z01', 'Z02', 'Z01', '', 7, null] },
            { id: 'bad', name: 'Bad list', visible: true, ...P, targets: 'Z01' },
        ]);

        expect(FireGrids.parse(stored).map((g) => [g.id, g.targets])).toEqual([
            ['old', []],
            ['efp', ['Z01', 'Z02']],
            ['bad', []],
        ]);
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

describe('FireGrids targets', () => {
    const target = (uid: string): EfpTargetFeature => ({ id: uid } as EfpTargetFeature);

    beforeEach(async () => {
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
        FireGrids.targetHost = null;
    });

    it('binds targets to a grid and keeps them after a restart', async () => {
        const host = fakeTargetHost();
        FireGrids.targetHost = host;

        const grid = await FireGrids.add({ name: 'EFP', ...P });
        const bound = await FireGrids.bindTargets(grid.id, ['Z01', 'Z02', 'Z01']);

        expect(bound.targets).toEqual(['Z01', 'Z02']);
        // A shown grid shows its targets
        expect(host.setHidden).toHaveBeenLastCalledWith(['Z01', 'Z02'], false);

        await FireGrids.bindTargets(grid.id, ['Z02', 'Z03']);

        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
        expect((await FireGrids.load())[0].targets).toEqual(['Z01', 'Z02', 'Z03']);
    });

    it('moves a target bound to another grid: a target belongs to one grid', async () => {
        FireGrids.targetHost = fakeTargetHost();

        const a = await FireGrids.add({ name: 'A', ...P });
        const b = await FireGrids.add({ name: 'B', ...P, z: 125 });

        await FireGrids.bindTargets(a.id, ['Z01', 'Z02']);
        await FireGrids.bindTargets(b.id, ['Z02']);

        expect(FireGrids.state.grids.map((g) => [g.name, g.targets])).toEqual([
            ['A', ['Z01']],
            ['B', ['Z02']],
        ]);
    });

    it('hides and shows its targets with the grid', async () => {
        const host = fakeTargetHost();
        FireGrids.targetHost = host;

        const grid = await FireGrids.add({ name: 'EFP', ...P });
        await FireGrids.bindTargets(grid.id, ['Z01', 'Z02']);

        await FireGrids.update(grid.id, { visible: false });
        expect([...host.hidden]).toEqual(['Z01', 'Z02']);

        // Renaming leaves the targets alone
        vi.mocked(host.setHidden).mockClear();
        await FireGrids.update(grid.id, { name: 'EFP 2' });
        expect(host.setHidden).not.toHaveBeenCalled();

        await FireGrids.update(grid.id, { visible: true });
        expect([...host.hidden]).toEqual([]);
    });

    it('binds targets to a hidden grid as hidden', async () => {
        const host = fakeTargetHost();
        FireGrids.targetHost = host;

        const grid = await FireGrids.add({ name: 'EFP', ...P, visible: false });
        await FireGrids.bindTargets(grid.id, ['Z01']);

        expect([...host.hidden]).toEqual(['Z01']);
    });

    it('shows a hidden grid with its targets when it is taken over again', async () => {
        const host = fakeTargetHost();
        FireGrids.targetHost = host;

        const grid = await FireGrids.add({ name: 'EFP', ...P });
        await FireGrids.bindTargets(grid.id, ['Z01']);
        await FireGrids.update(grid.id, { visible: false });

        const { added } = await FireGrids.ensure({ name: 'Same cells', ...P });

        expect(added).toBe(false);
        expect(FireGrids.state.grids[0].visible).toBe(true);
        expect([...host.hidden]).toEqual([]);
    });

    it('deletes the grid with its targets on this device', async () => {
        const host = fakeTargetHost();
        FireGrids.targetHost = host;
        await host.put(target('Z01'));
        await host.put(target('Z02'));
        await host.put(target('other'));

        const grid = await FireGrids.add({ name: 'EFP', ...P });
        // Z03 was deleted on its own before
        await FireGrids.bindTargets(grid.id, ['Z01', 'Z02', 'Z03']);
        await FireGrids.update(grid.id, { visible: false });

        expect(await FireGrids.targetCount(FireGrids.state.grids[0])).toBe(2);

        await FireGrids.remove(grid.id);

        expect(FireGrids.state.grids).toEqual([]);
        expect([...host.features.keys()]).toEqual(['other']);
        expect(host.remove).toHaveBeenCalledTimes(2);
        // Not left hidden for a later import of the same targets
        expect([...host.hidden]).toEqual([]);
    });

    it('deletes a grid without targets without the map', async () => {
        const grid = await FireGrids.add({ name: 'Own', ...P });

        await FireGrids.remove(grid.id);
        expect(FireGrids.state.grids).toEqual([]);
    });

    it('keeps a grid with targets while the map is not ready', async () => {
        const grid = await FireGrids.add({ name: 'EFP', ...P, targets: ['Z01'] });

        await expect(FireGrids.remove(grid.id)).rejects.toThrow('The map is not ready');
        expect(FireGrids.state.grids).toHaveLength(1);
        expect(await FireGrids.targetCount(grid)).toBe(0);
    });
});
