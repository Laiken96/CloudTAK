import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { DrawToolMode } from '../../stores/modules/draw.ts';
import { lv95ToLngLat } from '../../utils/lv95.ts';
import type { Feature } from '../../types.ts';

const THIN = ' ';

const stored = new Map<string, { properties: { callsign: string }; geometry: { type: string; coordinates: number[] } }>();

const store = reactive({
    _map: {},
    map: {},
    draw: {
        mode: DrawToolMode.STATIC as DrawToolMode,
        stop: vi.fn(async () => { store.draw.mode = DrawToolMode.STATIC; }),
    },
    radial: { mode: 'cot' as string | undefined, cot: {} as unknown },
    select: { feats: [{}] as unknown[] },
    refresh: vi.fn(async () => undefined),
    worker: {
        db: {
            get: vi.fn(async (id: string) => stored.get(id)),
            add: vi.fn<(feature: Feature, opts: Record<string, boolean>) => Promise<void>>(async (feature) => {
                stored.set(String(feature.id), {
                    properties: { callsign: String(feature.properties.callsign) },
                    geometry: feature.geometry as { type: string; coordinates: number[] },
                });
            }),
            search: vi.fn(async () => new Set([
                { properties: { callsign: 'Z03 D2/6' } },
                { properties: { callsign: 'Zugführer' } },
            ])),
        }
    },
});

vi.mock('../../stores/map.ts', () => ({
    useMapStore: () => store
}));

const detach = vi.fn();

vi.mock('../../base/point-target-tool.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../base/point-target-tool.ts')>()),
    attachPointTargetTool: vi.fn(() => detach),
}));

import {
    attachPointTargetTool,
    placePointTarget,
    pointTargetState,
    startPointTarget,
    stopPointTarget,
    type PointTargetHost,
} from '../../base/point-target-tool.ts';
import { measureState, startMeasure, stopMeasure } from '../../base/measure-tool.ts';
import { armSignature, armedSignature, attachPlacementHandler } from '../../base/signature-placement.ts';
import { featureDragStatus, resetFeatureDragStatus } from '../../base/feature-drag-map.ts';
import PointTargetPanel from './PointTargetPanel.vue';

async function mountPanel() {
    const wrapper = mount(PointTargetPanel);
    await flushPromises();
    return wrapper;
}

function text(wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string): string {
    return wrapper.find(`[data-testid="${id}"]`).text().trim();
}

/** The host the panel gave the tool */
function host(): PointTargetHost {
    const calls = vi.mocked(attachPointTargetTool).mock.calls;
    return calls[calls.length - 1][1];
}

/** Set the target through the host of the panel, as a tap would */
async function tap(coord: [number, number]): Promise<void> {
    await placePointTarget(host(), coord, { id: 'target-1' });
    await flushPromises();
}

beforeEach(() => {
    stopPointTarget();
    stopMeasure();
    startPointTarget();
    stored.clear();
    store.draw.mode = DrawToolMode.STATIC;
    store.radial.mode = 'cot';
    store.select.feats = [{}];
    resetFeatureDragStatus();
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
    stopPointTarget();
    stopMeasure();
});

describe('PointTargetPanel', () => {
    it('asks for the tap and takes the map for it', async () => {
        const release = attachPlacementHandler();
        armSignature({ type: 'a-f-G' } as never, 'Friend');

        const wrapper = await mountPanel();

        expect(text(wrapper, 'point-target-hint')).toBe('Tap the map where the target is.');
        expect(wrapper.find('[data-testid="point-target-lv95"]').exists()).toBe(false);
        expect(attachPointTargetTool).toHaveBeenCalledTimes(1);
        expect(armedSignature.value).toBeNull();
        expect(store.radial.mode).toBeUndefined();
        expect(store.select.feats).toEqual([]);

        release();
        wrapper.unmount();
    });

    it('cancels before the tap without an object', async () => {
        const wrapper = await mountPanel();

        await wrapper.find('[data-testid="point-target-cancel"]').trigger('click');

        expect(pointTargetState.phase).toBe('idle');
        expect(store.worker.db.add).not.toHaveBeenCalled();

        wrapper.unmount();
        expect(detach).toHaveBeenCalledTimes(1);
    });

    it('names the target after the highest one and saves it as a drawn point', async () => {
        const wrapper = await mountPanel();

        await tap([7.44, 46.95]);

        expect(store.worker.db.search).toHaveBeenCalledWith('z', { mission: true });
        expect(store.worker.db.add).toHaveBeenCalledTimes(1);
        const [feature, opts] = store.worker.db.add.mock.calls[0];
        expect(feature.properties).toMatchObject({ callsign: 'Z04', type: 'b-m-p-s-m' });
        expect(opts).toEqual({ authored: true, created: true, skipMissionLookup: true });
        expect(store.refresh).toHaveBeenCalled();

        expect(text(wrapper, 'point-target-name')).toBe('Z04');
        expect(wrapper.find('[data-testid="point-target-close"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="point-target-cancel"]').exists()).toBe(false);
    });

    it('shows LV95 whatever coordinate format is chosen', async () => {
        const wrapper = await mountPanel();

        await tap(lv95ToLngLat(2564579, 1252022));

        expect(text(wrapper, 'point-target-lv95')).toBe(`2${THIN}564${THIN}579 / 1${THIN}252${THIN}022`);
        expect(wrapper.text()).toContain('LV95');
        expect(wrapper.find('[data-testid="point-target-outside"]').exists()).toBe(false);
    });

    it('says so instead of numbers outside Switzerland', async () => {
        const wrapper = await mountPanel();

        await tap([2.35, 48.85]);

        expect(text(wrapper, 'point-target-name')).toBe('Z04');
        expect(wrapper.find('[data-testid="point-target-lv95"]').exists()).toBe(false);
        expect(text(wrapper, 'point-target-outside')).toContain('Outside Switzerland');
    });

    it('shows a failed save and waits for the next tap', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        store.worker.db.add.mockRejectedValueOnce(new Error('Storage full'));
        const wrapper = await mountPanel();

        await tap([7.44, 46.95]);

        expect(text(wrapper, 'point-target-error')).toBe('Could not set the target: Storage full');
        expect(wrapper.find('[data-testid="point-target-hint"]').exists()).toBe(true);
        expect(pointTargetState.phase).toBe('placing');

        errorLog.mockRestore();
    });

    it('follows the target when it is moved by long press', async () => {
        const wrapper = await mountPanel();
        await tap(lv95ToLngLat(2600000, 1200000));
        expect(text(wrapper, 'point-target-lv95')).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);

        stored.set('target-1', {
            properties: { callsign: 'Z04' },
            geometry: { type: 'Point', coordinates: lv95ToLngLat(2600100, 1200200) },
        });
        featureDragStatus.phase = 'moved';
        await flushPromises();

        expect(store.worker.db.get).toHaveBeenCalledWith('target-1', { mission: true });
        expect(text(wrapper, 'point-target-lv95')).toBe(`2${THIN}600${THIN}100 / 1${THIN}200${THIN}200`);
    });

    it('follows other changes and a delete within a second', async () => {
        // Only the follow interval: flushPromises needs real timeouts
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const wrapper = await mountPanel();
        await tap(lv95ToLngLat(2600000, 1200000));

        stored.set('target-1', {
            properties: { callsign: 'Z04 Brücke' },
            geometry: { type: 'Point', coordinates: lv95ToLngLat(2601000, 1201000) },
        });
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();
        expect(text(wrapper, 'point-target-name')).toBe('Z04 Brücke');
        expect(text(wrapper, 'point-target-lv95')).toBe(`2${THIN}601${THIN}000 / 1${THIN}201${THIN}000`);

        stored.delete('target-1');
        await vi.advanceTimersByTimeAsync(1000);
        await flushPromises();
        expect(text(wrapper, 'point-target-gone')).toBe('The target was deleted.');
        expect(wrapper.find('[data-testid="point-target-lv95"]').exists()).toBe(false);

        wrapper.unmount();
    });

    it('closes after the target is set, the target stays', async () => {
        const wrapper = await mountPanel();
        await tap([7.44, 46.95]);

        await wrapper.find('[data-testid="point-target-close"]').trigger('click');

        expect(pointTargetState.phase).toBe('idle');
        expect(stored.has('target-1')).toBe(true);
    });

    it('ends when a drawing tool starts', async () => {
        const wrapper = await mountPanel();

        store.draw.mode = DrawToolMode.LINESTRING;
        await nextTick();

        expect(pointTargetState.phase).toBe('idle');
        wrapper.unmount();
    });

    it('ends when Measure Distance starts', async () => {
        const wrapper = await mountPanel();

        startMeasure();
        await nextTick();

        expect(measureState.active).toBe(true);
        expect(pointTargetState.phase).toBe('idle');
        wrapper.unmount();
    });

    it('stops a running drawing tool before it takes the map', async () => {
        store.draw.mode = DrawToolMode.POINT;
        startPointTarget();

        const wrapper = await mountPanel();

        expect(store.draw.stop).toHaveBeenCalled();
        expect(attachPointTargetTool).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    it('ends a tool still waiting for the tap when it leaves the map', async () => {
        const wrapper = await mountPanel();

        wrapper.unmount();

        expect(pointTargetState.phase).toBe('idle');
        expect(detach).toHaveBeenCalledTimes(1);
    });
});
