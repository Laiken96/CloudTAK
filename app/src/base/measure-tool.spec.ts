import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
    MEASURE_LAYERS,
    MEASURE_SOURCE,
    MEASURING_CLASS,
    addMeasurePoint,
    attachMeasureTool,
    clearMeasure,
    isMeasuring,
    measureState,
    nearestSnap,
    startMeasure,
    stopMeasure,
    undoMeasurePoint,
    vertexAt,
    type MeasureHost,
} from './measure-tool.ts';
import type { LngLat } from '../utils/measure.ts';

type Listener = (event: unknown) => void;

interface FakeFeature {
    coord: LngLat;
    layer: string;
    properties: Record<string, unknown>;
}

/** Screen pixels and degrees: 100 px = 1°, y down */
const project = ([lng, lat]: LngLat) => ({ x: lng * 100, y: -lat * 100 });

/** A map with just enough of MapLibre for the tool */
function fakeMap(objects: FakeFeature[] = []) {
    const listeners = new Map<string, Set<Listener>>();
    const once = new Map<string, Set<Listener>>();
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn>; data: unknown }>();
    let order: string[] = ['background', '-1-icon'];
    let removed = false;
    let dblclick = true;

    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);

    function rendered(feature: FakeFeature) {
        return {
            type: 'Feature',
            properties: feature.properties,
            layer: { id: feature.layer },
            geometry: { type: 'Point', coordinates: feature.coord },
        };
    }

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
        getSource: (id: string) => sources.get(id),
        addSource: (id: string, spec: { data: unknown }) => {
            sources.set(id, { setData: vi.fn(), data: spec.data });
        },
        removeSource: (id: string) => {
            sources.delete(id);
        },
        getLayer: (id: string) => order.includes(id) ? { id } : undefined,
        addLayer: (layer: { id: string }) => {
            order.push(layer.id);
        },
        removeLayer: (id: string) => {
            order = order.filter((l) => l !== id);
        },
        moveLayer: (id: string) => {
            order = [...order.filter((l) => l !== id), id];
        },
        getLayersOrder: () => [...order],
        getStyle: () => {
            if (removed) throw new Error('map removed');
            return { version: 8 };
        },
        project: (coord: LngLat) => project(coord),
        unproject: ([x, y]: [number, number]) => {
            const lngLat = { lng: x / 100, lat: -y / 100, wrap: () => lngLat };
            return lngLat;
        },
        queryRenderedFeatures: (geometry: [number, number] | [[number, number], [number, number]], opts: { layers: string[] }) => {
            const inLayer = objects.filter((f) => opts.layers.includes(f.layer) && order.includes(f.layer));

            if (typeof geometry[0] === 'number') {
                // A point query hits a symbol drawn 16 px wide around its anchor
                const [x, y] = geometry as [number, number];
                return inLayer.filter((f) => {
                    const p = project(f.coord);
                    return Math.abs(p.x - x) <= 8 && Math.abs(p.y - y) <= 8;
                }).map(rendered);
            }

            const [[x1, y1], [x2, y2]] = geometry as [[number, number], [number, number]];
            return inLayer.filter((f) => {
                const p = project(f.coord);
                return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
            }).map(rendered);
        },
        getContainer: () => container,
        getCanvas: () => canvas,
        doubleClickZoom: {
            isEnabled: () => dblclick,
            enable: () => { dblclick = true; },
            disable: () => { dblclick = false; },
        },
        /** Test helpers */
        get layers() { return order; },
        set layers(value: string[]) { order = value; },
        sources,
        dropStyle: () => {
            order = order.filter((id) => !MEASURE_LAYERS.includes(id));
            sources.delete(MEASURE_SOURCE);
        },
        remove: () => {
            map.fire('remove');
            removed = true;
        },
    };

    return map;
}

type FakeMap = ReturnType<typeof fakeMap>;

function tap(map: FakeMap, x: number, y: number): void {
    map.fire('click', { point: { x, y } });
}

function touchEvent(points: Array<{ x: number; y: number }>) {
    const originalEvent = { cancelable: true, preventDefault: vi.fn() };
    return {
        point: points[0] ?? { x: 0, y: 0 },
        points,
        originalEvent,
        preventDefault: vi.fn(),
    };
}

function host(overrides: Partial<MeasureHost> = {}): MeasureHost {
    return {
        snapLayers: () => [{ id: '-1-icon', type: 'cot' }],
        ownPosition: () => undefined,
        ...overrides,
    };
}

function coords(): LngLat[] {
    return measureState.points.map((p) => p.coord);
}

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await nextTick();
}

let detach: (() => void) | undefined;

beforeEach(() => {
    stopMeasure();
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
    detach?.();
    detach = undefined;
    stopMeasure();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('measure state', () => {
    it('adds, removes the last and clears points', () => {
        startMeasure();
        addMeasurePoint([1, 1]);
        addMeasurePoint([2, 2]);
        addMeasurePoint([3, 3]);

        undoMeasurePoint();
        expect(coords()).toEqual([[1, 1], [2, 2]]);

        clearMeasure();
        expect(coords()).toEqual([]);
        expect(measureState.active).toBe(true);

        // Remove Last Point and Close with nothing set do nothing harmful
        undoMeasurePoint();
        expect(coords()).toEqual([]);
        stopMeasure();
        expect(measureState.active).toBe(false);
    });

    it('claims map taps only while open and on a map', () => {
        const map = fakeMap();
        expect(isMeasuring()).toBe(false);

        startMeasure();
        expect(isMeasuring()).toBe(false);

        detach = attachMeasureTool(map as never, host());
        expect(isMeasuring()).toBe(true);

        stopMeasure();
        expect(isMeasuring()).toBe(false);
    });
});

describe('snapping', () => {
    it('takes the nearest candidate within the radius', () => {
        const near = { coord: [0, 0] as LngLat, point: { x: 112, y: 100 }, snap: { kind: 'object' as const, label: 'near' } };
        const nearer = { coord: [0, 0] as LngLat, point: { x: 105, y: 100 }, snap: { kind: 'own' as const, label: '' } };
        const far = { coord: [0, 0] as LngLat, point: { x: 130, y: 100 }, snap: { kind: 'object' as const, label: 'far' } };

        expect(nearestSnap({ x: 100, y: 100 }, [near, nearer, far])?.snap.kind).toBe('own');
        expect(nearestSnap({ x: 100, y: 100 }, [far])).toBeUndefined();
        expect(nearestSnap({ x: 100, y: 100 }, [])).toBeUndefined();
    });

    it('prefers a symbol the tap hit over one only near', () => {
        const hit = { coord: [0, 0] as LngLat, point: { x: 118, y: 100 }, snap: { kind: 'object' as const, label: 'hit' }, direct: true };
        const near = { coord: [0, 0] as LngLat, point: { x: 102, y: 100 }, snap: { kind: 'own' as const, label: '' } };

        expect(nearestSnap({ x: 100, y: 100 }, [near, hit])?.snap.label).toBe('hit');
    });

    it('finds the measure point under the finger', () => {
        const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
        expect(vertexAt({ x: 90, y: 5 }, points)).toBe(1);
        expect(vertexAt({ x: 50, y: 0 }, points)).toBe(-1);
    });
});

describe('on the map', () => {
    it('adds its source and layers on top and removes them on close', () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        expect(map.sources.has(MEASURE_SOURCE)).toBe(true);
        expect(map.layers.slice(-MEASURE_LAYERS.length)).toEqual(MEASURE_LAYERS);
        expect(map.getContainer().classList.contains(MEASURING_CLASS)).toBe(true);
        expect(map.doubleClickZoom.isEnabled()).toBe(false);

        detach();
        detach = undefined;

        expect(map.sources.has(MEASURE_SOURCE)).toBe(false);
        expect(map.layers).toEqual(['background', '-1-icon']);
        expect(map.getContainer().classList.contains(MEASURING_CLASS)).toBe(false);
        expect(map.doubleClickZoom.isEnabled()).toBe(true);
        expect(map.listenerCount('click')).toBe(0);
        expect(map.listenerCount('styledata')).toBe(0);
    });

    it('sets a point per tap and draws path, lengths and points', async () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        tap(map, 700, -4690);
        tap(map, 760, -4680);
        tap(map, 760, -4600);
        await flush();

        expect(coords()).toEqual([[7, 46.9], [7.6, 46.8], [7.6, 46]]);

        const data = map.sources.get(MEASURE_SOURCE)!.setData.mock.lastCall![0] as { features: Array<{ properties: { kind: string } }> };
        const kinds = data.features.map((f) => f.properties.kind);
        expect(kinds.filter((k) => k === 'path')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'label')).toHaveLength(2);
        expect(kinds.filter((k) => k === 'vertex')).toHaveLength(3);

        // Remove Last Point redraws without it
        undoMeasurePoint();
        await flush();
        const after = map.sources.get(MEASURE_SOURCE)!.setData.mock.lastCall![0] as { features: unknown[] };
        expect(after.features).toHaveLength(1 + 1 + 2);
    });

    it('does not set a point on a tap on an existing one', () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        tap(map, 700, -4690);
        tap(map, 710, -4690);
        expect(coords()).toHaveLength(1);
    });

    it('snaps onto the own position near the tap', () => {
        const map = fakeMap();
        const own: LngLat = [7.12345, 46.54321];
        startMeasure();
        detach = attachMeasureTool(map as never, host({ ownPosition: () => own }));

        const p = project(own);
        tap(map, p.x + 15, p.y - 10);
        expect(measureState.points[0].coord).toEqual(own);
        expect(measureState.points[0].snap?.kind).toBe('own');

        // 30 px away is a point of its own
        tap(map, p.x + 300, p.y);
        tap(map, p.x + 330, p.y);
        expect(measureState.points[2].snap).toBeUndefined();
        expect(measureState.points[2].coord[0]).toBeCloseTo((p.x + 330) / 100, 9);
    });

    it('snaps onto a signature and takes its stored position', async () => {
        const drawn: LngLat = [7.5, 46.9];
        const stored: LngLat = [7.500004, 46.899997];
        const map = fakeMap([{ coord: drawn, layer: '-1-icon', properties: { id: 'target-1', callsign: 'Ziel 1' } }]);
        const resolve = vi.fn(async () => stored);

        startMeasure();
        detach = attachMeasureTool(map as never, host({ resolve }));

        const p = project(drawn);
        tap(map, p.x + 12, p.y + 12);

        expect(measureState.points[0].coord).toEqual(drawn);
        expect(measureState.points[0].snap).toEqual({ kind: 'object', label: 'Ziel 1', id: 'target-1' });

        await flush();
        expect(resolve).toHaveBeenCalledWith('target-1');
        expect(measureState.points[0].coord).toEqual(stored);
    });

    it('does not snap onto objects of layers that are not offered', () => {
        const map = fakeMap([{ coord: [7.5, 46.9], layer: 'other', properties: { id: 'x' } }]);
        map.layers = [...map.layers, 'other'];

        startMeasure();
        detach = attachMeasureTool(map as never, host());

        tap(map, 755, -4690);
        expect(measureState.points[0].snap).toBeUndefined();
    });

    it('drags a point with one finger, the map holds still, the click after it sets nothing', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        tap(map, 700, -4690);
        tap(map, 800, -4690);

        const start = touchEvent([{ x: 802, y: -4688 }]);
        map.fire('touchstart', start);
        expect(start.preventDefault).toHaveBeenCalled();

        const move = touchEvent([{ x: 850, y: -4650 }]);
        map.fire('touchmove', move);
        expect(move.originalEvent.preventDefault).toHaveBeenCalled();
        vi.advanceTimersByTime(20);

        map.fire('touchend', touchEvent([]));
        // The browser's click after the drag, wherever it lands
        tap(map, 300, -4000);

        expect(coords()).toEqual([[7, 46.9], [8.5, 46.5]]);

        // Later taps set points again
        vi.advanceTimersByTime(1000);
        tap(map, 900, -4600);
        expect(coords()).toHaveLength(3);
    });

    it('lets the map pan when the finger is not on a point', () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        tap(map, 700, -4690);

        const start = touchEvent([{ x: 500, y: -4000 }]);
        map.fire('touchstart', start);
        map.fire('touchmove', touchEvent([{ x: 520, y: -4000 }]));
        expect(start.preventDefault).not.toHaveBeenCalled();
        expect(coords()).toEqual([[7, 46.9]]);

        // Two fingers on a point: pinch, no drag
        const pinch = touchEvent([{ x: 700, y: -4690 }, { x: 800, y: -4600 }]);
        map.fire('touchstart', pinch);
        expect(pinch.preventDefault).not.toHaveBeenCalled();
    });

    it('comes back after the style lost its layers and stays on top', async () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());
        tap(map, 700, -4690);
        tap(map, 800, -4690);
        await flush();

        // Style reload: everything of the tool is gone
        map.dropStyle();
        map.fire('styledata');

        expect(map.layers.slice(-MEASURE_LAYERS.length)).toEqual(MEASURE_LAYERS);
        const data = map.sources.get(MEASURE_SOURCE)!.setData.mock.lastCall![0] as { features: unknown[] };
        expect(data.features).toHaveLength(1 + 1 + 2);

        // A basemap or overlay added above
        map.addLayer({ id: 'basemap-raster' });
        map.fire('styledata');
        expect(map.layers.slice(-MEASURE_LAYERS.length)).toEqual(MEASURE_LAYERS);
    });

    it('goes away quietly with the map', () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());

        expect(() => map.remove()).not.toThrow();
        expect(isMeasuring()).toBe(false);
        expect(map.listenerCount('click')).toBe(0);
    });

    it('closes with Escape', () => {
        const map = fakeMap();
        startMeasure();
        detach = attachMeasureTool(map as never, host());
        tap(map, 700, -4690);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(measureState.active).toBe(false);
        expect(coords()).toEqual([]);
    });
});
