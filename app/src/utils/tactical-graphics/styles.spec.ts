import { describe, it, expect } from 'vitest';
import styles from '../styles.ts';
import { tacticalLayers } from './styles.ts';

describe('tactical graphic layers', () => {
    const layers = styles('cots', { icons: true, course: true, group: true, labels: { size: 8 } });
    const byId = new Map(layers.map((l) => [l.id, l]));

    it('keeps tactical graphics out of the generic shape layers', () => {
        for (const id of ['cots-poly', 'cots-polyline', 'cots-line', 'cots-text-line', 'cots-text-poly']) {
            expect(JSON.stringify((byId.get(id) as { filter: unknown }).filter), id).toContain('["!",["has","chsig"]]');
        }
    });

    it('keeps derived points out of the generic point layers', () => {
        for (const id of ['cots', 'cots-icon', 'cots-course', 'cots-group', 'cots-text-point']) {
            expect(JSON.stringify((byId.get(id) as { filter: unknown }).filter), id).toContain('["!",["has","derived"]]');
        }
    });

    it('adds the tactical layers below the point layers, once', () => {
        const ids = layers.map((l) => l.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.indexOf('cots-tg-line')).toBeGreaterThan(ids.indexOf('cots-line'));
        expect(ids.indexOf('cots-tg-text')).toBeLessThan(ids.indexOf('cots'));
        expect(tacticalLayers('x').every((l) => ids.includes(l.id.replace(/^x/, 'cots')))).toBe(true);
    });

    it('sets the source layer of vector sources', () => {
        const vector = styles('7', { sourceLayer: 'out' });
        for (const layer of vector.filter((l) => l.id.startsWith('7-tg-'))) {
            expect((layer as { 'source-layer'?: string })['source-layer']).toBe('out');
        }
    });
});
