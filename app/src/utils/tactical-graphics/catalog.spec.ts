import { describe, it, expect } from 'vitest';
import { CATALOG, GROUPS, catalogEntry, entryOf, sidcOf, callsignOf, defaultModel, AFFILIATION_COLORS } from './catalog.ts';
import { tacticalProperties, milsymOf } from './apply.ts';
import { RECIPES } from './recipes/index.ts';
import { FAMILY_COLORS } from '../appearance.ts';
import { tacticalOf } from './model.ts';

describe('tactical catalogue', () => {
    it('has unique ids, known groups and a recipe for every signature', () => {
        expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
        for (const entry of CATALOG) {
            expect(GROUPS.some((g) => g.id === entry.group), entry.id).toBe(true);
            expect(RECIPES[entry.sig], entry.id).toBeDefined();
            expect(entry.page, entry.id).toBeGreaterThanOrEqual(37);
            expect(entry.page, entry.id).toBeLessThanOrEqual(55);
        }
    });

    it('uses the colours of the 2525 symbols of the app', () => {
        expect(AFFILIATION_COLORS).toEqual({
            f: FAMILY_COLORS.friendly, h: FAMILY_COLORS.hostile, n: FAMILY_COLORS.neutral, u: FAMILY_COLORS.unknown,
        });
    });

    it('builds 2525C SIDCs with affiliation, status and echelon', () => {
        const boundary = catalogEntry('boundary')!;
        const sidc = sidcOf(boundary, { sig: 'boundary', ech: 'F' })!;
        expect(sidc).toBe('GFGPGLB----F--X');
        expect(sidc).toHaveLength(15);
        expect(sidc.charAt(11)).toBe('F');

        expect(sidcOf(catalogEntry('phase-line')!, { sig: 'phase-line', planned: true })).toBe('GFGAGLP---****X');
        expect(sidcOf(catalogEntry('flet')!, defaultModel(catalogEntry('flet')!))).toBe('GHGPGLF---****X');
        expect(sidcOf(catalogEntry('fire-coordination-line')!, { sig: 'fire-coordination-line' })).toBe('GFFPLCF---****X');
        expect(sidcOf(catalogEntry('strong-point')!, { sig: 'strong-point', aff: 'h' })).toBe('GHMPSP----****X');
        // Arrows travel without a code - their control points differ from 2525C
        expect(sidcOf(catalogEntry('main-attack')!, { sig: 'main-attack' })).toBeUndefined();
        for (const entry of CATALOG) {
            const code = sidcOf(entry, defaultModel(entry));
            if (code) expect(code, entry.id).toHaveLength(15);
        }
    });

    it('names the graphic', () => {
        expect(callsignOf(catalogEntry('phase-line')!, { sig: 'phase-line', t: 'GELB' })).toBe('PhL GELB');
        expect(callsignOf(catalogEntry('readiness-area')!, { sig: 'readiness-area', t: 'TANNE' })).toBe('BERRM TANNE');
        expect(callsignOf(catalogEntry('boundary')!, { sig: 'boundary', ech: 'F', t: '12', t1: '14' })).toBe('Sector boundary / control line II 12 | 14');
        expect(callsignOf(catalogEntry('movement-mechanised')!, { sig: 'movement-mechanised', t: '1. Kp' })).toBe('Mechanised movement 1. Kp');
    });

    it('finds the entry of a stored model', () => {
        expect(entryOf({ sig: 'indirect-fire', planned: true })?.id).toBe('indirect-fire-planned');
        expect(entryOf({ sig: 'indirect-fire' })?.id).toBe('indirect-fire');
        expect(entryOf({ sig: 'unknown' })).toBeUndefined();
    });

    it('gives other TAK clients colour, dashes, label and the 2525C graphic', () => {
        const entry = catalogEntry('phase-line')!;
        const props = tacticalProperties(entry, { sig: 'phase-line', t: 'GELB', planned: true });
        expect(props.stroke).toBe(FAMILY_COLORS.friendly);
        expect(props['stroke-style']).toBe('dashed');
        expect(props.labels).toBe(true);
        expect(props.callsign).toBe('PhL GELB');
        expect(props.milsym).toEqual({ id: 'GFGAGLP---****X', unitmodifier: [{ _attributes: { code: 'T' }, _text: 'GELB' }] });
        expect(tacticalOf(props)).toEqual({ sig: 'phase-line', t: 'GELB', planned: true });

        const areaProps = tacticalProperties(catalogEntry('assigned-area')!, { sig: 'assigned-area', aff: 'h' });
        expect(areaProps['stroke-style']).toBe('dashed');
        expect(areaProps.fill).toBe(FAMILY_COLORS.hostile);
        expect(areaProps['fill-opacity']).toBe(0);
        expect(areaProps.milsym).toBeUndefined();

        expect(milsymOf(catalogEntry('boundary')!, { sig: 'boundary', ech: 'E', t: '1', t1: '2' })).toEqual({
            id: 'GFGPGLB----E--X',
            unitmodifier: [{ _attributes: { code: 'T' }, _text: '1' }, { _attributes: { code: 'T1' }, _text: '2' }],
        });
    });

    it('keeps a stroke width the user chose', () => {
        const props = tacticalProperties(catalogEntry('movement')!, { sig: 'movement' }, { 'stroke-width': 5 });
        expect(props['stroke-width']).toBeUndefined();
    });
});
