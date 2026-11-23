import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';

import { db } from '../database.ts';
import AtlasDatabase from '../workers/atlas-database.ts';
import Subscription from '../base/subscription.ts';
import SubscriptionFeature from '../base/subscription-feature.ts';
import FeatureOutbox from '../base/feature-outbox.ts';
import { MissionFileStore, missionFileCOT } from '../base/mission-files.ts';
import {
    MISSION_FILE_PROPERTY,
    announceMissionFileChange,
    isMissionFileFeature,
    missionFileHashes,
} from '../base/mission-file-hooks.ts';
import { canMoveCOT } from '../base/feature-drag.ts';
import { WorkerMessageType } from '../utils/events.ts';
import type Atlas from '../workers/atlas.ts';
import type { InputFeature } from '../types.ts';

/**
 * Objects of mission files never reach the server: not as objects of the
 * mission (subscription_feature, PUT /cot), not as own objects (feature
 * table, outbox) - whatever path an edit, a delete or an incoming CoT with
 * the same UID takes. Invented test data.
 */

const GUID = 'mission-a';
const UID = 'file-object-1';

const COT_XML = `<event version="2.0" uid="${UID}" type="u-d-f" time="2026-11-20T08:00:00Z" start="2026-11-20T08:00:00Z" stale="2027-11-20T08:00:00Z" how="h-e">
    <point lat="46.95" lon="7.44" hae="0" ce="9999999" le="9999999"/>
    <detail>
        <link point="46.9500,7.4400,0"/>
        <link point="46.9510,7.4420,0"/>
        <link point="46.9500,7.4450,0"/>
        <contact callsign="Sperrlinie Test"/>
        <strokeColor value="-65536"/>
        <archive/>
    </detail>
</event>`;

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

    const from = vi.spyOn(Subscription, 'from').mockResolvedValue(sub as unknown as Subscription);
    const queue = vi.spyOn(FeatureOutbox, 'queue');

    const store = new AtlasDatabase(atlas);

    return { store, atlas, sub, from, queue };
}

beforeEach(async () => {
    await db.subscription_contents.clear();
    await db.subscription.clear();
    await db.subscription_feature.clear();
    await db.feature.clear();
    await db.kv.clear();

    // A subscribed mission with one attached drawing, already read into the cache
    await db.subscription.put({ guid: GUID, name: 'Übung', subscribed: true, dirty: false, meta: {}, role: {}, token: '' } as never);
    await db.subscription_contents.put({
        uid: 'content-1',
        mission: GUID,
        timestamp: '2026-11-20T08:00:00Z',
        keywords: [],
        name: 'Sperrlinie.cot',
        hash: 'hash-1',
        submissionTime: '2026-11-20T08:00:00Z',
        size: 1000,
        expiration: 0,
    });

    const loader = new MissionFileStore({
        download: async () => strToU8(COT_XML),
        repaint: () => undefined,
    });

    const sub = {
        guid: GUID,
        headers: () => ({}),
        contents: { list: async () => await db.subscription_contents.toArray() },
        fetch: async () => undefined,
    };

    await loader.features(sub, []);
    await loader.idle();
    expect(await loader.features(sub, [])).toHaveLength(1);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('objects of mission files', () => {
    it('are never written to the mission store or the own objects while loading', async () => {
        expect(await db.subscription_feature.count()).toBe(0);
        expect(await db.feature.count()).toBe(0);
    });

    it('are found by the object view, as read-only objects of their mission', async () => {
        const { store } = setup();

        const cot = await store.get(UID, { mission: true });

        expect(cot?.origin).toEqual({ mode: 'Mission', mode_id: GUID });
        expect(isMissionFileFeature(cot)).toBe(true);
        expect(cot?.is_editable).toBe(false);
        expect(canMoveCOT(cot!, { mission: { role: { permissions: ['MISSION_WRITE'] } } })).toBe(false);

        // Not for the paths that write
        expect(await store.get(UID, { mission: true, files: false })).toBeUndefined();
        expect(await store.get(UID)).toBeUndefined();
    });

    it('refuse an edit', async () => {
        const { store, atlas, sub, from, queue } = setup();
        store.mission = GUID;

        const cot = await store.get(UID, { mission: true });
        const edited = cot!.as_feature({ clone: true }) as unknown as InputFeature;
        edited.properties.callsign = 'Geändert';

        await store.add(edited, { authored: true });

        expect(from).not.toHaveBeenCalled();
        expect(sub.feature.update).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(atlas.postMessage).not.toHaveBeenCalled();
        expect(store.cots.has(UID)).toBe(false);
        expect(await db.subscription_feature.count()).toBe(0);
        expect(await db.feature.count()).toBe(0);
    });

    it('refuse a copy under a new UID that still carries the mark', async () => {
        const { store, from } = setup();
        store.mission = GUID;

        const cot = await store.get(UID, { mission: true });
        const copy = cot!.as_feature({ clone: true }) as unknown as InputFeature;
        copy.id = 'copy-1';
        copy.properties.id = 'copy-1';

        await store.add(copy, { authored: true, created: true, skipMissionLookup: true });

        expect(from).not.toHaveBeenCalled();
        expect(await db.subscription_feature.count()).toBe(0);
    });

    it('refuse a delete', async () => {
        const { store, atlas, sub, from } = setup();

        await store.remove(UID, { mission: true });

        expect(from).not.toHaveBeenCalled();
        expect(sub.feature.delete).not.toHaveBeenCalled();
        expect(atlas.postMessage).not.toHaveBeenCalled();
    });

    it('do not pull a CoT with the same UID from another source into the mission', async () => {
        const { store, from, sub } = setup();
        store.mission = GUID;

        // The same drawing as a plain CoT from the connection: no mark, no origin
        const incoming = (await missionFileCOT(UID))!.as_feature({ clone: true }) as unknown as InputFeature;
        delete (incoming.properties as Record<string, unknown>)[MISSION_FILE_PROPERTY];
        delete incoming.origin;

        // Not authored: received from the server, eg. the drawing sent live by WinTAK
        await store.add(incoming, { skipSave: true, skipBroadcast: true });

        expect(from).not.toHaveBeenCalled();
        expect(sub.feature.update).not.toHaveBeenCalled();
        expect(store.cots.get(UID)?.origin.mode).toBe('Connection');
        expect(await db.subscription_feature.count()).toBe(0);
    });

    it('are refused by the mission store itself', async () => {
        const parent = { guid: GUID, name: 'Übung', update: vi.fn() } as unknown as Subscription;
        const missionStore = new SubscriptionFeature(parent, {});
        const cot = await missionFileCOT(UID);

        await expect(missionStore.update({} as Atlas, cot!)).rejects.toThrow(/read-only/);

        expect(parent.update).not.toHaveBeenCalled();
        expect(await db.subscription_feature.count()).toBe(0);
    });
});

describe('announceMissionFileChange', () => {
    it('repaints the mission only when its files changed', async () => {
        const messages: unknown[] = [];
        const channel = new BroadcastChannel('cloudtak');
        channel.onmessage = (ev) => messages.push(ev.data);

        try {
            const before = await missionFileHashes(GUID);
            await announceMissionFileChange(GUID, before);

            await db.subscription_contents.put({
                uid: 'content-2',
                mission: GUID,
                timestamp: '2026-11-21T08:00:00Z',
                keywords: [],
                name: 'Neu.kml',
                hash: 'hash-2',
                submissionTime: '2026-11-21T08:00:00Z',
                size: 1000,
                expiration: 0,
            });
            await announceMissionFileChange(GUID, before);

            await vi.waitFor(() => expect(messages).toHaveLength(1));
            expect(messages[0]).toEqual({ type: WorkerMessageType.Mission_Change_Feature, body: { guid: GUID } });
        } finally {
            channel.close();
        }
    });
});
