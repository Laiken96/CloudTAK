import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const route = reactive({ params: { uid: 'tg-1' } });
const dbGet = vi.fn();

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({ worker: { db: { get: dbGet } } })
}));

vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => ({ push: vi.fn() })
}));

vi.mock('../../../base/cot.ts', () => ({
    OriginMode: { CONNECTION: 'Connection', MISSION: 'Mission' }
}));

vi.mock('../../../base/subscription.ts', () => ({
    default: { from: vi.fn() }
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

vi.mock('./TacticalPreview.vue', () => ({
    default: { props: ['entry', 'model', 'width', 'height'], template: '<div class="preview-stub" />' }
}));

import TacticalEditor from './TacticalEditor.vue';

interface Stored {
    chsig: { _attributes: Record<string, string> };
    milsym: { id: string };
    callsign: string;
    'stroke-style': string;
}

function stored(cot: ReturnType<typeof fakeCot>, call = 0): Stored {
    return cot.update.mock.calls[call][0].properties as unknown as Stored;
}

function fakeCot(chsig: Record<string, string>, geometry: unknown = { type: 'LineString', coordinates: [[7.4, 47], [7.5, 47.1]] }) {
    const cot = {
        id: 'tg-1',
        is_editable: true,
        origin: { mode: 'Connection' },
        properties: reactive({ id: 'tg-1', callsign: 'x', stroke: '#80E0FF', chsig: { _attributes: chsig } } as Record<string, unknown>),
        geometry,
        reactivity: vi.fn(),
        update: vi.fn(async (update: { properties?: Record<string, unknown> }) => {
            if (update.properties) Object.assign(cot.properties, update.properties);
            return true;
        }),
    };
    return cot;
}

describe('TacticalEditor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dbGet.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stores the hierarchy sign with the 2525C code for ATAK', async () => {
        const cot = fakeCot({ sig: 'boundary', ech: 'F' });
        dbGet.mockResolvedValue(cot);

        const wrapper = mount(TacticalEditor);
        await flushPromises();

        await wrapper.find('[data-testid="tactical-ech-E"]').trigger('click');
        await vi.advanceTimersByTimeAsync(500);

        expect(cot.update).toHaveBeenCalledTimes(1);
        const properties = stored(cot);
        expect(properties.chsig._attributes).toMatchObject({ sig: 'boundary', ech: 'E' });
        expect(properties.milsym).toEqual({ id: 'GFGPGLB----E--X' });
        expect(properties.callsign).toBe('Sector boundary / control line I');
    });

    it('asks to classify the overlay once units are named', async () => {
        dbGet.mockResolvedValue(fakeCot({ sig: 'boundary', ech: 'F' }));
        const wrapper = mount(TacticalEditor);
        await flushPromises();

        expect(wrapper.find('[data-testid="tactical-classified"]').exists()).toBe(false);
        await wrapper.find('[data-testid="tactical-t"] input').setValue('12');
        expect(wrapper.find('[data-testid="tactical-classified"]').exists()).toBe(true);
    });

    it('dashes a planned graphic', async () => {
        const cot = fakeCot({ sig: 'phase-line', t: 'GELB' });
        dbGet.mockResolvedValue(cot);
        const wrapper = mount(TacticalEditor);
        await flushPromises();

        await wrapper.find('[data-testid="tactical-planned"]').trigger('click');
        await vi.advanceTimersByTimeAsync(500);

        const properties = stored(cot);
        expect(properties['stroke-style']).toBe('dashed');
        expect(properties.milsym.id).toBe('GFGAGLP---****X');
    });

    it('swaps the side by reversing the drawing direction', async () => {
        const cot = fakeCot({ sig: 'flot' });
        dbGet.mockResolvedValue(cot);
        const wrapper = mount(TacticalEditor);
        await flushPromises();

        await wrapper.find('[data-testid="tactical-swap"]').trigger('click');
        await flushPromises();

        expect(cot.update).toHaveBeenCalledWith({ geometry: { type: 'LineString', coordinates: [[7.5, 47.1], [7.4, 47]] } });
    });

    it('shows nothing editable for an object of someone else', async () => {
        const cot = fakeCot({ sig: 'phase-line' });
        cot.is_editable = false;
        dbGet.mockResolvedValue(cot);
        const wrapper = mount(TacticalEditor);
        await flushPromises();

        expect(wrapper.find('[data-testid="tactical-planned"]').attributes('disabled')).toBeDefined();
    });
});
