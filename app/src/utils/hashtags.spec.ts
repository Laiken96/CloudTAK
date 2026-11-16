import { describe, expect, it } from 'vitest';
import {
    addHashtags,
    extractHashtags,
    hasHashtag,
    hashtagKey,
    indexHashtags,
    removeHashtag,
    stripHashtags,
    validateHashtag,
} from './hashtags.ts';

describe('extractHashtags', () => {
    it('reads tags up to the next whitespace, as ATAK does', () => {
        expect(extractHashtags('#FURY #FURYeinheiten Pz Kp 2')).toEqual(['#FURY', '#FURYeinheiten']);
        expect(extractHashtags('Stellung Nord #FURYtaktik')).toEqual(['#FURYtaktik']);
        expect(extractHashtags('Ziel#FURY')).toEqual(['#FURY']);
    });

    it('ends a tag at a line break', () => {
        expect(extractHashtags('#FURY\nPz Kp 2')).toEqual(['#FURY']);
    });

    it('lists each tag once, in the first spelling seen', () => {
        expect(extractHashtags('#FURY #fury #Fury #FURYgegner')).toEqual(['#FURY', '#FURYgegner']);
    });

    it('ignores a lone hash and anything that is not text', () => {
        expect(extractHashtags('# Kp 2')).toEqual([]);
        expect(extractHashtags(undefined)).toEqual([]);
        expect(extractHashtags(42)).toEqual([]);
    });
});

describe('validateHashtag - ATAK HashtagUtils.validateTag', () => {
    it('adds the hash and removes spaces', () => {
        expect(validateHashtag('FURY')).toEqual('#FURY');
        expect(validateHashtag(' #FURY ce ')).toEqual('#FURYce');
    });

    it('rejects an empty tag', () => {
        expect(validateHashtag('')).toEqual('');
        expect(validateHashtag('#')).toEqual('');
        expect(validateHashtag(undefined)).toEqual('');
    });
});

describe('addHashtags', () => {
    it('appends missing tags at the end, as ATAK does', () => {
        expect(addHashtags('Pz Kp 2', ['#FURY'])).toEqual('Pz Kp 2 #FURY');
        expect(addHashtags('', ['#FURY', 'FURYeinheiten'])).toEqual('#FURY #FURYeinheiten');
        expect(addHashtags(undefined, ['#FURY'])).toEqual('#FURY');
    });

    it('does not repeat a tag the remarks already carry in any case', () => {
        expect(addHashtags('#fury Pz Kp 2', ['#FURY'])).toEqual('#fury Pz Kp 2');
        expect(addHashtags('Pz Kp 2', ['#FURY', '#fury'])).toEqual('Pz Kp 2 #FURY');
    });
});

describe('removeHashtag', () => {
    it('removes the whole tag in any case', () => {
        expect(removeHashtag('#FURY #FURYeinheiten Pz Kp 2', '#fury')).toEqual('#FURYeinheiten Pz Kp 2');
    });

    it('never removes part of a longer tag', () => {
        expect(removeHashtag('#FURYgegner Inf', '#FURY')).toEqual('#FURYgegner Inf');
    });

    it('keeps line breaks', () => {
        expect(removeHashtag('#FURY Pz Kp 2\nZug 1', 'FURY')).toEqual('Pz Kp 2\nZug 1');
    });
});

describe('stripHashtags', () => {
    it('leaves the designation of a unit', () => {
        expect(stripHashtags('#FURY #FURYeinheiten Pz Kp 2')).toEqual('Pz Kp 2');
        expect(stripHashtags('Stellung\nNord #FURYtaktik')).toEqual('Stellung Nord');
    });

    it('is empty for the remarks placeholder and non text', () => {
        expect(stripHashtags('None')).toEqual('');
        expect(stripHashtags(undefined)).toEqual('');
    });
});

describe('hasHashtag', () => {
    it('matches case-insensitively and only whole tags', () => {
        expect(hasHashtag('#FURY Pz', '#fury')).toBe(true);
        expect(hasHashtag('#FURYgegner', '#FURY')).toBe(false);
    });
});

describe('indexHashtags', () => {
    it('groups items by tag and sorts the tags alphabetically', () => {
        const items = [
            { id: 'a', remarks: '#FURY #FURYeinheiten Pz Kp 2' },
            { id: 'b', remarks: '#fury #FURYgegner Inf' },
            { id: 'c', remarks: 'kein Tag' },
        ];

        const index = indexHashtags(items, (i) => i.remarks);

        expect(index.map((e) => [e.tag, e.items.map((i) => i.id)])).toEqual([
            ['#FURY', ['a', 'b']],
            ['#FURYeinheiten', ['a']],
            ['#FURYgegner', ['b']],
        ]);
        expect(index[0].key).toEqual(hashtagKey('#FURY'));
    });
});
