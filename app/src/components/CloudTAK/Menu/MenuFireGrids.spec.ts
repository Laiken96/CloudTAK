import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flyTo = vi.fn();
const fitGrid = vi.fn();
const highlight = vi.fn();
const dbAdd = vi.fn(async () => undefined);
const refresh = vi.fn(async () => undefined);

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        map: { getCenter: () => ({ lng: 7.4386, lat: 46.9511 }), flyTo },
        fireGrid: { fitGrid, highlight },
        worker: { db: { add: dbAdd } },
        refresh
    })
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

import MenuFireGrids from './MenuFireGrids.vue';
import KV from '../../../base/kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from '../../../base/fire-grids.ts';
import { FIRE_GRID_DEFAULTS } from '../../../utils/fire-grid.ts';

async function render() {
    const wrapper = mount(MenuFireGrids);
    await flushPromises();
    return wrapper;
}

describe('MenuFireGrids', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];
    });

    it('offers to create the first grid', async () => {
        const wrapper = await render();
        expect(wrapper.text()).toContain('No Fire Grids');
    });

    it('takes over the grid of an Einheitsfeuerplan link', async () => {
        const wrapper = await render();

        await wrapper.find('[title="New Fire Grid"]').trigger('click');
        await wrapper.find('#fire-grid-name input').setValue('EFP MERKUR');
        await wrapper.find('#fire-grid-link input').setValue('file:///C:/EFP/Einheitsfeuerplan_V1.3.html#e0=2571000&n0=1257000&z=125&c=30&r=20');
        await flushPromises();

        expect(wrapper.text()).toContain('30 × 20 cells of 125 m · 3.8 × 2.5 km');

        await wrapper.find('[data-test="fire-grid-form"]').trigger('submit');
        // Saving waits for IndexedDB, which settles on timers rather than microtasks
        await vi.waitFor(() => expect(fitGrid).toHaveBeenCalledTimes(1));

        expect(FireGrids.state.grids).toEqual([
            expect.objectContaining({ name: 'EFP MERKUR', e0: 2571000, n0: 1257000, z: 125, ncols: 30, nrows: 20, visible: true })
        ]);
        expect(wrapper.findAll('[data-test="fire-grid-row"]')).toHaveLength(1);
    });

    it('finds a cell, shows it and places a marker there', async () => {
        await FireGrids.add({ name: 'EFP', ...FIRE_GRID_DEFAULTS });
        const wrapper = await render();

        await wrapper.find('#fire-grid-find input').setValue('d2/6');
        await wrapper.find('[title="Find Cell"]').trigger('click');
        await flushPromises();

        const hit = wrapper.find('[data-test="fire-grid-hit"]');
        expect(hit.text()).toContain('D2/6');
        expect(hit.text()).toContain('Delta Two Six');
        expect(hit.text()).toContain('2570958 / 1255625');
        expect(flyTo).toHaveBeenCalledTimes(1);
        expect(highlight).toHaveBeenCalledWith(expect.objectContaining({ name: 'EFP' }), { i: 4, j: 2, k: 6 });

        await wrapper.find('[title="Place a marker at D2/6"]').trigger('click');
        await flushPromises();

        expect(dbAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({ callsign: 'D2/6', remarks: 'D2/6 · Delta Two Six · EFP' })
            }),
            { authored: true, created: true, skipMissionLookup: true }
        );
    });

    it('says when a cell is in no shown grid', async () => {
        await FireGrids.add({ name: 'EFP', ...FIRE_GRID_DEFAULTS });
        const wrapper = await render();

        await wrapper.find('#fire-grid-find input').setValue('Z99');
        await wrapper.find('[title="Find Cell"]').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Z99 is in none of the shown grids');
        expect(flyTo).not.toHaveBeenCalled();
    });
});
