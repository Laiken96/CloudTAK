import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../database.ts';
import AtlasDatabase from '../workers/atlas-database.ts';
import COT from '../base/cot.ts';
import FeatureOutbox from '../base/feature-outbox.ts';
import FeatureWriter from '../base/feature-writer.ts';
import { HASHTAG_KEYS_PROPERTY } from '../utils/hashtag-visibility.ts';
import type Atlas from '../workers/atlas.ts';
import type { InputFeature } from '../types.ts';

/*
 * The map hides Features by the hashtags in their remarks with a layer filter
 * on the HASHTAG_KEYS_PROPERTY of each rendered Feature (see
 * stores/modules/hidden-hashtags). These tests cover the worker side: the
 * property is on the map for every Feature and follows its remarks.
 */

const REMOTE = { skipSave: true, skipBroadcast: true, skipDatabase: true, skipMissionLookup: true };

function feature(id: string, remarks?: string, properties: Record<string, unknown> = {}): InputFeature {
    const now = Date.now();

    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            type: 'a-f-G-U-C',
            how: 'm-g',
            callsign: id,
            remarks,
            time: new Date(now).toISOString(),
            start: new Date(now).toISOString(),
            stale: new Date(now + 60 * 60 * 1000).toISOString(),
            ...properties,
        },
        geometry: { type: 'Point', coordinates: [7.5, 46.9] },
    } as unknown as InputFeature;
}

function setup() {
    const atlas = {
        token: 'token',
        postMessage: vi.fn(async () => {}),
        profile: {
            display_stale: { value: 'Never' },
            creator: async () => ({ uid: 'me', type: 'a-f-G-E-V-C', callsign: 'ME', time: '2026-01-01T00:00:00Z' }),
        },
    } as unknown as Atlas;

    vi.spyOn(FeatureOutbox, 'push').mockResolvedValue(true);

    return new AtlasDatabase(atlas);
}

function updated(diff: Awaited<ReturnType<AtlasDatabase['diff']>>, id: string): Record<string, unknown> | undefined {
    const update = (diff.update || []).find((u) => u.id === COT.vectorId(id));
    if (!update) return undefined;
    return Object.fromEntries((update.addOrUpdateProperties || []).map((prop) => [prop.key, prop.value]));
}

beforeEach(async () => {
    FeatureWriter.reset();
    await db.feature.clear();
    FeatureOutbox.pending.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
    COT.selfUid = null;
});

describe('AtlasDatabase - hashtag keys on the map', () => {
    it('draws a new Feature of another user with the keys of its tags', async () => {
        const store = setup();

        await store.add(feature('ANDROID-1', '#Zug1 #Reserve Pz Kp 2'), REMOTE);
        const diff = await store.diff();

        const added = (diff.add || []).find((f) => f.id === COT.vectorId('ANDROID-1'));
        expect(added?.properties?.[HASHTAG_KEYS_PROPERTY]).toEqual(' #zug1 #reserve ');
    });

    // A kept (archived) marker re-renders only for rendered changes - a remarks
    // edit alone would not reach the map without the hashtag check in COT.update
    it('re-renders a kept marker whose remarks gain a tag, nothing else changed', async () => {
        const store = setup();

        await store.add(feature('marker', 'Pz Kp 2', { archived: true }), REMOTE);
        await store.diff();

        await store.add(feature('marker', 'Pz Kp 2 #Zug1', { archived: true }), REMOTE);
        const diff = await store.diff();

        expect(updated(diff, 'marker')?.[HASHTAG_KEYS_PROPERTY]).toEqual(' #zug1 ');
    });

    it('clears the keys once the tag is removed from the remarks, so the Feature shows again', async () => {
        const store = setup();

        await store.add(feature('marker', '#Zug1 Pz Kp 2', { archived: true }), REMOTE);
        await store.diff();

        await store.add(feature('marker', 'Pz Kp 2', { archived: true }), REMOTE);
        const diff = await store.diff();

        expect(updated(diff, 'marker')?.[HASHTAG_KEYS_PROPERTY]).toEqual('');
    });

    it('does not re-render for a remarks edit that keeps the same tags', async () => {
        const store = setup();

        await store.add(feature('marker', '#Zug1 Pz Kp 2', { archived: true }), REMOTE);
        await store.diff();

        await store.add(feature('marker', '#ZUG1 Pz Kp 3', { archived: true }), REMOTE);
        const diff = await store.diff();

        expect(updated(diff, 'marker')).toBeUndefined();
    });

    it('updates the keys of a Feature of another user with its next position report', async () => {
        const store = setup();

        await store.add(feature('ANDROID-1', 'Pz Kp 2'), REMOTE);
        await store.diff();

        await store.add(feature('ANDROID-1', 'Pz Kp 2 #Reserve'), REMOTE);
        const diff = await store.diff();

        expect(updated(diff, 'ANDROID-1')?.[HASHTAG_KEYS_PROPERTY]).toEqual(' #reserve ');
    });

    it('puts the keys into the full snapshot', async () => {
        const store = setup();

        await store.add(feature('a', '#Zug1'), REMOTE);
        await store.add(feature('b'), REMOTE);

        const snapshot = await store.snapshot();
        const keys = Object.fromEntries(snapshot.map((f) => [f.properties.id, f.properties[HASHTAG_KEYS_PROPERTY]]));

        expect(keys).toEqual({ a: ' #zug1 ', b: '' });
    });

    it('never draws the own position, whatever its tags - the geolocate control shows it', async () => {
        const store = setup();
        COT.selfUid = 'me';

        await store.add(feature('me', '#Zug1 Kdt'), REMOTE);
        await store.add(feature('other', '#Zug1'), REMOTE);

        const snapshot = await store.snapshot();

        expect(snapshot.map((f) => f.properties.id)).toEqual(['other']);
        expect(store.cots.get('me')?.properties.remarks).toEqual('#Zug1 Kdt');
    });
});
