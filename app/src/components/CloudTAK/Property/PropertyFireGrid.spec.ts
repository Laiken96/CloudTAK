import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fitGrid = vi.fn();
const highlight = vi.fn();

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        fireGrid: { fitGrid, highlight }
    })
}));

import PropertyFireGrid from './PropertyFireGrid.vue';
import KV from '../../../base/kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from '../../../base/fire-grids.ts';
import { fireGridCenter, lv95ToLngLat } from '../../../utils/fire-grid.ts';

/** Remarks of the drawn frame in an Einheitsfeuerplan data package, after the server import */
const FRAME_REMARKS = '#MERKUR EFP MERKUR Inf Kp 10/1 · Raster 20 x 12 Zellen à 250 m, Kolonnen A–V, Reihen 1–12, '
    + 'Feinfelder 1–9 wie Telefontastatur · Raster-Link e0=2570000&n0=1256000&z=250&c=20&r=12';

/** A position in fine field D2/6 of that grid */
const CENTER = lv95ToLngLat(...fireGridCenter({ e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 }, { i: 4, j: 2, k: 6 }));

describe('PropertyFireGrid', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
    });

    it('adopts the grid of an Einheitsfeuerplan frame as a fire grid', async () => {
        const wrapper = mount(PropertyFireGrid, { props: { coordinates: CENTER, remarks: FRAME_REMARKS, name: 'EFP MERKUR Inf Kp 10/1' } });
        await flushPromises();

        const adopt = wrapper.find('[data-test="fire-grid-adopt"]');
        expect(adopt.text()).toContain('Einheitsfeuerplan grid, 20 × 12 cells of 250 m');

        await adopt.find('button').trigger('click');
        await vi.waitFor(() => expect(fitGrid).toHaveBeenCalledTimes(1));

        expect(FireGrids.state.grids).toEqual([
            expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 })
        ]);
        await flushPromises();
        expect(wrapper.find('[data-test="fire-grid-adopt"]').text()).toContain('Fire grid EFP MERKUR Inf Kp 10/1 is on this device');
        expect(wrapper.find('[data-test="fire-grid-adopt"] button').exists()).toBe(false);
        // The position now reads as a cell of the adopted grid
        expect(wrapper.text()).toContain('D2/6');
    });

    it('offers nothing for objects without a grid', async () => {
        const wrapper = mount(PropertyFireGrid, { props: { coordinates: CENTER, remarks: '#MERKUR Z03 D2/6 Brücke Nord' } });
        await flushPromises();

        expect(wrapper.find('[data-test="fire-grid-adopt"]').exists()).toBe(false);
    });
});
