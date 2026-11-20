import { describe, it, expect } from 'vitest';
import type { Feature } from '../../types.ts';
import { tacticalDerived, DERIVED_TACTICAL } from './derive.ts';
import { chsigOf, type TacticalModel } from './model.ts';
import { RECIPES } from './recipes/index.ts';

const vectorId = (id: string): number => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return h >>> 0;
};

function line(model: TacticalModel, coordinates: number[][] = [[7.40, 47.0], [7.42, 47.005], [7.44, 47.0]], extra: Record<string, unknown> = {}): Feature {
    return {
        id: 'tg-1',
        type: 'Feature',
        path: '/',
        properties: { id: 'tg-1', stroke: '#80E0FF', chsig: chsigOf(model), ...extra },
        geometry: { type: 'LineString', coordinates },
    } as unknown as Feature;
}

function area(model: TacticalModel): Feature {
    return {
        id: 'tg-2',
        type: 'Feature',
        path: '/',
        properties: { id: 'tg-2', stroke: '#ff8080', chsig: chsigOf(model) },
        geometry: { type: 'Polygon', coordinates: [[[7.40, 47.0], [7.42, 47.0], [7.42, 47.01], [7.40, 47.01], [7.40, 47.0]]] },
    } as unknown as Feature;
}

const kinds = (features: ReturnType<typeof tacticalDerived>) => features.map((f) => f.properties.tgk);

describe('tactical derived features', () => {
    it('leaves other features alone', () => {
        const plain = line({ sig: 'phase-line' });
        delete plain.properties.chsig;
        expect(tacticalDerived(plain, vectorId)).toEqual([]);
        expect(tacticalDerived({ ...line({ sig: 'flot' }), geometry: { type: 'Point', coordinates: [7, 47] } } as unknown as Feature, vectorId)).toEqual([]);
    });

    it('draws a boundary with its hierarchy sign and the units on either side', () => {
        const out = tacticalDerived(line({ sig: 'boundary', ech: 'F', t: '12', t1: '14' }), vectorId);
        expect(kinds(out)).toEqual(['line', 'icon', 'tmap', 'tmap']);
        expect(out[1].properties.icon).toBe('tg-ech-F-80e0ff');
        expect(out[2].properties.txt).toBe('12');
        expect(out[2].properties.tof).toEqual([0, -1.35]);
        expect(out[3].properties.tof).toEqual([0, 1.35]);
        for (const f of out) {
            expect(f.properties.id).toBe('tg-1');
            expect(f.properties.derived).toBe(DERIVED_TACTICAL);
        }
        expect(new Set(out.map((f) => f.id)).size).toBe(out.length);
    });

    it('keeps text upright and on the same side for lines drawn westwards', () => {
        const out = tacticalDerived(line({ sig: 'boundary', t: '12' }, [[7.44, 47.0], [7.40, 47.0]]), vectorId);
        const text = out.find((f) => f.properties.tgk === 'tmap')!;
        expect(text.properties.rot).toBeCloseTo(0);
        expect(text.properties.tof).toEqual([0, 1.35]);
    });

    it('labels both ends of a phase line', () => {
        const out = tacticalDerived(line({ sig: 'phase-line', t: 'GELB' }), vectorId);
        const labels = out.filter((f) => f.properties.tgk === 'tview');
        expect(labels.map((f) => f.properties.txt)).toEqual(['PhL GELB', 'PhL GELB']);
        expect(labels.map((f) => f.properties.anchor)).toEqual(['top-left', 'top-right']);
    });

    it('dashes planned graphics', () => {
        const out = tacticalDerived(line({ sig: 'phase-line', planned: true }), vectorId);
        expect(out[0].properties.dash).toBe('dashed');
    });

    it('draws front lines with a pattern only', () => {
        const out = tacticalDerived(line({ sig: 'flot' }), vectorId);
        expect(kinds(out)).toEqual(['pat']);
        expect(out[0].properties.pat).toBe('tg-arc-80e0ff');
    });

    it('builds broad arrows in metres around the drawn line', () => {
        const out = tacticalDerived(line({ sig: 'main-attack', width: 300 }), vectorId);
        expect(kinds(out).filter((k) => k === 'line').length).toBe(4);
    });

    it('labels areas inside and copies the zoom range', () => {
        const feature = area({ sig: 'objective', t: 'EICHE' });
        feature.properties.minzoom = 10;
        const out = tacticalDerived(feature, vectorId);
        const label = out.find((f) => f.properties.tgk === 'tview')!;
        expect(label.properties.txt).toBe('AZ EICHE');
        expect(out.every((f) => f.properties.minzoom === 10)).toBe(true);
    });

    it('falls back to the plain outline for unknown signatures', () => {
        const out = tacticalDerived(line({ sig: 'from-a-newer-version', t: 'X' }), vectorId);
        expect(kinds(out)).toEqual(['line', 'tmap']);
    });

    it('draws every recipe from a line and an area without failing', () => {
        for (const sig of Object.keys(RECIPES)) {
            const fromLine = tacticalDerived(line({ sig, t: 'A', t1: 'B', ech: 'F' }), vectorId);
            const fromArea = tacticalDerived(area({ sig, t: 'A' }), vectorId);
            expect(fromLine.length, sig).toBeGreaterThan(0);
            expect(fromArea.length, sig).toBeGreaterThan(0);
            for (const f of [...fromLine, ...fromArea]) {
                const coords = JSON.stringify(f.geometry);
                expect(coords.includes('null') || coords.includes('NaN'), `${sig} ${coords}`).toBe(false);
            }
        }
    });
});
