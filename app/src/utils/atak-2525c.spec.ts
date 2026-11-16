import { describe, expect, it } from 'vitest';
import { isCotAtomType, mil2525cFromCotType, parent2525c } from './atak-2525c.ts';

describe('mil2525cFromCotType - ATAK CotUtils.mil2525cFromCotType', () => {
    // Expected codes as ATAK-CIV 5.5.1.10 derives them
    for (const [type, code] of [
        ['a-f-G-U-C-I-Z', 'sfgpuciz-------'],
        ['a-f-G-U-C-A', 'sfgpuca--------'],
        ['a-f-G-U-C-E', 'sfgpuce--------'],
        ['a-f-G-U-C-F-M', 'sfgpucfm-------'],
        ['a-f-G-U-C-V-U', 'sfgpucvu-------'],
        ['a-f-G-U-C-R', 'sfgpucr--------'],
        ['a-h-G-U-C-I', 'shgpuci--------'],
        ['a-f-G', 'sfgp-----------'],
        ['a-f-A-M-F', 'sfapmf---------'],
        ['a-h-G-U-C-I-d', 'shgpucid-------'],
    ]) {
        it(`${type} -> ${code}`, () => {
            expect(mil2525cFromCotType(type)).toEqual(code);
        });
    }

    it('maps every affiliation like ATAK', () => {
        expect(mil2525cFromCotType('a-a-G')).toEqual('sfgp-----------');
        expect(mil2525cFromCotType('a-n-G')).toEqual('sngp-----------');
        expect(mil2525cFromCotType('a-s-G')).toEqual('shgp-----------');
        expect(mil2525cFromCotType('a-j-G')).toEqual('shgp-----------');
        expect(mil2525cFromCotType('a-k-G')).toEqual('shgp-----------');
        expect(mil2525cFromCotType('a-u-G')).toEqual('sugp-----------');
        expect(mil2525cFromCotType('a-p-G')).toEqual('sugp-----------');
    });

    it('marks a ground installation with the installation modifier', () => {
        expect(mil2525cFromCotType('a-f-G-I-B')).toEqual('sfgpib----h----');
    });

    it('converts only CoT Atom Types', () => {
        expect(mil2525cFromCotType('a-f')).toBeUndefined();
        expect(mil2525cFromCotType('u-d-p')).toBeUndefined();
        expect(mil2525cFromCotType('b-m-p-s-m')).toBeUndefined();
        expect(mil2525cFromCotType('13061500000000000000')).toBeUndefined();
        expect(mil2525cFromCotType('f7f71666-8b28-4b57-9fbb-e38e61d33b79:Vehicle/Ambulance')).toBeUndefined();
    });
});

describe('isCotAtomType', () => {
    it('accepts Atom Types and rejects everything else', () => {
        expect(isCotAtomType('a-f-G-U-C-I')).toBe(true);
        expect(isCotAtomType('b-r-f-h-c')).toBe(false);
        expect(isCotAtomType('a-f')).toBe(false);
        expect(isCotAtomType(undefined)).toBe(false);
    });
});

describe('parent2525c - ATAK falls back to the parent CoT Type', () => {
    it('walks up the function ID to the battle dimension', () => {
        expect(parent2525c('sfgpuciz-------')).toEqual('sfgpuci--------');
        expect(parent2525c('sfgpuci--------')).toEqual('sfgpuc---------');
        expect(parent2525c('sfgpu----------')).toEqual('sfgp-----------');
        expect(parent2525c('sfgp-----------')).toBeUndefined();
    });

    it('matches converting the parent CoT Type', () => {
        expect(parent2525c(mil2525cFromCotType('a-f-G-U-C-F-M')!)).toEqual(mil2525cFromCotType('a-f-G-U-C-F'));
        expect(parent2525c(mil2525cFromCotType('a-f-G-I-B')!)).toEqual(mil2525cFromCotType('a-f-G-I'));
        expect(parent2525c(mil2525cFromCotType('a-f-G-I')!)).toEqual(mil2525cFromCotType('a-f-G'));
    });
});
