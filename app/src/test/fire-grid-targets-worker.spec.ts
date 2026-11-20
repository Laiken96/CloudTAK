import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
    GET: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    PATCH: vi.fn(),
}));

vi.mock('../std.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../std.ts')>()),
    server,
}));

const setFeaturesHidden = vi.hoisted(() => vi.fn());
vi.mock('../stores/modules/feature-visibility.ts', () => ({
    FeatureVisibility: { setFeaturesHidden },
}));

import { db } from '../database.ts';
import AtlasDatabase from '../workers/atlas-database.ts';
import Subscription from '../base/subscription.ts';
import FeatureOutbox from '../base/feature-outbox.ts';
import { OriginMode } from '../base/cot.ts';
import KV from '../base/kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from '../base/fire-grids.ts';
import { importEfpPackage } from '../base/efp-import.ts';
import { mapTargetHost } from '../stores/modules/fire-grid-targets.ts';
import { efpTargetFeature, readEfpPackage, type EfpTargetFeature } from '../utils/efp-package.ts';
import { EFP_FIXTURE_UID as UID, efpFixture } from './fixtures/efp-fixture.ts';
import type Atlas from '../workers/atlas.ts';
import type { useMapStore } from '../stores/map.ts';

const GUID = 'active-mission';

/**
 * The map database of the worker with an active mission (Data Sync), as on
 * the device of the user, behind the target host the fire grids use
 */
function setup() {
    const atlas = {
        token: 'token',
        postMessage: vi.fn(async () => undefined),
        profile: {
            creator: async () => ({ uid: 'me', type: 'a-f-G-E-V-C', callsign: 'ME', time: '2026-01-01T00:00:00Z' }),
        },
    } as unknown as Atlas;

    const sub = {
        feature: {
            update: vi.fn(async () => undefined),
            delete: vi.fn(async () => undefined),
        },
    };
    vi.spyOn(Subscription, 'from').mockResolvedValue(sub as unknown as Subscription);

    const store = new AtlasDatabase(atlas);
    store.mission = GUID;

    const host = mapTargetHost({ worker: { db: store } } as unknown as ReturnType<typeof useMapStore>);

    return { store, sub, host };
}

/** A target of an import before the targets belonged to the grid: filed into the active mission */
async function inMission(feature: EfpTargetFeature): Promise<void> {
    await db.subscription.put({ guid: GUID, name: 'Data Sync Kp', subscribed: true } as never);
    await db.subscription_feature.put({
        id: feature.id,
        mission: GUID,
        path: feature.path,
        properties: feature.properties as never,
        geometry: feature.geometry,
        synced: true,
        deleted: false,
        attempts: 0
    });
}

beforeEach(async () => {
    await db.feature.clear();
    await db.subscription.clear();
    await db.subscription_feature.clear();
    await KV.delete(FIRE_GRIDS_KEY);
    FireGrids.state.loaded = false;
    FireGrids.state.grids = [];
    FeatureOutbox.pending.clear();
    FeatureOutbox.cancelRetry();
    server.PUT.mockReset();
    server.PUT.mockImplementation(async (_url: string, opts: { body: unknown }) => ({ data: opts.body, response: { status: 200 } }));
    setFeaturesHidden.mockClear();
});

afterEach(() => {
    FireGrids.targetHost = null;
    vi.restoreAllMocks();
});

describe('Fire grid targets in the map database', () => {
    it('stores the imported targets locally even with an active mission, and never sends them to the TAK Server', async () => {
        const { store, sub, host } = setup();
        FireGrids.targetHost = host;

        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);
        expect(result.targets).toHaveLength(4);

        for (const target of result.targets) {
            const cot = store.cots.get(target.id);
            expect(cot?.origin.mode).toBe(OriginMode.CONNECTION);
            expect(cot?.properties.archived).toBe(true);
        }

        // Nothing filed into or published to the active mission
        expect(Subscription.from).not.toHaveBeenCalled();
        expect(sub.feature.update).not.toHaveBeenCalled();
        expect(await db.subscription_feature.count()).toBe(0);

        // Kept as profile features of the user (they survive a restart), not submitted as CoTs
        await FeatureOutbox.push();
        expect(server.PUT).toHaveBeenCalledTimes(4);
        for (const [url, opts] of server.PUT.mock.calls) {
            expect(url).toBe('/api/profile/feature');
            expect(opts.params.query).toEqual({ broadcast: false, submit: false, archive: true });
        }
        expect(await db.feature.count()).toBe(4);
    });

    it('shows that the old import call filed a target into the active mission', async () => {
        const { store, sub } = setup();
        const [target] = readEfpPackage(efpFixture()).targets;

        // What the import did before: authored, so the worker files it into the Active Mission
        await store.add(efpTargetFeature({ name: 'pkg' }, target), { authored: true });

        expect(store.cots.has(target.uid)).toBe(false);
        expect(sub.feature.update).toHaveBeenCalledTimes(1);
    });

    it('finds a UID already in a mission before the local store, so the import leaves it there', async () => {
        const { store, sub, host } = setup();
        FireGrids.targetHost = host;

        const pkg = readEfpPackage(efpFixture());
        const old = efpTargetFeature(pkg, pkg.targets[0]);
        await inMission(old);

        // The map database resolves the UID to the mission feature: an import
        // through add() would update (and as authored, publish) the mission copy
        const existing = await store.get(old.id, { mission: true });
        expect(existing?.origin).toEqual({ mode: OriginMode.MISSION, mode_id: GUID });

        const result = await importEfpPackage(pkg, host);

        expect(result.inMission.map((m) => [m.target.id, m.mission.name])).toEqual([[old.id, 'Data Sync Kp']]);
        expect(store.cots.has(old.id)).toBe(false);
        expect(store.cots.size).toBe(3);
        expect(sub.feature.update).not.toHaveBeenCalled();
        expect(sub.feature.delete).not.toHaveBeenCalled();
        expect((await db.subscription_feature.get(old.id))?.deleted).toBe(false);
    });

    it('deletes the targets with the grid locally and leaves a mission feature with the same UID', async () => {
        const { store, sub, host } = setup();
        FireGrids.targetHost = host;

        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);
        const [first] = result.targets;
        // A copy of the first target in a mission (shared there by hand)
        await inMission(first);

        await FireGrids.remove(result.grid!.id);
        // The menu refreshes the map, which drops the deleted features from memory
        await store.diff();

        expect(FireGrids.state.grids).toEqual([]);
        expect(result.targets.every((t) => !store.cots.has(t.id))).toBe(true);
        expect(FeatureOutbox.isTombstone(first.id)).toBe(true);
        expect(sub.feature.delete).not.toHaveBeenCalled();
        expect((await db.subscription_feature.get(first.id))?.deleted).toBe(false);
        expect(setFeaturesHidden).toHaveBeenLastCalledWith(result.targets.map((t) => t.id), false);
    });

    it('hides and shows the targets on the map with the grid', async () => {
        const { host } = setup();
        FireGrids.targetHost = host;

        const result = await importEfpPackage(readEfpPackage(efpFixture()), host);
        const uids = result.targets.map((t) => t.id);

        await FireGrids.update(result.grid!.id, { visible: false });
        expect(setFeaturesHidden).toHaveBeenLastCalledWith(uids, true);

        await FireGrids.update(result.grid!.id, { visible: true });
        expect(setFeaturesHidden).toHaveBeenLastCalledWith(uids, false);
        expect(uids).toEqual(['Z01', 'Z02', 'Z03', 'Z05'].map((z) => `${UID}-${z}`));
    });
});
