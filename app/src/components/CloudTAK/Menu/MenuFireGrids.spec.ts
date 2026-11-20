import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flyTo = vi.fn();
const fitBounds = vi.fn();
const fitGrid = vi.fn();
const highlight = vi.fn();
const dbAdd = vi.fn(async () => undefined);
const refresh = vi.fn(async () => undefined);

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        map: { getCenter: () => ({ lng: 7.4386, lat: 46.9511 }), flyTo, fitBounds },
        fireGrid: { fitGrid, highlight },
        worker: { db: { add: dbAdd } },
        refresh
    })
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

vi.mock('../../../stores/modules/feature-visibility.ts', () => ({
    FeatureVisibility: { setFeaturesHidden: vi.fn() },
}));

import MenuFireGrids from './MenuFireGrids.vue';
import KV from '../../../base/kv.ts';
import FireGrids, { FIRE_GRIDS_KEY } from '../../../base/fire-grids.ts';
import { FIRE_GRID_DEFAULTS } from '../../../utils/fire-grid.ts';
import { EFP_FIXTURE_UID as UID, efpFixture } from '../../../test/fixtures/efp-fixture.ts';
import { fakeTargetHost } from '../../../test/fixtures/fire-grid-target-host.ts';
import type { VueWrapper } from '@vue/test-utils';

/** Choose a file in the EFP import, as the file picker (iPhone: Files app) does */
async function chooseEfpFile(wrapper: VueWrapper, data: Uint8Array, name = 'atak_paket.zip'): Promise<void> {
    const input = wrapper.find('[data-test="efp-file"]');
    Object.defineProperty(input.element, 'files', { value: [new File([data as BlobPart], name, { type: 'application/zip' })], configurable: true });
    await input.trigger('change');
}

async function render() {
    const wrapper = mount(MenuFireGrids, { global: { stubs: { teleport: true } } });
    await flushPromises();
    return wrapper;
}

let host: ReturnType<typeof fakeTargetHost>;

describe('MenuFireGrids', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await KV.delete(FIRE_GRIDS_KEY);
        FireGrids.state.loaded = false;
        FireGrids.state.grids = [];

        host = fakeTargetHost();
        FireGrids.targetHost = host;
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
        expect(hit.text()).toContain('2\u2009570\u2009958 / 1\u2009255\u2009625');
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

    it('imports the data package of the Einheitsfeuerplan: grid and targets that belong to it', async () => {
        const wrapper = await render();

        await chooseEfpFile(wrapper, efpFixture());
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').exists()).toBe(true));

        expect(wrapper.find('[data-test="efp-message"]').text()).toEqual('Fire grid EFP MERKUR Inf Kp 10/1 added · 4 targets imported');
        expect(wrapper.find('[data-test="efp-warning"]').exists()).toBe(false);
        expect(FireGrids.state.grids).toEqual([
            expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1', e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12, targets: expect.any(Array) })
        ]);
        expect(FireGrids.state.grids[0].targets).toHaveLength(4);

        // Local features through the target host, not through an authored add into a mission
        expect(host.put).toHaveBeenCalledTimes(4);
        expect(host.put).toHaveBeenCalledWith(expect.objectContaining({
            id: `${UID}-Z03`,
            properties: expect.objectContaining({ callsign: 'Z03 D2/6', type: 'b-m-p-s-m', archived: true })
        }));
        expect(dbAdd).not.toHaveBeenCalled();

        expect(refresh).toHaveBeenCalled();
        expect(fitGrid).toHaveBeenCalledWith(expect.objectContaining({ name: 'EFP MERKUR Inf Kp 10/1' }));
        expect(wrapper.findAll('[data-test="fire-grid-row"]')).toHaveLength(1);
        await vi.waitFor(() => expect(wrapper.find('[data-test="fire-grid-targets"]').text()).toEqual('4 targets, shown and hidden with the grid'));

        // The same file again: no second grid, no doubled targets
        await chooseEfpFile(wrapper, efpFixture());
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').text()).toContain('was already there'));
        expect(FireGrids.state.grids).toHaveLength(1);
        expect(FireGrids.state.grids[0].targets).toHaveLength(4);
        expect(host.features.size).toBe(4);
    });

    it('hides and shows the targets with the grid', async () => {
        const wrapper = await render();

        await chooseEfpFile(wrapper, efpFixture());
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').exists()).toBe(true));

        const toggle = wrapper.find('[data-test="fire-grid-row"] input[type="checkbox"]');
        await toggle.setValue(false);
        await vi.waitFor(() => expect(host.hidden.size).toBe(4));
        expect(FireGrids.state.grids[0].visible).toBe(false);

        await toggle.setValue(true);
        await vi.waitFor(() => expect(host.hidden.size).toBe(0));
        expect(FireGrids.state.grids[0].visible).toBe(true);
    });

    it('names the targets of a grid in the delete confirmation and deletes them with it', async () => {
        const wrapper = await render();

        await chooseEfpFile(wrapper, efpFixture());
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').exists()).toBe(true));
        refresh.mockClear();

        await wrapper.find('[data-test="fire-grid-delete"]').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Delete fire grid EFP MERKUR Inf Kp 10/1?');
        expect(wrapper.find('[data-test="fire-grid-delete-text"]').text()).toEqual('The grid is deleted together with 4 targets.');

        await wrapper.find('[data-test="fire-grid-delete-confirm"]').trigger('click');
        await vi.waitFor(() => expect(FireGrids.state.grids).toEqual([]));

        expect(host.features.size).toBe(0);
        expect(refresh).toHaveBeenCalled();
        await flushPromises();
        expect(wrapper.find('[data-test="fire-grid-delete-text"]').exists()).toBe(false);
    });

    it('deletes a grid without targets after the confirmation', async () => {
        await FireGrids.add({ name: 'Own', ...FIRE_GRID_DEFAULTS });
        const wrapper = await render();

        await wrapper.find('[data-test="fire-grid-delete"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-test="fire-grid-delete-text"]').text()).toEqual('The grid has no targets on this device, only the grid is deleted.');

        await wrapper.find('[data-test="fire-grid-delete-confirm"]').trigger('click');
        await vi.waitFor(() => expect(FireGrids.state.grids).toEqual([]));
        expect(refresh).not.toHaveBeenCalled();
    });

    it('reports targets of an earlier import that are still in a mission', async () => {
        host.missions.set(`${UID}-Z01`, { guid: 'm1', name: 'Data Sync Kp' });
        host.missions.set(`${UID}-Z02`, { guid: 'm1', name: 'Data Sync Kp' });
        host.missions.set(`${UID}-Z05`, { guid: 'm2', name: 'Uebung' });
        const wrapper = await render();

        await chooseEfpFile(wrapper, efpFixture());
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').exists()).toBe(true));

        expect(wrapper.find('[data-test="efp-message"]').text()).toEqual('Fire grid EFP MERKUR Inf Kp 10/1 added · 1 target imported');
        const warnings = wrapper.find('[data-test="efp-warning"]').findAll('div').map((d) => d.text());
        expect(warnings).toEqual([
            'Z01 B1/9, Z02 L7/5 are still in the mission Data Sync Kp from an earlier import and were left there unchanged. Delete them there and import this file again: then they belong to the fire grid.',
            'Z05 is still in the mission Uebung from an earlier import and was left there unchanged. Delete it there and import this file again: then it belongs to the fire grid.'
        ]);
        expect([...host.features.keys()]).toEqual([`${UID}-Z03`]);
        expect(host.remove).not.toHaveBeenCalled();
    });

    it('explains targets from a file without a grid', async () => {
        const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
        const files = unzipSync(efpFixture());
        const kept: Record<string, Uint8Array> = {};
        for (const [name, data] of Object.entries(files)) {
            if (!name.includes('-Raster')) kept[name] = data;
        }
        kept['MANIFEST/manifest.xml'] = strToU8(strFromU8(files['MANIFEST/manifest.xml'])
            .replace(/ {4}<Content zipEntry="[^"]*-Raster[^"]*" ignore="false">\n.*\n {4}<\/Content>\n/g, ''));

        const wrapper = await render();
        await chooseEfpFile(wrapper, zipSync(kept));
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-message"]').exists()).toBe(true));

        expect(wrapper.find('[data-test="efp-message"]').text()).toEqual(
            'No grid in this file (Einheitsfeuerplan before V1.5) · 4 targets imported. Without a grid the targets belong to no grid: they are features of this device in the folder atak_paket_Inf-Kp-10-1_MERKUR_2026-11-19 (menu Features), not in a mission.'
        );
        expect(FireGrids.state.grids).toEqual([]);
        expect(host.features.size).toBe(4);
        expect(fitBounds).toHaveBeenCalled();
    });

    it('says why a file cannot be imported', async () => {
        const wrapper = await render();

        await chooseEfpFile(wrapper, new TextEncoder().encode('no zip'), 'notes.zip');
        await vi.waitFor(() => expect(wrapper.find('[data-test="efp-error"]').exists()).toBe(true));

        expect(wrapper.find('[data-test="efp-error"]').text()).toEqual('The file is not a ZIP file or it is damaged');
        expect(dbAdd).not.toHaveBeenCalled();
        expect(FireGrids.state.grids).toEqual([]);
    });
});
