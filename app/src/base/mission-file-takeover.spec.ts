import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { db, type DBSubscriptionContent } from '../database.ts';
import { server } from '../std.ts';
import SubscriptionFeature from './subscription-feature.ts';
import { MissionFileStore } from './mission-files.ts';
import { MISSION_FILE_PROPERTY } from './mission-file-hooks.ts';
import {
    askedHashes,
    canTakeOver,
    cleanCopy,
    folderName,
    folderUid,
    markAsked,
    selectTakeover,
    takeOver,
    takeoverCandidates,
    type TakeoverFile,
    type TakeoverMission,
} from './mission-file-takeover.ts';
import type Subscription from './subscription.ts';
import type Atlas from '../workers/atlas.ts';
import type { Feature, MissionLayer } from '../types.ts';

// Invented test data - places, callsigns, hashtags and UIDs are made up

const GUID = 'mission-ost';
const atlas = {} as Atlas;

function drawing(uid: string, callsign: string, remarks?: string): string {
    return `<event version="2.0" uid="${uid}" type="u-d-f" time="2026-11-20T08:00:00Z" start="2026-11-20T08:00:00Z" stale="2027-11-20T08:00:00Z" how="h-e">
        <point lat="46.95" lon="7.44" hae="0" ce="9999999" le="9999999"/>
        <detail>
            <link point="46.9500,7.4400,0"/>
            <link point="46.9510,7.4420,0"/>
            <link point="46.9530,7.4450,0"/>
            <strokeColor value="-16776961"/>
            <strokeWeight value="4.0"/>
            <contact callsign="${callsign}"/>
            ${remarks ? `<remarks>${remarks}</remarks>` : ''}
            <archive/>
            <labels_on value="true"/>
        </detail>
    </event>`;
}

let uid = 0;
function content(hash: string, name: string, submissionTime = '2026-11-20T08:00:00Z'): DBSubscriptionContent {
    return {
        uid: `content-${++uid}`,
        mission: GUID,
        timestamp: submissionTime,
        keywords: [],
        name,
        hash,
        submissionTime,
        size: 1000,
        expiration: 0,
    };
}

/** Attach files to the mission and read them, as the map does */
async function attach(files: Array<{ hash: string; name: string; xml: string; time?: string }>): Promise<void> {
    await db.subscription_contents.bulkPut(files.map((file) => content(file.hash, file.name, file.time)));

    const loader = new MissionFileStore({
        download: async (hash) => strToU8(files.find((file) => file.hash === hash)!.xml),
        repaint: () => undefined,
    });

    const sub = {
        guid: GUID,
        headers: () => ({}),
        contents: { list: async () => await db.subscription_contents.where('mission').equals(GUID).toArray() },
        fetch: async () => undefined,
    };

    await loader.features(sub, []);
    await loader.idle();
}

function marked(id: string, callsign = id, extra: Record<string, unknown> = {}): Feature {
    return {
        id,
        type: 'Feature',
        path: '/',
        properties: { id, type: 'u-d-f', callsign, remarks: '#BUNT Testlinie', [MISSION_FILE_PROPERTY]: 'hash-1', ...extra },
        geometry: { type: 'LineString', coordinates: [[7.44, 46.95], [7.45, 46.96]] },
    } as unknown as Feature;
}

/** The TAK Server's view of the mission: its objects by UID */
let remote: Map<string, Feature>;
let reject: Set<string>;

function mockServer(): void {
    vi.spyOn(server, 'PUT').mockImplementation((async (_path: string, init: { body: { features: Feature[] } }) => {
        const failed = init.body.features.filter((feat) => reject.has(String(feat.id)));

        for (const feat of init.body.features) {
            if (!reject.has(String(feat.id))) remote.set(String(feat.id), feat);
        }

        if (failed.length) {
            return {
                error: { message: `TAK Server did not confirm CoT: ${failed.map((f) => f.id).join(', ')}` },
                response: { status: 502 },
            };
        }

        return { data: { status: 200, message: 'CoTs Submitted', uids: [] }, response: { status: 200 } };
    }) as never);
}

/** Mission folders as the TAK Server keeps them - a UID exists once */
function folders(initial: MissionLayer[] = []) {
    const list: MissionLayer[] = [...initial];

    return {
        list: vi.fn(async () => list.map((layer) => ({ ...layer }))),
        create: vi.fn(async (body: { name: string; type: MissionLayer['type']; uid?: string }) => {
            if (list.some((layer) => layer.uid === body.uid)) throw new Error('Mission layer exists');
            const layer = { name: body.name, type: body.type, uid: body.uid ?? 'generated', uids: [] } as unknown as MissionLayer;
            list.push(layer);
            return { data: layer } as unknown as MissionLayer;
        }),
        attachFeatures: vi.fn(async () => undefined),
        all: list,
    };
}

function mission(layer = folders()): TakeoverMission & { layer: ReturnType<typeof folders> } {
    const parent = { guid: GUID, name: 'Übung Ost', update: vi.fn(async () => undefined) } as unknown as Subscription;

    return {
        guid: GUID,
        subscribed: true,
        role: { permissions: ['MISSION_READ', 'MISSION_WRITE'] },
        feature: new SubscriptionFeature(parent, {}),
        layer,
    };
}

beforeEach(async () => {
    await db.subscription_contents.clear();
    await db.subscription_feature.clear();
    await db.subscription.clear();
    await db.kv.clear();

    await db.subscription.put({ guid: GUID, name: 'Übung Ost', subscribed: true, dirty: false, meta: {}, role: {}, token: '' } as never);

    remote = new Map();
    reject = new Set();
    mockServer();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('which objects are up for takeover', () => {
    it('leaves out objects of the mission and takes a UID from the newest file only', () => {
        const files = [
            { hash: 'new', name: 'Neu.cot', features: [marked('a', 'NEU'), marked('b')] },
            { hash: 'old', name: 'Alt.cot', features: [marked('a', 'ALT'), marked('c')] },
            { hash: 'done', name: 'Erledigt.cot', features: [marked('m')] },
        ];

        const picked = selectTakeover(files, new Set(['b', 'm']));

        expect(picked.map((file) => [file.hash, file.features.map((f) => f.properties.callsign)])).toEqual([
            ['new', ['NEU']],
            ['old', ['c']],
        ]);
    });

    it('reads the candidates of a mission from its files', async () => {
        await attach([
            { hash: 'h1', name: 'Marschachse.cot', xml: drawing('uid-1', 'Marschachse DRACHE', '#BUNT #BUNTdracheBlau Marschachse') },
            { hash: 'h2', name: 'Sperre.cot', xml: drawing('uid-2', 'Sperre Nord') },
            { hash: 'h3', name: 'Foto.jpg', xml: '' },
        ]);

        // uid-2 is an object of the mission already
        await db.subscription_feature.put({
            id: 'uid-2', mission: GUID, path: '/', properties: { id: 'uid-2' }, geometry: { type: 'Point', coordinates: [0, 0] },
            synced: true, deleted: false, attempts: 0,
        } as never);

        const candidates = await takeoverCandidates(GUID);

        expect(candidates.map((file) => file.name)).toEqual(['Marschachse.cot']);
        expect(candidates[0].features.map((f) => f.id)).toEqual(['uid-1']);
    });
});

describe('who may take objects over', () => {
    it('needs a subscription with write access', () => {
        expect(canTakeOver({ subscribed: true, role: { permissions: ['MISSION_READ', 'MISSION_WRITE'] } })).toBe(true);
        expect(canTakeOver({ subscribed: true, role: { permissions: ['MISSION_READ'] } })).toBe(false);
        expect(canTakeOver({ subscribed: false, role: { permissions: ['MISSION_WRITE'] } })).toBe(false);
        expect(canTakeOver({ subscribed: true, role: null })).toBe(false);
        expect(canTakeOver(undefined)).toBe(false);
    });
});

describe('clean copy', () => {
    it('keeps UID, type and details and drops the mark', () => {
        const original = marked('uid-1', 'Marschachse', { stroke: '#0000ff', 'stroke-width': 4, labels: true });
        const copy = cleanCopy(original);

        expect(copy.id).toBe('uid-1');
        expect(copy.properties).toMatchObject({ type: 'u-d-f', callsign: 'Marschachse', remarks: '#BUNT Testlinie', stroke: '#0000ff', 'stroke-width': 4, labels: true });
        expect(copy.properties).not.toHaveProperty(MISSION_FILE_PROPERTY);
        expect(copy.geometry).toEqual(original.geometry);

        // The cached object is left alone
        expect(original.properties[MISSION_FILE_PROPERTY]).toBe('hash-1');
    });

    it('drops the remarks filled in when the file was read', () => {
        expect(cleanCopy(marked('x', 'x', { remarks: 'None' })).properties).not.toHaveProperty('remarks');
    });

    it('names folders after the file and gives them the same UID for every user', () => {
        expect(folderName('Marschachse DRACHE.cot')).toBe('Marschachse DRACHE');
        expect(folderName('Paket.v2.zip')).toBe('Paket.v2');
        expect(folderName('ohne-endung')).toBe('ohne-endung');
        expect(folderUid(GUID, 'Sperre')).toBe(folderUid(GUID, 'Sperre'));
        expect(folderUid(GUID, 'Sperre')).not.toBe(folderUid('other', 'Sperre'));
    });
});

describe('takeOver', () => {
    function files(): TakeoverFile[] {
        return [
            { hash: 'h1', name: 'Marschachse DRACHE.cot', features: [marked('uid-1', 'Marschachse')] },
            { hash: 'h2', name: 'Sperren.zip', features: [marked('uid-2', 'Sperre 1'), marked('uid-3', 'Sperre 2')] },
        ];
    }

    it('writes clean copies to the TAK Server and files them in a new folder per file', async () => {
        const sub = mission();

        const result = await takeOver(sub, atlas, files(), { folders: true });

        expect(result).toEqual({ written: 3, failed: 0, folders: [] });

        expect([...remote.keys()].sort()).toEqual(['uid-1', 'uid-2', 'uid-3']);
        for (const feat of remote.values()) {
            expect(feat.properties).not.toHaveProperty(MISSION_FILE_PROPERTY);
        }
        expect(remote.get('uid-1')?.properties).toMatchObject({ type: 'u-d-f', callsign: 'Marschachse', remarks: '#BUNT Testlinie' });

        const rows = await db.subscription_feature.toArray();
        expect(rows.map((row) => [row.id, row.mission, row.synced])).toEqual([
            ['uid-1', GUID, true],
            ['uid-2', GUID, true],
            ['uid-3', GUID, true],
        ]);

        expect(sub.layer.create).toHaveBeenCalledWith({ name: 'Marschachse DRACHE', type: 'UID', uid: folderUid(GUID, 'Marschachse DRACHE') });
        expect(sub.layer.create).toHaveBeenCalledWith({ name: 'Sperren', type: 'UID', uid: folderUid(GUID, 'Sperren') });
        expect(sub.layer.attachFeatures).toHaveBeenCalledWith(folderUid(GUID, 'Marschachse DRACHE'), ['uid-1']);
        expect(sub.layer.attachFeatures).toHaveBeenCalledWith(folderUid(GUID, 'Sperren'), ['uid-2', 'uid-3']);
    });

    it('uses a folder that already has the name', async () => {
        const sub = mission(folders([
            { name: 'Einsatz', type: 'GROUP', uid: 'group-1', mission_layers: [
                { name: 'Sperren', type: 'UID', uid: 'existing-folder', uids: [] },
            ] } as unknown as MissionLayer,
        ]));

        await takeOver(sub, atlas, [files()[1]], { folders: true });

        expect(sub.layer.create).not.toHaveBeenCalled();
        expect(sub.layer.attachFeatures).toHaveBeenCalledWith('existing-folder', ['uid-2', 'uid-3']);
    });

    it('takes the objects over without folders when that is turned off', async () => {
        const sub = mission();

        expect(await takeOver(sub, atlas, files(), { folders: false })).toEqual({ written: 3, failed: 0, folders: [] });
        expect(sub.layer.list).not.toHaveBeenCalled();
        expect(sub.layer.attachFeatures).not.toHaveBeenCalled();
    });

    it('counts an object the server refuses and takes the others over', async () => {
        reject.add('uid-2');
        const sub = mission();

        const result = await takeOver(sub, atlas, files(), { folders: true });

        expect(result.written).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.error).toContain('uid-2');
        expect([...remote.keys()].sort()).toEqual(['uid-1', 'uid-3']);
        expect(sub.layer.attachFeatures).toHaveBeenCalledWith(folderUid(GUID, 'Sperren'), ['uid-3']);
    });

    it('reports a folder that cannot be made and keeps the objects', async () => {
        const layer = folders();
        layer.create.mockRejectedValue(new Error('Forbidden'));
        const sub = mission(layer);

        const result = await takeOver(sub, atlas, files(), { folders: true });

        expect(result.written).toBe(3);
        expect(result.failed).toBe(0);
        expect(result.folders.map((folder) => folder.name)).toEqual(['Marschachse DRACHE', 'Sperren']);
        expect([...remote.keys()]).toHaveLength(3);
    });

    it('updates an object taken over twice instead of doubling it', async () => {
        await takeOver(mission(), atlas, [files()[0]], { folders: true });
        const again = await takeOver(mission(), atlas, [files()[0]], { folders: true });

        expect(again).toEqual({ written: 1, failed: 0, folders: [] });
        expect(await db.subscription_feature.count()).toBe(1);
        expect(remote.size).toBe(1);
    });

    it('ends with one object per UID and one folder when two users take over at once', async () => {
        const shared = folders();

        await Promise.all([
            takeOver(mission(shared), atlas, files(), { folders: true }),
            takeOver(mission(shared), atlas, files(), { folders: true }),
        ]);

        expect([...remote.keys()].sort()).toEqual(['uid-1', 'uid-2', 'uid-3']);
        expect(shared.all.map((layer) => layer.name).sort()).toEqual(['Marschachse DRACHE', 'Sperren']);
    });
});

describe('asking once per file', () => {
    it('remembers the files asked about, per mission', async () => {
        expect(await askedHashes(GUID)).toEqual(new Set());

        await markAsked(GUID, ['h1', 'h2']);
        await markAsked(GUID, ['h2', 'h3']);

        expect(await askedHashes(GUID)).toEqual(new Set(['h1', 'h2', 'h3']));
        expect(await askedHashes('other')).toEqual(new Set());
    });
});
