import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import AtlasDatabase from '../workers/atlas-database.ts';
import COT from '../base/cot.ts';
import KV from '../base/kv.ts';
import StickyHashtags, { STICKY_HASHTAGS_KEY } from '../base/sticky-hashtags.ts';
import type Atlas from '../workers/atlas.ts';
import type { Feature } from '../types.ts';

function feature(id: string, remarks?: string): Feature {
    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            type: 'a-f-G-U-C-A',
            how: 'h-g-i-g-o',
            callsign: id,
            remarks,
            center: [7.5, 46.9, 0]
        },
        geometry: { type: 'Point', coordinates: [7.5, 46.9, 0] }
    } as unknown as Feature;
}

function setup(feats: Array<{ id: string, remarks?: string }>) {
    const atlas = {
        postMessage: vi.fn(async () => undefined),
        profile: { creator: vi.fn(async () => ({ uid: 'me', callsign: 'Me', type: 'a-f-G' })) }
    } as unknown as Atlas;

    const db = new AtlasDatabase(atlas);

    for (const feat of feats) {
        db.cots.set(feat.id, new COT(feature(feat.id, feat.remarks), undefined, { skipSave: true }));
    }

    return db;
}

describe('AtlasDatabase.hashtags', () => {
    it('groups the loaded Features by the tags in their remarks', async () => {
        const db = setup([
            { id: 'pz', remarks: '#FURY #FURYeinheiten Pz Kp 2' },
            { id: 'gegner', remarks: '#fury #FURYgegner Inf' },
            { id: 'ohne', remarks: 'kein Tag' },
            { id: 'leer' },
        ]);

        const index = await db.hashtags();

        expect(index.map((e) => [e.tag, e.features.map((f) => f.id)])).toEqual([
            ['#FURY', ['pz', 'gegner']],
            ['#FURYeinheiten', ['pz']],
            ['#FURYgegner', ['gegner']],
        ]);
    });

    it('leaves out Features pending deletion', async () => {
        const db = setup([
            { id: 'a', remarks: '#FURY A' },
            { id: 'b', remarks: '#FURY B' },
        ]);
        db.pendingDelete.add('b');

        const index = await db.hashtags();

        expect(index[0].features.map((f) => f.id)).toEqual(['a']);
    });
});

describe('AtlasDatabase.add - Sticky Hashtags', () => {
    beforeEach(async () => {
        await KV.delete(STICKY_HASHTAGS_KEY);
    });

    const opts = { skipSave: true, skipBroadcast: true, skipDatabase: true, skipMissionLookup: true };

    it('appends the enabled sticky tags to a Feature the user creates', async () => {
        await StickyHashtags.save([
            { tag: '#FURY', enabled: true },
            { tag: '#FURYtaktik', enabled: true },
            { tag: '#ALT', enabled: false },
        ]);

        const db = setup([]);
        await db.add(feature('neu', 'Stellung Nord'), { ...opts, authored: true, created: true });

        expect(db.cots.get('neu')?.properties.remarks).toEqual('Stellung Nord #FURY #FURYtaktik');
    });

    it('fills empty remarks with the sticky tags only', async () => {
        await StickyHashtags.save([{ tag: '#FURY', enabled: true }]);

        const db = setup([]);
        await db.add(feature('neu'), { ...opts, authored: true, created: true });

        expect(db.cots.get('neu')?.properties.remarks).toEqual('#FURY');
    });

    it('never tags a Feature that was not created by the user', async () => {
        await StickyHashtags.save([{ tag: '#FURY', enabled: true }]);

        const db = setup([]);
        await db.add(feature('import', 'Aus Paket'), { ...opts, authored: true });
        await db.add(feature('empfangen', 'Vom Server'), opts);

        expect(db.cots.get('import')?.properties.remarks).toEqual('Aus Paket');
        expect(db.cots.get('empfangen')?.properties.remarks).toEqual('Vom Server');
    });

    it('leaves remarks unchanged without sticky tags', async () => {
        const db = setup([]);
        await db.add(feature('neu', 'Stellung Nord'), { ...opts, authored: true, created: true });

        expect(db.cots.get('neu')?.properties.remarks).toEqual('Stellung Nord');
    });
});

describe('StickyHashtags', () => {
    beforeEach(async () => {
        await KV.delete(STICKY_HASHTAGS_KEY);
    });

    it('adds, disables and removes tags', async () => {
        await StickyHashtags.add('FURY');
        await StickyHashtags.add('#furytaktik');
        await StickyHashtags.add('#FURY');
        expect(await StickyHashtags.list()).toEqual([
            { tag: '#FURY', enabled: true },
            { tag: '#furytaktik', enabled: true },
        ]);

        await StickyHashtags.setEnabled('#FURY', false);
        expect(await StickyHashtags.enabled()).toEqual(['#furytaktik']);

        await StickyHashtags.remove('#FURYTAKTIK');
        expect(await StickyHashtags.list()).toEqual([{ tag: '#FURY', enabled: false }]);
    });

    it('ignores a corrupt stored value', async () => {
        await KV.update(STICKY_HASHTAGS_KEY, 'not json');
        expect(await StickyHashtags.list()).toEqual([]);
    });
});
