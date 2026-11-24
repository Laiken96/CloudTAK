import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
    PLACING_TARGET_CLASS,
    attachPointTargetTool,
    isPlacingTarget,
    placePointTarget,
    pointTargetState,
    refreshPlacedTarget,
    startPointTarget,
    stopPointTarget,
    type PointTargetHost,
    type TargetLookup,
} from './point-target-tool.ts';
import { measureState, startMeasure, stopMeasure } from './measure-tool.ts';
import type { Feature } from '../types.ts';
import type { LngLat } from '../utils/point-target.ts';

type Listener = (event: unknown) => void;

/** A map with just enough of MapLibre for the tool */
function fakeMap() {
    const listeners = new Map<string, Set<Listener>>();
    const once = new Map<string, Set<Listener>>();

    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);

    const map = {
        on: (type: string, fn: Listener) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
        },
        once: (type: string, fn: Listener) => {
            if (!once.has(type)) once.set(type, new Set());
            once.get(type)!.add(fn);
        },
        off: (type: string, fn: Listener) => {
            listeners.get(type)?.delete(fn);
            once.get(type)?.delete(fn);
        },
        fire: (type: string, event: unknown = {}) => {
            for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
            const one = [...(once.get(type) ?? [])];
            once.get(type)?.clear();
            for (const fn of one) fn(event);
        },
        listenerCount: (type: string) => (listeners.get(type)?.size ?? 0) + (once.get(type)?.size ?? 0),
        getContainer: () => container,
        getCanvas: () => canvas,
        /** A tap at a position */
        tap: (lng: number, lat: number) => {
            const lngLat = { lng, lat, wrap: () => ({ lng: lng > 180 ? lng - 360 : lng, lat }) };
            map.fire('click', { lngLat });
        },
    };

    return map;
}

type FakeMap = ReturnType<typeof fakeMap>;

function attach(map: FakeMap, host: PointTargetHost) {
    return attachPointTargetTool(map as unknown as Parameters<typeof attachPointTargetTool>[0], host);
}

function fakeHost(callsigns: unknown[] = []) {
    const saved: Feature[] = [];
    const host = {
        callsigns: vi.fn(async () => callsigns),
        save: vi.fn(async (feature: Feature) => {
            saved.push(feature);
        }),
    };

    return { host, saved };
}

/** Let a running save finish */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await nextTick();
}

let detach: (() => void) | undefined;

beforeEach(() => {
    stopPointTarget();
    stopMeasure();
});

afterEach(() => {
    if (detach) detach();
    detach = undefined;
    stopPointTarget();
    stopMeasure();
    document.body.innerHTML = '';
});

describe('tool state', () => {
    it('is idle until started, a start waits for the tap', () => {
        expect(pointTargetState.phase).toBe('idle');

        startPointTarget();
        expect(pointTargetState).toMatchObject({ phase: 'placing', target: null, gone: false, error: '' });

        stopPointTarget();
        expect(pointTargetState.phase).toBe('idle');
    });

    it('ends Measure Distance: both want the next tap', () => {
        startMeasure();
        expect(measureState.active).toBe(true);

        startPointTarget();
        expect(measureState.active).toBe(false);
    });

    it('claims map taps only while placing and attached to the map', () => {
        startPointTarget();
        // Started, but the panel is not on the map yet
        expect(isPlacingTarget()).toBe(false);

        detach = attach(fakeMap(), fakeHost().host);
        expect(isPlacingTarget()).toBe(true);

        stopPointTarget();
        expect(isPlacingTarget()).toBe(false);
    });
});

describe('placePointTarget', () => {
    it('names, saves and shows the target, then the tool is off', async () => {
        const { host, saved } = fakeHost(['Z01', 'Z03 D2/6', 'Alpha']);
        startPointTarget();

        const placed = await placePointTarget(host, [7.5, 46.9], { id: 'target-1' });

        expect(placed).toEqual({ id: 'target-1', callsign: 'Z04', coord: [7.5, 46.9] });
        expect(saved).toHaveLength(1);
        expect(saved[0].properties).toMatchObject({ callsign: 'Z04', type: 'b-m-p-s-m', 'marker-color': '#FFD60A' });
        expect(saved[0].geometry).toEqual({ type: 'Point', coordinates: [7.5, 46.9] });
        expect(pointTargetState).toMatchObject({ phase: 'placed', target: placed, gone: false, error: '' });
    });

    it('sets one target per start', async () => {
        const { host } = fakeHost();
        startPointTarget();

        await placePointTarget(host, [7.5, 46.9]);
        expect(await placePointTarget(host, [7.6, 46.9])).toBeNull();
        expect(host.save).toHaveBeenCalledTimes(1);

        startPointTarget();
        await placePointTarget(host, [7.6, 46.9]);
        expect(host.save).toHaveBeenCalledTimes(2);
    });

    it('sets nothing when not started', async () => {
        const { host } = fakeHost();

        expect(await placePointTarget(host, [7.5, 46.9])).toBeNull();
        expect(host.save).not.toHaveBeenCalled();
        expect(pointTargetState.phase).toBe('idle');
    });

    it('waits for the next tap when the save fails', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { host } = fakeHost();
        host.save.mockRejectedValueOnce(new Error('Storage full'));
        startPointTarget();

        expect(await placePointTarget(host, [7.5, 46.9])).toBeNull();
        expect(pointTargetState.phase).toBe('placing');
        expect(pointTargetState.target).toBeNull();
        expect(pointTargetState.error).toBe('Could not set the target: Storage full');

        const placed = await placePointTarget(host, [7.5, 46.9]);
        expect(placed?.callsign).toBe('Z01');
        expect(pointTargetState.phase).toBe('placed');
        expect(pointTargetState.error).toBe('');

        errorLog.mockRestore();
    });

    it('fails the same way when the names cannot be read', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { host } = fakeHost();
        host.callsigns.mockRejectedValueOnce(new Error('Worker gone'));
        startPointTarget();

        await placePointTarget(host, [7.5, 46.9]);

        expect(host.save).not.toHaveBeenCalled();
        expect(pointTargetState.phase).toBe('placing');
        expect(pointTargetState.error).toContain('Worker gone');

        errorLog.mockRestore();
    });

    it('keeps the panel closed when closed during the save', async () => {
        const { host } = fakeHost();
        let finish: () => void = () => undefined;
        host.save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
        startPointTarget();

        const placing = placePointTarget(host, [7.5, 46.9]);
        await settle();
        expect(pointTargetState.phase).toBe('saving');

        stopPointTarget();
        finish();
        const placed = await placing;

        // The object exists, only the panel stays closed
        expect(placed?.callsign).toBe('Z01');
        expect(pointTargetState.phase).toBe('idle');
        expect(pointTargetState.target).toBeNull();
    });

    it('does not let a save from before a restart show up', async () => {
        const { host } = fakeHost();
        let finish: () => void = () => undefined;
        host.save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
        startPointTarget();

        const placing = placePointTarget(host, [7.5, 46.9]);
        await settle();
        startPointTarget();
        finish();
        await placing;

        expect(pointTargetState.phase).toBe('placing');
        expect(pointTargetState.target).toBeNull();
    });
});

describe('attachPointTargetTool', () => {
    it('sets the target where the map is tapped', async () => {
        const map = fakeMap();
        const { host, saved } = fakeHost(['Z01']);
        startPointTarget();
        detach = attach(map, host);

        map.tap(7.44, 46.95);
        // The same tap must not open an object: still claimed while it is saved
        expect(pointTargetState.phase).toBe('saving');
        expect(isPlacingTarget()).toBe(true);

        await settle();
        expect(saved).toHaveLength(1);
        expect(saved[0].geometry).toEqual({ type: 'Point', coordinates: [7.44, 46.95] });
        expect(pointTargetState.target).toMatchObject({ callsign: 'Z02', coord: [7.44, 46.95] });
        expect(isPlacingTarget()).toBe(false);
    });

    it('wraps a position past the date line', async () => {
        const map = fakeMap();
        const { host, saved } = fakeHost();
        startPointTarget();
        detach = attach(map, host);

        map.tap(367.44, 46.95);
        await settle();

        const [lng, lat] = (saved[0].geometry as { coordinates: number[] }).coordinates;
        expect(lng).toBeCloseTo(7.44, 9);
        expect(lat).toBe(46.95);
    });

    it('lets later taps through to the map', async () => {
        const map = fakeMap();
        const { host } = fakeHost();
        startPointTarget();
        detach = attach(map, host);

        map.tap(7.44, 46.95);
        await settle();
        map.tap(7.45, 46.95);
        await settle();

        expect(host.save).toHaveBeenCalledTimes(1);
        expect(pointTargetState.target?.coord).toEqual([7.44, 46.95]);
    });

    it('shows a crosshair and lets taps through DOM markers only while placing', async () => {
        const map = fakeMap();
        const container = map.getContainer();
        const canvas = map.getCanvas();
        startPointTarget();
        detach = attach(map, fakeHost().host);

        expect(container.classList.contains(PLACING_TARGET_CLASS)).toBe(true);
        expect(canvas.style.cursor).toBe('crosshair');

        map.tap(7.44, 46.95);
        await settle();

        expect(container.classList.contains(PLACING_TARGET_CLASS)).toBe(false);
        expect(canvas.style.cursor).toBe('');
    });

    it('ends the tool on Escape before the tap', () => {
        const map = fakeMap();
        startPointTarget();
        detach = attach(map, fakeHost().host);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(pointTargetState.phase).toBe('idle');
    });

    it('keeps the placed target on Escape', async () => {
        const map = fakeMap();
        startPointTarget();
        detach = attach(map, fakeHost().host);
        map.tap(7.44, 46.95);
        await settle();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(pointTargetState.phase).toBe('placed');
    });

    it('detaches from the map and on map removal', () => {
        const map = fakeMap();
        startPointTarget();
        detach = attach(map, fakeHost().host);
        expect(map.listenerCount('click')).toBe(1);

        detach();
        detach = undefined;
        expect(map.listenerCount('click')).toBe(0);
        expect(map.listenerCount('remove')).toBe(0);
        expect(map.getContainer().classList.contains(PLACING_TARGET_CLASS)).toBe(false);
        expect(isPlacingTarget()).toBe(false);

        const other = fakeMap();
        attach(other, fakeHost().host);
        other.fire('remove');
        expect(other.listenerCount('click')).toBe(0);
        expect(isPlacingTarget()).toBe(false);
    });
});

describe('refreshPlacedTarget', () => {
    function lookupOf(current: { callsign: string; coord: LngLat } | undefined | Error): TargetLookup & { lookup: ReturnType<typeof vi.fn> } {
        return {
            lookup: vi.fn(async () => {
                if (current instanceof Error) throw current;
                return current;
            }),
        };
    }

    async function placed(): Promise<void> {
        startPointTarget();
        await placePointTarget(fakeHost().host, [7.5, 46.9], { id: 'target-1' });
    }

    it('follows a moved and renamed target', async () => {
        await placed();
        const lookup = lookupOf({ callsign: 'Z01 Brücke', coord: [7.51, 46.91] });

        await refreshPlacedTarget(lookup);

        expect(lookup.lookup).toHaveBeenCalledWith('target-1');
        expect(pointTargetState.target).toEqual({ id: 'target-1', callsign: 'Z01 Brücke', coord: [7.51, 46.91] });
    });

    it('marks a deleted target and takes it back when it returns', async () => {
        await placed();

        await refreshPlacedTarget(lookupOf(undefined));
        expect(pointTargetState.gone).toBe(true);
        expect(pointTargetState.phase).toBe('placed');

        await refreshPlacedTarget(lookupOf({ callsign: 'Z01', coord: [7.5, 46.9] }));
        expect(pointTargetState.gone).toBe(false);
    });

    it('keeps what is shown when the lookup fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await placed();

        await refreshPlacedTarget(lookupOf(new Error('busy')));

        expect(pointTargetState.target?.coord).toEqual([7.5, 46.9]);
        expect(pointTargetState.gone).toBe(false);
        warn.mockRestore();
    });

    it('does nothing before the target is set or after closing', async () => {
        const lookup = lookupOf({ callsign: 'Z09', coord: [8, 47] });

        startPointTarget();
        await refreshPlacedTarget(lookup);
        expect(lookup.lookup).not.toHaveBeenCalled();

        await placed();
        let answer: (value: { callsign: string; coord: LngLat }) => void = () => undefined;
        lookup.lookup.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
        const running = refreshPlacedTarget(lookup);
        stopPointTarget();
        answer({ callsign: 'Z09', coord: [8, 47] });
        await running;

        expect(pointTargetState.target).toBeNull();
    });
});
