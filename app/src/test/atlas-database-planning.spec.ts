import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import AtlasDatabase from '../workers/atlas-database.ts';
import COT, { OriginMode } from '../base/cot.ts';
import type Atlas from '../workers/atlas.ts';
import type { Feature } from '../types.ts';

function feature(id: string): Feature {
    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            type: 'u-d-f',
            how: 'h-e',
            archived: true,
            callsign: id,
            center: [7.5, 46.9, 0]
        },
        geometry: { type: 'LineString', coordinates: [[7.5, 46.9], [7.6, 46.95]] }
    } as unknown as Feature;
}

function setup(): AtlasDatabase {
    const atlas = {
        postMessage: vi.fn(async () => undefined),
        profile: { creator: vi.fn(async () => ({ uid: 'me', callsign: 'Me', type: 'a-f-G' })) }
    } as unknown as Atlas;

    return new AtlasDatabase(atlas);
}

const opts = { skipSave: true, skipBroadcast: true, skipDatabase: true, skipMissionLookup: true };

describe('AtlasDatabase.add - planning mode', () => {
    it('files a new own object into the plan even with an Active Mission', async () => {
        const db = setup();
        await db.makeActiveMission('mission-1');
        await db.setPlan('/Planung/Angriff Nord/');

        await db.add(feature('neu'), { ...opts, authored: true, created: true });

        const cot = db.cots.get('neu');
        expect(cot?.path).toBe('/Planung/Angriff Nord');
        expect(cot?.origin.mode).toBe(OriginMode.CONNECTION);
    });

    it('lets a plan be published: an explicit Mission origin wins over the plan', async () => {
        const db = setup();
        await db.setPlan('/Planung/Angriff Nord');

        const feat = feature('publiziert');
        feat.origin = { mode: OriginMode.MISSION, mode_id: 'mission-1' };

        // No such Mission is loaded in the test - the Mission branch is taken, not the plan
        await expect(db.add(feat, { ...opts, authored: true })).rejects.toThrow(/not loaded/);
        expect(db.cots.get('publiziert')).toBeUndefined();
    });

    it('leaves objects received from others where they are', async () => {
        const db = setup();
        await db.setPlan('/Planung/Angriff Nord');

        await db.add(feature('empfangen'), opts);

        expect(db.cots.get('empfangen')?.path).toBe('/');
    });

    it('does not move an existing object into the plan when it is edited', async () => {
        const db = setup();
        db.cots.set('alt', new COT(feature('alt'), undefined, { skipSave: true }));
        await db.setPlan('/Planung/Angriff Nord');

        const edit = feature('alt');
        edit.properties.callsign = 'Geändert';
        await db.add(edit, { ...opts, authored: true });

        expect(db.cots.get('alt')?.path).toBe('/');
        expect(db.cots.get('alt')?.properties.callsign).toBe('Geändert');
    });

    it('files objects as before once planning ends', async () => {
        const db = setup();
        await db.setPlan('/Planung/Angriff Nord');
        await db.setPlan(undefined);

        await db.add(feature('nachher'), { ...opts, authored: true, created: true });

        expect(db.cots.get('nachher')?.path).toBe('/');
    });
});
