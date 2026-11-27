import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import KV from './kv.ts';
import GridLines, { GRID_LINES_DEFAULTS, GRID_LINES_KEY } from './grid-lines.ts';

describe('GridLines', () => {
    beforeEach(async () => {
        await KV.delete(GRID_LINES_KEY);
        Object.assign(GridLines.state, GRID_LINES_DEFAULTS, { loaded: false });
    });

    it('starts as ATAK does: hidden, MGRS, white', async () => {
        expect(await GridLines.load()).toEqual({ visible: false, type: 'MGRS', color: '#ffffff' });
    });

    it('keeps the settings on this device', async () => {
        await GridLines.update({ visible: true, color: '#FF00FF' });
        await GridLines.update({ type: 'Degrees, Minutes, Seconds' });

        GridLines.state.loaded = false;
        expect(await GridLines.load()).toEqual({ visible: true, type: 'Degrees, Minutes, Seconds', color: '#ff00ff' });
    });

    it('keeps the Swiss grid LV95', async () => {
        await GridLines.update({ type: 'LV95' });

        GridLines.state.loaded = false;
        expect((await GridLines.load()).type).toEqual('LV95');
    });

    it('falls back to the defaults for stored values it does not know', () => {
        expect(GridLines.parse('{"visible":"yes","type":"UTM","color":"red"}')).toEqual(GRID_LINES_DEFAULTS);
        expect(GridLines.parse('not json')).toEqual(GRID_LINES_DEFAULTS);
        expect(GridLines.parse(undefined)).toEqual(GRID_LINES_DEFAULTS);
    });
});
