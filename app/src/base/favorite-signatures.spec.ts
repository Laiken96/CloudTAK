import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database.ts';
import FavoriteSignatures, { signatureOf } from './favorite-signatures.ts';
import type { Signature } from '../utils/signature.ts';

const INFANTRY: Signature = { type: '10061000001211000000' };
const TANK: Signature = { type: '10031500001202000000' };
const FIRE: Signature = { type: 'u-d-p', icon: 'iconset-uid:Incident/Fire', color: '#ff0000' };

/** Forget the in-memory list so the next call reads IndexedDB again, as after a reload */
function reload(): void {
    FavoriteSignatures.state.loaded = false;
    FavoriteSignatures.state.items = [];
}

function labels(): string[] {
    return FavoriteSignatures.state.items.map((item) => item.label);
}

describe('FavoriteSignatures', () => {
    beforeEach(async () => {
        await db.favorite_signature.clear();
        reload();
    });

    it('starts empty', async () => {
        expect(await FavoriteSignatures.load()).toEqual([]);
        expect(FavoriteSignatures.has(INFANTRY)).toBe(false);
    });

    it('adds favourites in order and keeps them on this device', async () => {
        await FavoriteSignatures.add(INFANTRY, ' Infantry ');
        await FavoriteSignatures.add(TANK, 'Tank');
        await FavoriteSignatures.add(FIRE, 'Fire');

        expect(labels()).toEqual(['Infantry', 'Tank', 'Fire']);
        expect(FavoriteSignatures.has(FIRE)).toBe(true);

        reload();
        const items = await FavoriteSignatures.load();

        expect(items.map((item) => item.label)).toEqual(['Infantry', 'Tank', 'Fire']);
        expect(items.map((item) => item.sort)).toEqual([0, 1, 2]);
        expect(signatureOf(items[2])).toEqual({ type: 'u-d-p', icon: 'iconset-uid:Incident/Fire', color: '#FF0000' });
    });

    it('keeps a signature only once', async () => {
        const first = await FavoriteSignatures.add(INFANTRY, 'Infantry');
        const again = await FavoriteSignatures.add({ ...INFANTRY }, 'Other name');

        expect(again.id).toBe(first.id);
        expect(labels()).toEqual(['Infantry']);
        expect(await db.favorite_signature.count()).toBe(1);

        // The colour of an icon is part of the signature, its letter case is not
        await FavoriteSignatures.add(FIRE, 'Fire');
        await FavoriteSignatures.add({ ...FIRE, color: '#FF0000' }, 'Fire again');
        await FavoriteSignatures.add({ ...FIRE, color: '#0000FF' }, 'Blue fire');
        expect(labels()).toEqual(['Infantry', 'Fire', 'Blue fire']);
    });

    it('removes a favourite', async () => {
        await FavoriteSignatures.add(INFANTRY, 'Infantry');
        const tank = await FavoriteSignatures.add(TANK, 'Tank');

        await FavoriteSignatures.remove(tank.id);

        expect(labels()).toEqual(['Infantry']);
        expect(FavoriteSignatures.has(TANK)).toBe(false);
        expect(await db.favorite_signature.get(tank.id)).toBeUndefined();

        // Removing what is not there is harmless
        await FavoriteSignatures.remove('missing');
        expect(labels()).toEqual(['Infantry']);
    });

    it('toggles a signature on and off', async () => {
        expect(await FavoriteSignatures.toggle(TANK, 'Tank')).toBe(true);
        expect(FavoriteSignatures.has(TANK)).toBe(true);

        expect(await FavoriteSignatures.toggle(TANK, 'Tank')).toBe(false);
        expect(FavoriteSignatures.has(TANK)).toBe(false);
        expect(await db.favorite_signature.count()).toBe(0);
    });

    it('moves favourites and keeps the order after a reload', async () => {
        const infantry = await FavoriteSignatures.add(INFANTRY, 'Infantry');
        await FavoriteSignatures.add(TANK, 'Tank');
        const fire = await FavoriteSignatures.add(FIRE, 'Fire');

        await FavoriteSignatures.move(fire.id, -1);
        expect(labels()).toEqual(['Infantry', 'Fire', 'Tank']);

        // Clamped at the ends
        await FavoriteSignatures.move(fire.id, -5);
        expect(labels()).toEqual(['Fire', 'Infantry', 'Tank']);
        await FavoriteSignatures.move(fire.id, -1);
        expect(labels()).toEqual(['Fire', 'Infantry', 'Tank']);

        await FavoriteSignatures.move(infantry.id, 1);
        expect(labels()).toEqual(['Fire', 'Tank', 'Infantry']);

        reload();
        await FavoriteSignatures.load();
        expect(labels()).toEqual(['Fire', 'Tank', 'Infantry']);

        // A new favourite goes to the end
        await FavoriteSignatures.add({ type: 'u-d-p', color: '#00FF00' }, 'Spot');
        expect(labels()).toEqual(['Fire', 'Tank', 'Infantry', 'Spot']);
    });

    it('reorders by a list of ids, unlisted ones keep their place after it', async () => {
        const infantry = await FavoriteSignatures.add(INFANTRY, 'Infantry');
        const tank = await FavoriteSignatures.add(TANK, 'Tank');
        await FavoriteSignatures.add(FIRE, 'Fire');

        await FavoriteSignatures.reorder([tank.id, 'missing', infantry.id]);
        expect(labels()).toEqual(['Tank', 'Infantry', 'Fire']);
    });

    it('renames a favourite, an empty name falls back to the type', async () => {
        const tank = await FavoriteSignatures.add(TANK, 'Tank');

        await FavoriteSignatures.rename(tank.id, '  Kampfpanzer ');
        expect(labels()).toEqual(['Kampfpanzer']);

        await FavoriteSignatures.rename(tank.id, '');
        expect(labels()).toEqual([TANK.type]);

        reload();
        await FavoriteSignatures.load();
        expect(labels()).toEqual([TANK.type]);

        await expect(FavoriteSignatures.rename('missing', 'x')).rejects.toThrow('not found');
    });
});
