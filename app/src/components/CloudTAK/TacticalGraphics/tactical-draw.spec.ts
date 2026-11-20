import { describe, expect, it, vi } from 'vitest';
import { startTactical } from './tactical-draw.ts';
import { catalogEntry } from '../../../utils/tactical-graphics/catalog.ts';
import { DrawToolMode } from '../../../stores/modules/draw.ts';

vi.mock('../../../stores/modules/draw.ts', () => ({
    DrawToolMode: { LINESTRING: 'linestring', POLYGON: 'polygon' }
}));

describe('startTactical', () => {
    it('draws a line with the signature as template and opens its editor', async () => {
        const draw = { start: vi.fn(), template: null as unknown };
        await startTactical({ draw } as never, catalogEntry('phase-line')!);

        expect(draw.start).toHaveBeenCalledWith(DrawToolMode.LINESTRING);
        const template = draw.template as { route: string; properties: Record<string, unknown> };
        expect(template.route).toBe('/cot/:id/tactical');
        expect(template.properties.chsig).toEqual({ _attributes: { sig: 'phase-line' } });
        expect(template.properties.callsign).toBe('PhL');
    });

    it('draws areas with the polygon tool', async () => {
        const draw = { start: vi.fn(), template: null as unknown };
        await startTactical({ draw } as never, catalogEntry('objective')!);
        expect(draw.start).toHaveBeenCalledWith(DrawToolMode.POLYGON);
    });
});
