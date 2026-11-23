import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { db, type DBSubscriptionContent } from '../database.ts';
import { MissionFileStore, missionFileCOT, type MissionFileSubscription } from './mission-files.ts';
import { MISSION_FILE_PROPERTY } from './mission-file-hooks.ts';
import { OriginMode } from './cot.ts';
import { HASHTAG_KEYS_PROPERTY } from '../utils/hashtag-visibility.ts';
import type { Feature } from '../types.ts';

// Invented test data - places, callsigns and UIDs are made up

const GUID = 'mission-a';
const OTHER = 'mission-b';

function cot(uid: string, callsign: string, remarks = 'Test'): string {
    return `<event version="2.0" uid="${uid}" type="a-h-G" time="2026-11-20T08:00:00Z" start="2026-11-20T08:00:00Z" stale="2026-11-21T08:00:00Z" how="m-g">
        <point lat="46.95" lon="7.44" hae="540" ce="10" le="10"/>
        <detail><contact callsign="${callsign}"/><remarks>${remarks}</remarks><archive/></detail>
    </event>`;
}

let files: Record<string, Uint8Array>;
let clock: number;
let store: MissionFileStore;

const download = vi.fn(async (hash: string): Promise<Uint8Array> => {
    const file = files[hash];
    if (!file) throw new Error('HTTP 502');
    return file;
});

const repaint = vi.fn();

function newStore(): MissionFileStore {
    return new MissionFileStore({ download, repaint, now: () => clock });
}

let uid = 0;
function content(guid: string, hash: string, name: string, extra: Partial<DBSubscriptionContent> = {}): DBSubscriptionContent {
    return {
        uid: `content-${++uid}`,
        mission: guid,
        timestamp: '2026-11-20T08:00:00Z',
        keywords: [],
        name,
        hash,
        submissionTime: '2026-11-20T08:00:00Z',
        size: 1000,
        expiration: 0,
        ...extra,
    };
}

function subscription(guid: string): MissionFileSubscription & { fetch: ReturnType<typeof vi.fn> } {
    return {
        guid,
        headers: () => ({ MissionAuthorization: 'mission-token' }),
        contents: {
            list: async () => await db.subscription_contents.where('mission').equals(guid).toArray(),
        },
        fetch: vi.fn(async () => undefined),
    };
}

async function attach(...contents: DBSubscriptionContent[]): Promise<void> {
    await db.subscription_contents.bulkPut(contents);
}

async function subscribe(guid: string, subscribed = true): Promise<void> {
    await db.subscription.put({ guid, name: guid, subscribed, dirty: false, meta: {}, role: {}, token: '' } as never);
}

/** Paint, let the downloads finish, paint again - as the map does */
async function painted(sub: MissionFileSubscription, mission: Feature[] = []): Promise<Feature[]> {
    await store.features(sub, mission);
    await store.idle();
    return await store.features(sub, mission);
}

async function cacheKeys(): Promise<string[]> {
    return (await db.kv.where('key').startsWith('mission-file:').primaryKeys()) as string[];
}

beforeEach(async () => {
    await db.subscription_contents.clear();
    await db.subscription.clear();
    await db.subscription_feature.clear();
    await db.kv.clear();

    files = {};
    clock = 1_000_000;
    download.mockClear();
    repaint.mockClear();
    store = newStore();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MissionFileStore', () => {
    it('loads a new file in the background and paints it with the mission', async () => {
        files.h1 = strToU8(cot('uid-1', 'FEIND 1', 'Beobachtet #RAUM2'));
        await attach(content(GUID, 'h1', 'Feind.cot'));
        const sub = subscription(GUID);

        expect(await store.features(sub, [])).toEqual([]);
        expect(store.status(GUID, 'h1')).toEqual({ state: 'loading' });

        await store.idle();
        expect(download).toHaveBeenCalledTimes(1);
        expect(download).toHaveBeenCalledWith('h1', { MissionAuthorization: 'mission-token' });
        expect(repaint).toHaveBeenCalledWith(GUID);

        const features = await store.features(sub, []);
        expect(features).toHaveLength(1);
        expect(features[0].id).toBe('uid-1');
        expect(features[0].properties.callsign).toBe('FEIND 1');
        expect(features[0].properties[MISSION_FILE_PROPERTY]).toBe('h1');
        // Rendered as a mission object, so the hashtag filter applies
        expect(features[0].properties[HASHTAG_KEYS_PROPERTY]).toBe(' #raum2 ');
        expect(features[0].properties.path).toBe('/');

        expect(store.status(GUID, 'h1')).toEqual({ state: 'loaded', count: 1, shown: 1 });
        expect(await cacheKeys()).toEqual(['mission-file:v1:h1']);
    });

    it('does not download a file already in the cache', async () => {
        await subscribe(GUID);
        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        await attach(content(GUID, 'h1', 'Feind.cot'));
        await painted(subscription(GUID));
        expect(download).toHaveBeenCalledTimes(1);

        // The app starts again: memory is empty, the cache is not
        store = newStore();
        download.mockClear();

        const features = await store.features(subscription(GUID), []);
        expect(features.map((f) => f.id)).toEqual(['uid-1']);
        expect(download).not.toHaveBeenCalled();
    });

    it('follows a replaced file', async () => {
        await subscribe(GUID);
        files.h1 = strToU8(cot('uid-1', 'ALT'));
        files.h2 = strToU8(cot('uid-1', 'NEU'));

        const old = content(GUID, 'h1', 'Lage.cot');
        await attach(old);
        const sub = subscription(GUID);
        expect((await painted(sub))[0].properties.callsign).toBe('ALT');

        await db.subscription_contents.delete(old.uid);
        await attach(content(GUID, 'h2', 'Lage.cot'));

        const features = await painted(sub);
        expect(features.map((f) => f.properties.callsign)).toEqual(['NEU']);
        expect(store.status(GUID, 'h1')).toBeUndefined();

        await vi.waitFor(async () => expect(await cacheKeys()).toEqual(['mission-file:v1:h2']));
    });

    it('drops the objects of a deleted file', async () => {
        await subscribe(GUID);
        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        const file = content(GUID, 'h1', 'Feind.cot');
        await attach(file);
        const sub = subscription(GUID);
        expect(await painted(sub)).toHaveLength(1);

        await db.subscription_contents.delete(file.uid);

        expect(await store.features(sub, [])).toEqual([]);
        expect(store.status(GUID, 'h1')).toBeUndefined();
        await vi.waitFor(async () => expect(await cacheKeys()).toEqual([]));
    });

    it('leaves an object to the mission when it has the same UID', async () => {
        files.h1 = strToU8(`<events>${cot('uid-1', 'AUS DATEI')}${cot('uid-2', 'NUR DATEI')}</events>`);
        await attach(content(GUID, 'h1', 'Lage.cot'));

        const missionObject = { id: 'uid-1', type: 'Feature', properties: { id: 'uid-1' } } as unknown as Feature;
        const features = await painted(subscription(GUID), [missionObject]);

        expect(features.map((f) => f.id)).toEqual(['uid-2']);
        expect(store.status(GUID, 'h1')).toEqual({ state: 'loaded', count: 2, shown: 1 });
    });

    it('takes an object from the newest file when two files have its UID', async () => {
        files.old = strToU8(cot('uid-1', 'ALT'));
        files.new = strToU8(cot('uid-1', 'NEU'));
        await attach(
            content(GUID, 'old', 'a.cot', { submissionTime: '2026-11-19T08:00:00Z' }),
            content(GUID, 'new', 'b.cot', { submissionTime: '2026-11-20T08:00:00Z' }),
        );

        const features = await painted(subscription(GUID));

        expect(features.map((f) => f.properties.callsign)).toEqual(['NEU']);
        expect(store.status(GUID, 'old')).toEqual({ state: 'loaded', count: 1, shown: 0 });
    });

    it('skips a file above the size limit without downloading it', async () => {
        await attach(content(GUID, 'big', 'Gross.kml', { size: 21 * 1024 * 1024 }));

        expect(await painted(subscription(GUID))).toEqual([]);
        expect(download).not.toHaveBeenCalled();
        expect(store.status(GUID, 'big')).toEqual({ state: 'too-large' });
    });

    it('does not let a broken file block the others, and does not read it again', async () => {
        files.bad = strToU8('<event uid="x"><point');
        files.good = strToU8(cot('uid-1', 'FEIND 1'));
        await attach(content(GUID, 'bad', 'Kaputt.cot'), content(GUID, 'good', 'Gut.cot'));
        const sub = subscription(GUID);

        expect((await painted(sub)).map((f) => f.id)).toEqual(['uid-1']);
        expect(store.status(GUID, 'bad')?.state).toBe('invalid');
        expect(store.status(GUID, 'good')?.state).toBe('loaded');

        download.mockClear();
        await store.features(sub, []);
        await store.idle();
        expect(download).not.toHaveBeenCalled();
    });

    it('reports a failed download and tries again later or on request', async () => {
        await attach(content(GUID, 'h1', 'Feind.cot'));
        const sub = subscription(GUID);

        expect(await painted(sub)).toEqual([]);
        expect(store.status(GUID, 'h1')).toMatchObject({ state: 'failed', error: 'HTTP 502' });
        expect(download).toHaveBeenCalledTimes(1);

        // Not again right away - every repaint would download it
        await painted(sub);
        expect(download).toHaveBeenCalledTimes(1);

        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        store.retry(GUID, 'h1');
        expect(repaint).toHaveBeenLastCalledWith(GUID);
        expect((await painted(sub)).map((f) => f.id)).toEqual(['uid-1']);
        expect(download).toHaveBeenCalledTimes(2);
    });

    it('tries a failed download again after a while', async () => {
        await attach(content(GUID, 'h1', 'Feind.cot'));
        const sub = subscription(GUID);
        await painted(sub);

        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        clock += 61 * 1000;

        expect((await painted(sub)).map((f) => f.id)).toEqual(['uid-1']);
    });

    it('ignores files that are not map files', async () => {
        await attach(content(GUID, 'p1', 'Foto.jpg', { mimeType: 'image/jpeg' }), content(GUID, 'd1', 'Befehl.pdf'));

        expect(await painted(subscription(GUID))).toEqual([]);
        expect(download).not.toHaveBeenCalled();
        expect(store.statuses.size).toBe(0);
    });

    it('refreshes the file list from the server once per session', async () => {
        const sub = subscription(GUID);

        await store.features(sub, []);
        await store.features(sub, []);

        expect(sub.fetch).toHaveBeenCalledTimes(1);
    });

    it('lets the worker find objects of subscribed missions in the cache', async () => {
        await subscribe(GUID);
        await subscribe(OTHER, false);
        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        files.h2 = strToU8(cot('uid-2', 'FEIND 2'));
        await attach(content(GUID, 'h1', 'a.cot'), content(OTHER, 'h2', 'b.cot'));
        await painted(subscription(GUID));
        await painted(subscription(OTHER));

        // The worker has its own memory
        const worker = newStore();

        const found = await worker.find('uid-1');
        expect(found?.mission).toBe(GUID);
        expect(found?.feature.properties.callsign).toBe('FEIND 1');

        // Not subscribed
        expect(await worker.find('uid-2')).toBeUndefined();
        expect(await worker.find('nothing')).toBeUndefined();
    });
});

describe('missionFileCOT', () => {
    it('is a read-only object of its mission', async () => {
        await subscribe(GUID);
        files.h1 = strToU8(cot('uid-1', 'FEIND 1'));
        await attach(content(GUID, 'h1', 'a.cot'));
        await painted(subscription(GUID));

        const found = await missionFileCOT('uid-1');

        expect(found?.origin).toEqual({ mode: OriginMode.MISSION, mode_id: GUID });
        expect(found?.properties.archived).toBe(true);
        expect(found?.is_editable).toBe(false);
    });
});
