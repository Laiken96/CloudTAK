import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import KV from './kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from './fire-grids.ts';
import { importEfpPackage } from './efp-import.ts';
import { readEfpPackage, type EfpTargetFeature } from '../utils/efp-package.ts';
import { efpFixture } from '../test/fixtures/efp-fixture.ts';

/** Feature store keyed by id, as the map database stores features */
function store(): { features: Map<string, EfpTargetFeature>; add: (f: EfpTargetFeature) => Promise<void> } {
    const features = new Map<string, EfpTargetFeature>();
    return {
        features,
        add: async (f) => {
            features.set(f.id, f);
        }
    };
}

describe('importEfpPackage', () => {
    beforeEach(async () => {
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
    });

    it('adds the grid as a fire grid and the targets as features', async () => {
        const db = store();
        const result = await importEfpPackage(readEfpPackage(efpFixture()), db.add);

        expect(result.gridAdded).toBe(true);
        expect(FireGrids.state.grids).toEqual([
            expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12, visible: true })
        ]);
        expect([...db.features.values()].map((f) => f.properties.callsign)).toEqual(['Z01 B1/9', 'Z02 L7/5', 'Z03 D2/6', 'Z05']);

        // The fire grid finds the cell of the target
        const [lng, lat] = db.features.get('EFP-MERKUR-Inf-Kp-10-1-v2611190830-Z03')!.geometry.coordinates;
        expect(FireGrids.locate(lng, lat).map((h) => h.designation)).toEqual(['D2/6']);
    });

    it('imports the same file twice without doubles', async () => {
        const db = store();
        await importEfpPackage(readEfpPackage(efpFixture()), db.add);
        const again = await importEfpPackage(readEfpPackage(efpFixture()), db.add);

        expect(again.gridAdded).toBe(false);
        expect(again.targets).toHaveLength(4);
        expect(FireGrids.state.grids).toHaveLength(1);
        expect(db.features.size).toBe(4);
    });

    it('keeps a grid with the same cells and shows it again', async () => {
        const own = await FireGrids.add({ name: 'My grid', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 });
        await FireGrids.update(own.id, { visible: false });

        const result = await importEfpPackage(readEfpPackage(efpFixture()), store().add);

        expect(result.gridAdded).toBe(false);
        expect(FireGrids.state.grids).toEqual([expect.objectContaining({ id: own.id, name: 'My grid', visible: true })]);
    });
});
