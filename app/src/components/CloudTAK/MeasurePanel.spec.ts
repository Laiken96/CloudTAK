import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { DrawToolMode } from '../../stores/modules/draw.ts';
import { LocationState } from '../../utils/events.ts';

const store = reactive({
    _map: {},
    map: {},
    location: LocationState.Live,
    gpsCoordinates: { lng: 7.44, lat: 46.95 } as { lng: number; lat: number } | null,
    draw: {
        mode: DrawToolMode.STATIC as DrawToolMode,
        stop: vi.fn(async () => { store.draw.mode = DrawToolMode.STATIC; }),
    },
    radial: { mode: 'cot' as string | undefined, cot: {} as unknown },
    select: { feats: [{}] as unknown[] },
    worker: {
        db: {
            get: vi.fn(async () => ({ geometry: { type: 'Point', coordinates: [7.5, 46.9] } })),
        }
    },
});

vi.mock('../../stores/map.ts', () => ({
    useMapStore: () => store
}));

vi.mock('../../base/overlay.ts', () => ({
    default: { clickableLayerMap: () => new Map([['-1-icon', { id: '-1-icon', type: 'cot' }]]) }
}));

const detach = vi.fn();

vi.mock('../../base/measure-tool.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../base/measure-tool.ts')>()),
    attachMeasureTool: vi.fn(() => detach),
}));

import {
    addMeasurePoint,
    attachMeasureTool,
    measureState,
    startMeasure,
    stopMeasure,
    type MeasureHost,
} from '../../base/measure-tool.ts';
import { armSignature, armedSignature, attachPlacementHandler } from '../../base/signature-placement.ts';
import MeasurePanel from './MeasurePanel.vue';

async function mountPanel() {
    const wrapper = mount(MeasurePanel);
    await flushPromises();
    return wrapper;
}

function text(wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string): string {
    return wrapper.find(`[data-testid="${id}"]`).text().replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
    stopMeasure();
    startMeasure();
    store.draw.mode = DrawToolMode.STATIC;
    store.radial.mode = 'cot';
    store.select.feats = [{}];
    store.location = LocationState.Live;
    store.gpsCoordinates = { lng: 7.44, lat: 46.95 };
    vi.clearAllMocks();
});

afterEach(() => {
    stopMeasure();
});

describe('MeasurePanel', () => {
    it('asks for point A, can only close, closing without points ends the tool', async () => {
        const wrapper = await mountPanel();

        expect(text(wrapper, 'measure-hint')).toContain('point A');
        expect(wrapper.find('[data-testid="measure-total"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="measure-undo"]').attributes('disabled')).toBeDefined();
        expect(wrapper.find('[data-testid="measure-new"]').attributes('disabled')).toBeDefined();

        await wrapper.find('[data-testid="measure-close"]').trigger('click');
        expect(measureState.active).toBe(false);
        expect(measureState.points).toEqual([]);

        wrapper.unmount();
        expect(detach).toHaveBeenCalledTimes(1);
    });

    it('asks for point B after A', async () => {
        addMeasurePoint([7.44, 46.95]);
        const wrapper = await mountPanel();

        expect(text(wrapper, 'measure-hint')).toContain('point B');
        expect(wrapper.find('[data-testid="measure-undo"]').attributes('disabled')).toBeUndefined();
    });

    it('shows distance and bearing in degrees and A‰', async () => {
        addMeasurePoint([7.5, 46.9]);
        addMeasurePoint([7.51, 46.9]);
        const wrapper = await mountPanel();

        expect(text(wrapper, 'measure-total')).toMatch(/^\d+ m$/);
        expect(text(wrapper, 'measure-bearing')).toMatch(/^90°\s*·\s*1600 A‰$/);
        expect(wrapper.find('[data-testid="measure-segments"]').exists()).toBe(false);
        expect(wrapper.text()).toContain('Distance');
    });

    it('shows the total, the number of segments and the last one for a path', async () => {
        addMeasurePoint([7.5, 46.9]);
        addMeasurePoint([7.5, 46.91]);
        addMeasurePoint([7.52, 46.91]);
        const wrapper = await mountPanel();

        expect(wrapper.text()).toContain('Total');
        expect(text(wrapper, 'measure-total')).toMatch(/^\d\.\d\d km$/);
        expect(text(wrapper, 'measure-segments')).toBe('2 segments');
        expect(text(wrapper, 'measure-last-segment')).toBe('Last segment 1.52 km');
        expect(text(wrapper, 'measure-bearing')).toMatch(/^90°\s*·\s*1600 A‰$/);
    });

    it('removes the last point and starts anew', async () => {
        addMeasurePoint([7.5, 46.9]);
        addMeasurePoint([7.5, 46.91]);
        addMeasurePoint([7.52, 46.91]);
        const wrapper = await mountPanel();

        await wrapper.find('[data-testid="measure-undo"]').trigger('click');
        expect(measureState.points).toHaveLength(2);
        expect(text(wrapper, 'measure-bearing')).toMatch(/^0°\s*·\s*0 A‰$/);

        await wrapper.find('[data-testid="measure-new"]').trigger('click');
        expect(measureState.points).toEqual([]);
        expect(measureState.active).toBe(true);
        expect(text(wrapper, 'measure-hint')).toContain('point A');
    });

    it('says where the last point snapped', async () => {
        addMeasurePoint([7.44, 46.95], { kind: 'own', label: '' });
        const wrapper = await mountPanel();
        expect(text(wrapper, 'measure-snap')).toBe('Point A snapped to your own position');

        addMeasurePoint([7.5, 46.9], { kind: 'object', label: 'Ziel 1', id: 'x' });
        await nextTick();
        expect(text(wrapper, 'measure-snap')).toBe('Point B snapped to Ziel 1');
    });

    it('takes the map taps alone: no drawing, signature, ring menu or selection', async () => {
        const detachPlacement = attachPlacementHandler();
        armSignature({ type: 'a-f-G' } as never, 'Test');
        store.draw.mode = DrawToolMode.LINESTRING;

        await mountPanel();

        expect(store.draw.stop).toHaveBeenCalled();
        expect(armedSignature.value).toBeNull();
        expect(store.radial.mode).toBeUndefined();
        expect(store.select.feats).toEqual([]);
        expect(attachMeasureTool).toHaveBeenCalledTimes(1);

        detachPlacement();
    });

    it('hands the map its own position and the snap layers', async () => {
        await mountPanel();

        const host = vi.mocked(attachMeasureTool).mock.calls[0][1] as MeasureHost;
        expect(host.ownPosition()).toEqual([7.44, 46.95]);
        expect(host.snapLayers()).toEqual([{ id: '-1-icon', type: 'cot' }]);
        await expect(host.resolve?.('x')).resolves.toEqual([7.5, 46.9]);

        store.location = LocationState.Disabled;
        expect(host.ownPosition()).toBeUndefined();
    });

    it('closes when a drawing tool starts', async () => {
        addMeasurePoint([7.5, 46.9]);
        await mountPanel();

        store.draw.mode = DrawToolMode.POLYGON;
        await nextTick();

        expect(measureState.active).toBe(false);
        expect(measureState.points).toEqual([]);
    });
});
