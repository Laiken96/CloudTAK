import { describe, it, expect } from 'vitest';
import { tacticalOf, chsigOf, labelText, echelonSign, PREFIXES } from './model.ts';

describe('tactical model', () => {
    it('reads the chsig detail as it arrives from XML', () => {
        expect(tacticalOf({ chsig: { _attributes: { sig: 'boundary', t: '12', t1: ' 14 ', ech: 'F', aff: 'h', planned: 'true', width: '250' } } })).toEqual({
            sig: 'boundary', t: '12', t1: '14', ech: 'F', aff: 'h', planned: true, width: 250,
        });
    });

    it('ignores invalid values and non-tactical features', () => {
        expect(tacticalOf({})).toBeUndefined();
        expect(tacticalOf({ chsig: 'boundary' })).toBeUndefined();
        expect(tacticalOf({ chsig: { _attributes: { t: 'X' } } })).toBeUndefined();
        expect(tacticalOf({ chsig: { _attributes: { sig: 'flot', ech: 'Z', aff: 'x', planned: 'no', width: '-3' } } })).toEqual({ sig: 'flot' });
        expect(tacticalOf({ chsig: [{ _attributes: { sig: 'flot' } }] })).toEqual({ sig: 'flot' });
    });

    it('writes the detail and keeps attributes of newer clients', () => {
        const previous = { _attributes: { sig: 'old', t: 'A', future: 'kept' } };
        expect(chsigOf({ sig: 'phase-line', t: 'GELB', planned: true, width: 120.4 }, previous)).toEqual({
            _attributes: { future: 'kept', sig: 'phase-line', t: 'GELB', planned: 'true', width: '120' },
        });
    });

    it('builds labels and hierarchy signs', () => {
        expect(labelText(PREFIXES.phaseLine, { sig: 'phase-line', t: 'GELB' })).toBe('PhL GELB');
        expect(labelText(undefined, { sig: 'movement' })).toBe('');
        expect(echelonSign('F')).toBe('II');
        expect(echelonSign('D')).toBe('●●●');
        expect(echelonSign(undefined)).toBeUndefined();
    });
});
