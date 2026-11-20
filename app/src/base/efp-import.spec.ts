import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import KV from './kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from './fire-grids.ts';
import { importEfpPackage } from './efp-import.ts';
import { missionHolding } from './fire-grid-targets.ts';
import { db } from '../database.ts';
import { readEfpPackage } from '../utils/efp-package.ts';
import { EFP_FIXTURE_UID as UID, efpFixture } from '../test/fixtures/efp-fixture.ts';
import { fakeTargetHost } from '../test/fixtures/fire-grid-target-host.ts';

const TARGETS = ['Z01', 'Z02', 'Z03', 'Z05'].map((z) => `${UID}-${z}`);

describe('importEfpPackage', () => {
    let host: ReturnType<typeof fakeTargetHost>;

    beforeEach(async () => {
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];

        host = fakeTargetHost();
        FireGrids.targetHost = host;
    });

    it('adds the grid as a fire grid and the targets as local features that belong to it', async () => {
        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(result.gridAdded).toBe(true);
        expect(result.inMission).toEqual([]);
        expect(FireGrids.state.grids).toEqual([
            expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12, visible: true, targets: TARGETS })
        ]);
        expect(result.grid?.targets).toEqual(TARGETS);
        expect([...host.features.values()].map((f) => f.properties.callsign)).toEqual(['Z01 B1/9', 'Z02 L7/5', 'Z03 D2/6', 'Z05']);
        expect(host.hidden.size).toBe(0);

        // The fire grid finds the cell of the target
        const [lng, lat] = host.features.get(`${UID}-Z03`)!.geometry.coordinates;
        expect(FireGrids.locate(lng, lat).map((h) => h.designation)).toEqual(['D2/6']);
    });

    it('imports the same file twice without doubles', async () => {
        await importEfpPackage(readEfpPackage(efpFixture()), host);
        const again = await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(again.gridAdded).toBe(false);
        expect(again.targets).toHaveLength(4);
        expect(FireGrids.state.grids).toHaveLength(1);
        expect(FireGrids.state.grids[0].targets).toEqual(TARGETS);
        expect(host.features.size).toBe(4);
    });

    it('keeps a grid with the same cells and shows it again with its targets', async () => {
        const own = await FireGrids.add({ name: 'My grid', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 });
        await FireGrids.update(own.id, { visible: false });

        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(result.gridAdded).toBe(false);
        expect(FireGrids.state.grids).toEqual([expect.objectContaining({ id: own.id, name: 'My grid', visible: true, targets: TARGETS })]);
        expect(host.hidden.size).toBe(0);
    });

    it('shows the grid hidden since the last import together with its targets', async () => {
        const first = await importEfpPackage(readEfpPackage(efpFixture()), host);
        await FireGrids.update(first.grid!.id, { visible: false });
        expect(host.hidden.size).toBe(4);

        await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(FireGrids.state.grids[0].visible).toBe(true);
        expect(host.hidden.size).toBe(0);
    });

    it('leaves a target whose UID is in a mission there and reports it', async () => {
        // Targets of an import before they belonged to the grid
        const mission = { guid: 'mission-guid', name: 'Data Sync Kp' };
        host.missions.set(`${UID}-Z01`, mission);
        host.missions.set(`${UID}-Z02`, mission);

        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(result.inMission.map((m) => [m.target.properties.callsign, m.mission.name])).toEqual([
            ['Z01 B1/9', 'Data Sync Kp'],
            ['Z02 L7/5', 'Data Sync Kp'],
        ]);
        expect(result.targets.map((t) => t.id)).toEqual([`${UID}-Z03`, `${UID}-Z05`]);
        // No local copy with the UID of a mission feature, nothing deleted
        expect([...host.features.keys()]).toEqual([`${UID}-Z03`, `${UID}-Z05`]);
        expect(host.remove).not.toHaveBeenCalled();
        expect(FireGrids.state.grids[0].targets).toEqual([`${UID}-Z03`, `${UID}-Z05`]);

        // Deleted in the mission by hand: the next import takes them over
        host.missions.clear();
        const again = await importEfpPackage(readEfpPackage(efpFixture()), host);

        expect(again.inMission).toEqual([]);
        expect(FireGrids.state.grids[0].targets).toEqual([`${UID}-Z03`, `${UID}-Z05`, `${UID}-Z01`, `${UID}-Z02`]);
        expect(host.features.size).toBe(4);
    });

    it('adds the targets of a file without a grid as local features of their own', async () => {
        const pkg = { ...readEfpPackage(efpFixture()), grid: null };
        host.hidden.add(`${UID}-Z03`);

        const result = await importEfpPackage(pkg, host);

        expect(result.grid).toBeNull();
        expect(result.targets).toHaveLength(4);
        expect(FireGrids.state.grids).toEqual([]);
        expect(host.features.size).toBe(4);
        expect(host.features.get(`${UID}-Z03`)?.path).toEqual('/atak_paket_Inf-Kp-10-1_MERKUR_2026-11-19/');
        // An import shows what it brings
        expect(host.hidden.size).toBe(0);
    });

    it('adds a grid without targets', async () => {
        const pkg = { ...readEfpPackage(efpFixture()), targets: [] };

        const result = await importEfpPackage(pkg, host);

        expect(result.grid).toEqual(expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1', targets: [] }));
        expect(host.put).not.toHaveBeenCalled();
    });
});

describe('missionHolding', () => {
    beforeEach(async () => {
        await db.subscription.clear();
        await db.subscription_feature.clear();
    });

    async function missionFeature(id: string, mission: string, flags: { deleted?: boolean } = {}): Promise<void> {
        await db.subscription_feature.put({
            id,
            mission,
            path: '/',
            properties: {} as never,
            geometry: { type: 'Point', coordinates: [7.4, 46.9] },
            synced: true,
            deleted: flags.deleted ?? false,
            attempts: 0
        });
    }

    it('finds the subscribed mission that holds a UID', async () => {
        await db.subscription.put({ guid: 'm1', name: 'Data Sync Kp', subscribed: true } as never);
        await missionFeature(`${UID}-Z01`, 'm1');

        expect(await missionHolding(`${UID}-Z01`)).toEqual({ guid: 'm1', name: 'Data Sync Kp' });
        expect(await missionHolding(`${UID}-Z02`)).toBeNull();
    });

    it('ignores a feature deleted in the mission and missions no longer subscribed', async () => {
        await db.subscription.put({ guid: 'm1', name: 'Data Sync Kp', subscribed: true } as never);
        await db.subscription.put({ guid: 'm2', name: 'Old', subscribed: false } as never);
        await missionFeature(`${UID}-Z01`, 'm1', { deleted: true });
        await missionFeature(`${UID}-Z02`, 'm2');

        expect(await missionHolding(`${UID}-Z01`)).toBeNull();
        expect(await missionHolding(`${UID}-Z02`)).toBeNull();
    });
});
