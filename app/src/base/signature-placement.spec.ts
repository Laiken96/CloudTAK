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

import { db } from '../database.ts';
import AtlasDatabase from '../workers/atlas-database.ts';
import Subscription from './subscription.ts';
import FeatureOutbox from './feature-outbox.ts';
import { OriginMode } from './cot.ts';
import { WorkerMessageType } from '../utils/events.ts';
import type Atlas from '../workers/atlas.ts';
import type { Feature } from '../types.ts';
import {
    armSignature,
    armedSignature,
    attachPlacementHandler,
    disarmSignature,
    isSignatureArmed,
    placeSignature,
    signatureFeature,
    undoPlacement,
    type PlacementTarget,
} from './signature-placement.ts';

const SIDC = '10061000001211000000';
const GUID = 'mission-guid';
const NOW = new Date(2026, 10, 19, 14, 5, 0);

/** A map store whose worker is mocked - checks what a placement hands over */
function mockTarget(mission?: { guid: string; name: string }) {
    const add = vi.fn(async () => undefined);
    const remove = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => undefined);

    const target: PlacementTarget = {
        worker: { db: { add, remove } },
        refresh,
        mission: mission ? { meta: mission } : undefined,
    };

    return { target, add, remove, refresh };
}

/** A map store backed by the real worker store, as the app wires it */
function atlasTarget(mission?: { guid: string; name: string }) {
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

    const from = vi.spyOn(Subscription, 'from').mockImplementation(async () => sub as unknown as Subscription);

    const store = new AtlasDatabase(atlas);

    // What mapStore.makeActiveMission() sets on both sides
    if (mission) store.mission = mission.guid;

    const target: PlacementTarget = {
        worker: { db: store as unknown as PlacementTarget['worker']['db'] },
        refresh: vi.fn(async () => undefined),
        mission: mission ? { meta: mission } : undefined,
    };

    return { target, store, atlas, sub, from };
}

beforeEach(async () => {
    await db.feature.clear();
    await db.subscription_feature.clear();
    FeatureOutbox.pending.clear();
    FeatureOutbox.cancelRetry();
    server.PUT.mockResolvedValue({ data: {} });
    disarmSignature();
});

afterEach(() => {
    FeatureOutbox.cancelRetry();
    vi.restoreAllMocks();
});

describe('signatureFeature', () => {
    it('is a point with the signature, named after it and the time', () => {
        const feat = signatureFeature({ type: 'u-d-p', icon: 'uid:Swiss/Panzer', color: '#ff0000' }, 'Panzer', [7.44, 46.95], {
            id: 'p1',
            now: NOW,
        });

        expect(feat.id).toBe('p1');
        expect(feat.geometry).toEqual({ type: 'Point', coordinates: [7.44, 46.95] });
        expect(feat.properties).toMatchObject({
            id: 'p1',
            type: 'u-d-p',
            icon: 'uid:Swiss/Panzer',
            'marker-color': '#FF0000',
            'marker-opacity': 1,
            archived: true,
            how: 'h-g-i-g-o',
            callsign: 'Panzer 14:05',
            center: [7.44, 46.95],
            time: NOW.toISOString(),
        });
        expect(new Date(String(feat.properties.stale)).getTime() - NOW.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('gives every placement a new id', () => {
        const a = signatureFeature({ type: SIDC }, 'A', [0, 0]);
        const b = signatureFeature({ type: SIDC }, 'A', [0, 0]);
        expect(a.id).not.toBe(b.id);
        expect(a.properties).not.toHaveProperty('icon');
    });
});

describe('placeSignature (mocked map store)', () => {
    it('adds an authored new object like a drawn point and refreshes the map', async () => {
        const { target, add, refresh } = mockTarget();

        const placed = await placeSignature(target, { type: SIDC }, 'Infantry', [8, 47], { id: 'x', now: NOW });

        expect(add).toHaveBeenCalledTimes(1);
        const [feat, opts] = add.mock.calls[0] as unknown as [Feature, Record<string, boolean>];
        expect(feat.properties.type).toBe(SIDC);
        expect(opts).toEqual({ authored: true, created: true, skipMissionLookup: true });
        expect(refresh).toHaveBeenCalledTimes(1);

        expect(placed).toEqual({ id: 'x', callsign: 'Infantry 14:05', mission: undefined });
    });

    it('reports the active Data Sync the object goes to', async () => {
        const { target } = mockTarget({ guid: GUID, name: 'Übung' });

        const placed = await placeSignature(target, { type: SIDC }, 'Infantry', [8, 47], { id: 'x', now: NOW });

        expect(placed.mission).toEqual({ guid: GUID, name: 'Übung' });
    });

    it('passes a failed write on and does not refresh', async () => {
        const { target, add, refresh } = mockTarget();
        add.mockRejectedValueOnce(new Error('Cannot add x to mission as it is not loaded'));

        await expect(placeSignature(target, { type: SIDC }, 'Infantry', [8, 47])).rejects.toThrow('not loaded');
        expect(refresh).not.toHaveBeenCalled();
    });

    it('undoes a placement wherever it was filed', async () => {
        const { target, remove, refresh } = mockTarget();

        await undoPlacement(target, { id: 'x', callsign: 'Infantry 14:05' });

        expect(remove).toHaveBeenCalledWith('x', { mission: true });
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

describe('placeSignature (worker store)', () => {
    it('files the object in the active Data Sync', async () => {
        const { target, store, atlas, sub } = atlasTarget({ guid: GUID, name: 'Übung' });

        const placed = await placeSignature(target, { type: SIDC }, 'Infantry', [8, 47], { id: 'in-mission' });

        expect(placed.mission).toEqual({ guid: GUID, name: 'Übung' });
        expect(sub.feature.update).toHaveBeenCalledTimes(1);

        const render = vi.mocked(atlas.postMessage).mock.calls
            .map(([msg]) => msg)
            .find((msg) => msg.type === WorkerMessageType.Mission_Render_Feature);
        expect(render?.body.guid).toBe(GUID);
        expect(render?.body.add.properties.type).toBe(SIDC);

        // Not an own object
        expect(store.cots.has('in-mission')).toBe(false);
        expect(FeatureOutbox.isPending('in-mission')).toBe(false);
    });

    it('saves an own object without an active Data Sync', async () => {
        const { target, store, from } = atlasTarget();

        const placed = await placeSignature(target, { type: 'u-d-p', icon: 'uid:Swiss/Panzer', color: '#FF0000' }, 'Panzer', [8, 47], { id: 'own' });

        expect(placed.mission).toBeUndefined();
        expect(from).not.toHaveBeenCalled();

        const cot = store.cots.get('own');
        expect(cot?.origin.mode).toBe(OriginMode.CONNECTION);
        expect(cot?.properties.icon).toBe('uid:Swiss/Panzer');
        expect(cot?.properties.creator?.callsign).toBe('ME');
    });
});

describe('armed signature', () => {
    it('only takes over map taps while a placement handler is attached', () => {
        armSignature({ type: SIDC }, 'Infantry');
        expect(armedSignature.value?.label).toBe('Infantry');
        expect(isSignatureArmed()).toBe(false);

        const detach = attachPlacementHandler();
        expect(isSignatureArmed()).toBe(true);

        disarmSignature();
        expect(isSignatureArmed()).toBe(false);

        armSignature({ type: SIDC }, 'Infantry');
        detach();
        expect(armedSignature.value).toBeNull();
        expect(isSignatureArmed()).toBe(false);

        // A second detach does not unbalance the count
        detach();
        const again = attachPlacementHandler();
        armSignature({ type: SIDC }, 'Infantry');
        expect(isSignatureArmed()).toBe(true);
        again();
    });
});
