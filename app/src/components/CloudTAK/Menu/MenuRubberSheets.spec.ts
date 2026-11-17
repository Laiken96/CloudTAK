import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const edit = vi.fn();
const stopEdit = vi.fn();
const settled = vi.fn(async () => undefined);
const fitBounds = vi.fn();
const once = vi.fn();
const off = vi.fn();

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        map: {
            getCenter: () => ({ lng: 7.0536, lat: 47.4508 }),
            getBounds: () => ({ getWest: () => 7.03, getEast: () => 7.08, getNorth: () => 47.46, getSouth: () => 47.44 }),
            getCanvas: () => ({ style: {} }),
            fitBounds,
            once,
            off
        },
        rubberSheet: { edit, stopEdit, settled }
    })
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

import MenuRubberSheets from './MenuRubberSheets.vue';
import { db } from '../../../database.ts';
import RubberSheets from '../../../base/rubber-sheets.ts';
import { lv95ToLngLat } from '../../../utils/fire-grid.ts';
import { parseCoordPair } from '../../../utils/coordinateFormat.ts';
import { placeImage, quadFromControlPoints } from '../../../utils/rubbersheet.ts';

/** jsdom fills in no click position, so set it on the event */
function clickAt(el: Element, offsetX: number, offsetY: number): void {
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'offsetX', { value: offsetX });
    Object.defineProperty(event, 'offsetY', { value: offsetY });
    el.dispatchEvent(event);
}

async function render() {
    const wrapper = mount(MenuRubberSheets);
    await flushPromises();
    return wrapper;
}

async function addSheet() {
    return await RubberSheets.add({
        name: 'Lageskizze FURY',
        image: new NodeBlob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) as unknown as Blob,
        width: 1000,
        height: 800,
        corners: placeImage(1000, 800, [7.0536, 47.4508], 800)
    });
}

describe('MenuRubberSheets', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubGlobal('Blob', NodeBlob);
        URL.createObjectURL = vi.fn(() => 'blob:sheet');
        await db.rubber_sheet.clear();
        RubberSheets.state.loaded = false;
        RubberSheets.state.sheets = [];
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('offers to add the first sheet', async () => {
        const wrapper = await render();
        expect(wrapper.text()).toContain('No Rubber Sheets');
    });

    it('lists a sheet with its ground size and opens its editor', async () => {
        const sheet = await addSheet();
        const wrapper = await render();

        const row = wrapper.find('[data-test="rubber-sheet-row"]');
        expect(row.text()).toContain('Lageskizze FURY');
        expect(row.text()).toContain('800 m × 640 m');

        await wrapper.find('[title="Edit Lageskizze FURY"]').trigger('click');
        await flushPromises();

        expect(edit).toHaveBeenCalledWith(sheet.id);
        expect(wrapper.find('[data-test="rubber-sheet-editor"]').exists()).toBe(true);
    });

    it('places a sheet by two control points on the image and typed coordinates', async () => {
        const sheet = await addSheet();
        const wrapper = await render();

        await wrapper.find('[title="Edit Lageskizze FURY"]').trigger('click');
        await flushPromises();

        const img = wrapper.find('[data-test="rubber-sheet-preview"] img');
        Object.defineProperty(img.element, 'clientWidth', { value: 500 });
        Object.defineProperty(img.element, 'clientHeight', { value: 400 });

        // Shown at half size: (50, 100) on screen is pixel (100, 200) of the image
        clickAt(img.element, 50, 100);
        clickAt(img.element, 400, 300);

        await wrapper.find('#rubber-sheet-coord-1 input').setValue("2'570'958 / 1'255'625");
        await wrapper.find('[title="Use the typed coordinates for point 1"]').trigger('click');
        await wrapper.find('#rubber-sheet-coord-2 input').setValue('32TLT5380056500');
        await wrapper.find('[title="Use the typed coordinates for point 2"]').trigger('click');
        await flushPromises();

        expect(wrapper.find('[data-test="rubber-sheet-point-1"]').text()).toContain('on map ✓');
        expect(wrapper.find('[data-test="rubber-sheet-point-2"]').text()).toContain('on map ✓');

        await wrapper.find('[data-test="rubber-sheet-apply"]').trigger('click');
        await flushPromises();

        const [lat2, lng2] = parseCoordPair('32TLT5380056500');
        const expected = quadFromControlPoints(1000, 800, [100, 200], [800, 600], lv95ToLngLat(2570958, 1255625), [lng2, lat2]);

        expect(RubberSheets.get(sheet.id)?.corners).toEqual(expected);
        // Zooms once IndexedDB has stored the corners, which settles on timers
        await vi.waitFor(() => expect(fitBounds).toHaveBeenCalled());
    });

    it('rejects text that is no coordinate', async () => {
        await addSheet();
        const wrapper = await render();

        await wrapper.find('[title="Edit Lageskizze FURY"]').trigger('click');
        await flushPromises();

        await wrapper.find('#rubber-sheet-coord-1 input').setValue('Brücke Nord');
        await wrapper.find('[title="Use the typed coordinates for point 1"]').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('Not a coordinate');
        expect(wrapper.find('[data-test="rubber-sheet-apply"]').attributes('disabled')).toBeDefined();
    });

    it('rotates the edited sheet', async () => {
        const sheet = await addSheet();
        const wrapper = await render();

        await wrapper.find('[title="Edit Lageskizze FURY"]').trigger('click');
        await flushPromises();
        await wrapper.find('[title="Rotate 5° clockwise"]').trigger('click');
        await vi.waitFor(() => expect(wrapper.find('[data-test="rubber-sheet-row"]').text()).toContain('5°'));

        expect(RubberSheets.get(sheet.id)?.corners).not.toEqual(sheet.corners);
    });
});
