import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const write = vi.fn<(opts: { string: string }) => Promise<void>>(async () => undefined);
const update = vi.fn<(body: unknown) => Promise<void>>(async () => undefined);

const store = reactive({
    coordFormat: 'lv95',
    gpsCoordinates: { lat: 46.95108111111111, lng: 7.438637222222222 } as { lat: number, lng: number } | null,
    _map: {},
    map: { on: vi.fn(), off: vi.fn() },
    worker: { profile: { update } }
});

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => store
}));

vi.mock('@capacitor/clipboard', () => ({
    Clipboard: { write: (opts: { string: string }) => write(opts) }
}));

vi.mock('../../../utils/capacitor.ts', () => ({
    isNativePlatform: () => false
}));

import GPSPanelCoordinates from './GPSPanelCoordinates.vue';

const THIN = '\u2009';

// Render the menu inline, as if opened
const OpenDropdown = { template: '<div><slot /><ul><slot name="dropdown" /></ul></div>' };

function render() {
    return mount(GPSPanelCoordinates, {
        global: {
            stubs: {
                TablerDropdown: OpenDropdown,
                Dropdown: OpenDropdown,
                TablerPillGroup: true,
                PillGroup: true
            }
        }
    });
}

describe('GPSPanelCoordinates', () => {
    afterEach(() => {
        store.coordFormat = 'lv95';
        store.gpsCoordinates = { lat: 46.95108111111111, lng: 7.438637222222222 };
        write.mockClear();
        update.mockClear();
    });

    it('shows the own position in LV95 and copies plain metres', async () => {
        const wrapper = render();

        expect(wrapper.find('[data-test="coordinates"]').text()).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);
        expect(wrapper.find('[data-test="coordinates-fallback"]').exists()).toBe(false);

        await wrapper.find('[data-test="copy"]').trigger('click');
        await flushPromises();

        expect(write).toHaveBeenCalledWith({ string: '2600000 1200000' });
    });

    it('offers LV95 among the formats and stores the choice', async () => {
        store.coordFormat = 'dd';
        const wrapper = render();

        const lv95 = wrapper.findAll('li').find((li) => li.text().startsWith('LV95'));
        expect(lv95?.text()).toContain('Swiss Grid');

        await lv95?.trigger('click');
        await flushPromises();

        expect(store.coordFormat).toBe('lv95');
        expect(update).toHaveBeenCalledWith({ display_coordinate: 'lv95' });
    });

    it('falls back to MGRS with a hint outside Switzerland', async () => {
        store.gpsCoordinates = { lat: 48.8566, lng: 2.3522 };
        const wrapper = render();

        expect(wrapper.find('[data-test="coordinates-fallback"]').text()).toBe('MGRS');
        expect(wrapper.find('[data-test="coordinates"]').text()).toMatch(/^31U [A-Z]{2} \d{5} \d{5}$/);
        expect(wrapper.text()).toContain('Outside the LV95 area, shown in MGRS');

        await wrapper.find('[data-test="copy"]').trigger('click');
        await flushPromises();

        expect(write).toHaveBeenCalledWith({ string: wrapper.find('[data-test="coordinates"]').text() });
    });

    it('says so without a GPS fix', () => {
        store.gpsCoordinates = null;
        const wrapper = render();

        expect(wrapper.find('[data-test="coordinates"]').text()).toBe('No GPS Fix');
        expect(wrapper.find('[data-test="coordinates-fallback"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="copy"]').exists()).toBe(false);
    });
});
