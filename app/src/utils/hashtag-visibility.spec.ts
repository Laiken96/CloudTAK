import { describe, expect, it } from 'vitest';
import { featureFilter, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import {
    HASHTAG_KEYS_PROPERTY,
    hiddenHashtagsExpression,
    hidingHashtag,
    renderedHashtagKeys,
} from './hashtag-visibility.ts';
import { indexHashtags } from './hashtags.ts';

/** A Feature as the map renders it, with the tag keys of its remarks */
function rendered(id: string, remarks?: string) {
    return {
        type: 1,
        id: 1,
        properties: { id, [HASHTAG_KEYS_PROPERTY]: renderedHashtagKeys(remarks) },
        geometry: []
    };
}

/** Would the layer filter of the hidden tags hide this Feature */
function hides(expression: ReturnType<typeof hiddenHashtagsExpression>, feature: ReturnType<typeof rendered> | { type: number, properties: Record<string, unknown>, geometry: [] }): boolean {
    if (!expression) return false;

    const filter = featureFilter(expression as FilterSpecification, 'layers[0].filter');
    return filter.filter({ zoom: 10 }, feature as Parameters<typeof filter.filter>[1]);
}

describe('renderedHashtagKeys', () => {
    it('lists the keys of the tags in the remarks, space delimited', () => {
        expect(renderedHashtagKeys('#Zug1 #Reserve Pz Kp 2')).toEqual(' #zug1 #reserve ');
    });

    it('is empty without a tag', () => {
        expect(renderedHashtagKeys('Pz Kp 2')).toEqual('');
        expect(renderedHashtagKeys('None')).toEqual('');
        expect(renderedHashtagKeys(undefined)).toEqual('');
        expect(renderedHashtagKeys('#')).toEqual('');
    });

    it('reads tags as the Hashtag Manager does', () => {
        const remarks = 'Inf#Zug1 #FURY\n#fury #Reserve,Nord';

        const manager = indexHashtags([remarks], (r) => r).map((entry) => entry.key);

        expect(renderedHashtagKeys(remarks).trim().split(' ').sort()).toEqual(manager.sort());
        expect(renderedHashtagKeys(remarks)).toEqual(' #zug1 #fury #reserve,nord ');
    });

    it('returns the same keys for repeated remarks', () => {
        expect(renderedHashtagKeys('#Zug1 A')).toEqual(renderedHashtagKeys('#Zug1 A'));
    });
});

describe('hiddenHashtagsExpression', () => {
    it('is null when no tag is hidden', () => {
        expect(hiddenHashtagsExpression([])).toBeNull();
        expect(hiddenHashtagsExpression(['', '#'])).toBeNull();
    });

    it('hides a Feature carrying the hidden tag', () => {
        const expression = hiddenHashtagsExpression(['#Zug1']);

        expect(hides(expression, rendered('a', '#Zug1 Pz Kp 2'))).toBe(true);
        expect(hides(expression, rendered('b', '#Reserve Pz Kp 3'))).toBe(false);
        expect(hides(expression, rendered('c', 'ohne Tag'))).toBe(false);
        expect(hides(expression, rendered('d'))).toBe(false);
    });

    it('ignores case like the Hashtag Manager', () => {
        const expression = hiddenHashtagsExpression(['#ZUG1']);

        expect(hides(expression, rendered('a', '#zug1'))).toBe(true);
        expect(hides(expression, rendered('b', '#Zug1'))).toBe(true);
    });

    it('matches whole tags only', () => {
        const expression = hiddenHashtagsExpression(['#Zug1']);

        expect(hides(expression, rendered('a', '#Zug10'))).toBe(false);
        expect(hides(expression, rendered('b', '#Zug1a'))).toBe(false);
        expect(hides(expression, rendered('c', '#xZug1'))).toBe(false);
        // The Hashtag Manager reads `#Zug1` out of `Inf#Zug1` as well
        expect(hides(expression, rendered('d', 'Inf#Zug1'))).toBe(true);
    });

    it('hides a Feature with several tags once one of them is hidden', () => {
        const expression = hiddenHashtagsExpression(['#Reserve', '#Zug2']);

        expect(hides(expression, rendered('a', '#Zug1 #Reserve'))).toBe(true);
        expect(hides(expression, rendered('b', '#Zug2 #FURY'))).toBe(true);
        expect(hides(expression, rendered('c', '#Zug1 #FURY'))).toBe(false);
    });

    it('shows a Feature again once the tag is gone from its remarks', () => {
        const expression = hiddenHashtagsExpression(['#Zug1']);

        expect(hides(expression, rendered('a', '#Zug1 Pz Kp 2'))).toBe(true);
        expect(hides(expression, rendered('a', 'Pz Kp 2'))).toBe(false);
    });

    it('leaves Features of other overlays without the property alone', () => {
        const expression = hiddenHashtagsExpression(['#Zug1']);

        expect(hides(expression, { type: 1, properties: { name: '#Zug1' }, geometry: [] })).toBe(false);
    });

    it('never hides an exempt Feature', () => {
        const expression = hiddenHashtagsExpression(['#MERKUR'], ['EFP-Z01']);

        expect(hides(expression, rendered('EFP-Z01', '#MERKUR Z01'))).toBe(false);
        expect(hides(expression, rendered('other', '#MERKUR Gegner'))).toBe(true);
    });
});

describe('hidingHashtag', () => {
    it('names the first hidden tag as written in the remarks', () => {
        expect(hidingHashtag('#FURY #Zug1 Pz Kp 2', new Set(['#zug1', '#reserve']))).toEqual('#Zug1');
    });

    it('is undefined when no tag of the remarks is hidden', () => {
        expect(hidingHashtag('#FURY Pz Kp 2', new Set(['#zug1']))).toBeUndefined();
        expect(hidingHashtag('#Zug1', new Set())).toBeUndefined();
        expect(hidingHashtag(undefined, new Set(['#zug1']))).toBeUndefined();
    });
});
