import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feature } from '../types.ts';
import {
    PREVIEW_PREFIX,
    PREVIEW_SOURCE,
    SETTLE_TIMEOUT,
    UNDO_WINDOW,
    attachFeatureDrag,
    dismissFeatureMoveStatus,
    featureDragStatus,
    resetFeatureDragStatus,
    storeFeatureDragOptions,
    undoFeatureMove,
    type DragSubject,
    type FeatureDrag,
    type FeatureDragOptions,
    type FeatureDragStore,
} from './feature-drag-map.ts';
import { LONG_PRESS_DELAY, attachMapLongPress } from './long-press.ts';
import { armSignature, attachPlacementHandler, disarmSignature } from './signature-placement.ts';
import { OriginMode } from './cot.ts';
import Subscription from './subscription.ts';
import { tour } from '../tutorial/tour.ts';

/** A synthetic touch event: `points` are the fingers on the screen (clientX, clientY) */
function touch(target: EventTarget, type: string, points: Array<[number, number]>, changed = points): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const list = (p: Array<[number, number]>) => p.map(([clientX, clientY]) => ({ clientX, clientY }));

    Object.defineProperty(event, 'touches', { value: list(points) });
    Object.defineProperty(event, 'changedTouches', { value: list(changed) });
    target.dispatchEvent(event);
    return event;
}

function mouse(target: EventTarget, type: string, x: number, y: number, init: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init });
    target.dispatchEvent(event);
    return event;
}

/** Settle promises (probe, save) without running timers */
async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

interface FakeLayer {
    id: string;
    type: string;
    source: string;
    filter?: unknown;
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
}

/** Screen pixels to degrees: 100 px = 1° */
const unprojectPoint = ([x, y]: [number, number]) => ({ lng: x / 100, lat: -y / 100 });

/**
 * Map container > canvas container > canvas, as MapLibre builds it, with the
 * CoT layers of the "Map Features" source (-1) and an own marker at (100, 200)
 */
function fakeMap() {
    const container = document.createElement('div');
    const canvasContainer = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvasContainer);
    canvasContainer.appendChild(canvas);
    document.body.appendChild(container);

    canvasContainer.getBoundingClientRect = () => ({
        top: 0, left: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });
    // As in the browser: the canvas has the size of the map, the canvas
    // container around it no height of its own (the canvas is absolute)
    Object.defineProperty(canvasContainer, 'clientWidth', { value: 400 });
    Object.defineProperty(canvasContainer, 'clientHeight', { value: 0 });
    Object.defineProperty(canvas, 'clientWidth', { value: 400 });
    Object.defineProperty(canvas, 'clientHeight', { value: 800 });

    const layers = new Map<string, FakeLayer>();
    const order: string[] = [];
    const add = (layer: FakeLayer) => {
        layers.set(layer.id, JSON.parse(JSON.stringify(layer)));
        order.push(layer.id);
    };

    add({ id: '-1-poly', type: 'fill', source: '-1', filter: ['==', ['geometry-type'], 'Polygon'] });
    add({ id: '-1-polyline', type: 'line', source: '-1', filter: ['==', ['geometry-type'], 'Polygon'] });
    add({
        id: '-1-icon',
        type: 'symbol',
        source: '-1',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 18, 1.2] },
    });
    add({ id: 'basemap', type: 'raster', source: 'osm' });

    const sources = new Map<string, { setData: ReturnType<typeof vi.fn>; data: unknown }>();
    const listeners = new Map<string, Array<() => void>>();

    /** What queryRenderedFeatures finds: everything within 15 px of `at` */
    let rendered: Array<{ at: [number, number]; layer: string; properties: Record<string, unknown> }> = [
        { at: [100, 200], layer: '-1-icon', properties: { id: 'marker-1', callsign: 'Alpha' } },
    ];

    const dragPan = {
        enabled: true,
        isEnabled: vi.fn(() => dragPan.enabled),
        enable: vi.fn(() => { dragPan.enabled = true; }),
        disable: vi.fn(() => { dragPan.enabled = false; }),
    };

    const map = {
        getContainer: () => container,
        getCanvasContainer: () => canvasContainer,
        getCanvas: () => canvas,
        unproject: vi.fn(unprojectPoint),
        project: vi.fn((lngLat: { lng: number; lat: number }) => ({ x: lngLat.lng * 100, y: -lngLat.lat * 100 })),
        fire: vi.fn(),
        queryRenderedFeatures: vi.fn((box: [[number, number], [number, number]], opts: { layers: string[] }) => {
            const [[x0, y0], [x1, y1]] = box;
            return rendered
                .filter((hit) => opts.layers.includes(hit.layer))
                .filter((hit) => hit.at[0] >= x0 - 15 && hit.at[0] <= x1 + 15 && hit.at[1] >= y0 - 15 && hit.at[1] <= y1 + 15)
                .filter((hit) => Math.hypot(hit.at[0] - (x0 + x1) / 2, hit.at[1] - (y0 + y1) / 2) <= 15)
                .map((hit) => {
                    const layer = layers.get(hit.layer) as FakeLayer;
                    return { layer: { id: layer.id, type: layer.type }, source: layer.source, properties: hit.properties };
                });
        }),
        getLayer: vi.fn((id: string) => {
            const layer = layers.get(id);
            if (!layer) return undefined;
            return { id, type: layer.type, source: layer.source, serialize: () => JSON.parse(JSON.stringify(layer)) };
        }),
        getLayersOrder: vi.fn(() => [...order]),
        getFilter: vi.fn((id: string) => layers.get(id)?.filter),
        setFilter: vi.fn((id: string, filter: unknown) => {
            const layer = layers.get(id);
            if (!layer) return;
            if (filter === null || filter === undefined) delete layer.filter;
            else layer.filter = filter;
        }),
        addLayer: vi.fn((layer: FakeLayer) => add(layer)),
        removeLayer: vi.fn((id: string) => {
            layers.delete(id);
            order.splice(order.indexOf(id), 1);
        }),
        getSource: vi.fn((id: string) => sources.get(id)),
        addSource: vi.fn((id: string, spec: { data: unknown }) => {
            const source = {
                data: spec.data,
                setData: vi.fn((data: unknown) => { source.data = data; }),
            };
            sources.set(id, source);
        }),
        removeSource: vi.fn((id: string) => sources.delete(id)),
        once: vi.fn((type: string, fn: () => void) => {
            const list = listeners.get(type) ?? [];
            list.push(fn);
            listeners.set(type, list);
        }),
        off: vi.fn((type: string, fn: () => void) => {
            const list = listeners.get(type) ?? [];
            listeners.set(type, list.filter((l) => l !== fn));
        }),
        // The map draws the saved position on the next frame
        triggerRepaint: vi.fn(() => {
            setTimeout(() => emit('idle'), 16);
        }),
        dragPan,
    };

    function emit(type: string): void {
        const list = listeners.get(type) ?? [];
        listeners.set(type, []);
        list.forEach((fn) => fn());
    }

    return {
        map,
        canvas,
        canvasContainer,
        container,
        layers,
        sources,
        dragPan,
        emit,
        setRendered: (next: typeof rendered) => { rendered = next; },
    };
}

function ownMarker(): Feature {
    return {
        id: 'marker-1',
        type: 'Feature',
        path: '/',
        properties: {
            id: 'marker-1',
            callsign: 'Alpha',
            type: 'a-f-G',
            archived: true,
            center: [1, -2],
        },
        geometry: { type: 'Point', coordinates: [1, -2] },
    } as Feature;
}

function subject(): DragSubject {
    return { id: 'marker-1', label: 'Alpha', feature: ownMarker() };
}

let fake: ReturnType<typeof fakeMap>;
let drag: FeatureDrag | undefined;
let detachLongPress: (() => void) | undefined;
let save: ReturnType<typeof vi.fn>;
let resolve: ReturnType<typeof vi.fn>;
let onPickup: ReturnType<typeof vi.fn>;

function attach(overrides: Partial<FeatureDragOptions> = {}): FeatureDrag {
    drag = attachFeatureDrag(fake.map as never, {
        layers: () => ['-1-poly', '-1-polyline', '-1-icon'],
        resolve: resolve as unknown as FeatureDragOptions['resolve'],
        save: save as unknown as FeatureDragOptions['save'],
        onPickup: onPickup as unknown as FeatureDragOptions['onPickup'],
        ...overrides,
    });

    // The map's own long press, kept away from a claimed object as in stores/map.ts
    const current = drag;
    detachLongPress = attachMapLongPress(fake.map as never, () => !current.claimed());
    return drag;
}

/** Finger down on the marker and held until it is picked up */
async function pickUp(at: [number, number] = [100, 200]): Promise<void> {
    touch(fake.canvas, 'touchstart', [at]);
    await flush();
    vi.advanceTimersByTime(LONG_PRESS_DELAY);
}

/** Let the drop's save and the settle wait run */
async function settle(): Promise<void> {
    await flush();
    await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT);
    await flush();
}

function previewFeature(): { geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> } {
    const source = fake.sources.get(PREVIEW_SOURCE) as { data: { features: Array<{ geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }> } };
    return source.data.features[0];
}

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    fake = fakeMap();
    save = vi.fn(async () => undefined);
    resolve = vi.fn(async (id: string) => (id === 'marker-1' ? subject() : undefined));
    onPickup = vi.fn();
    resetFeatureDragStatus();
});

afterEach(() => {
    drag?.detach();
    drag = undefined;
    detachLongPress?.();
    detachLongPress = undefined;
    disarmSignature();
    tour.state.active = false;
    resetFeatureDragStatus();
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('attachFeatureDrag - touch', () => {
    it('a long press on an own marker picks it up instead of opening the map menu', async () => {
        attach();
        await pickUp();

        expect(resolve).toHaveBeenCalledWith('marker-1');
        expect(fake.map.fire).not.toHaveBeenCalled();
        expect(onPickup).toHaveBeenCalledTimes(1);

        // Preview in its own source with the same layers, the original hidden
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(true);
        expect(fake.layers.has(`${PREVIEW_PREFIX}-1-icon`)).toBe(true);
        expect(fake.layers.has(`${PREVIEW_PREFIX}basemap`)).toBe(false);
        expect(fake.layers.get('-1-icon')?.filter).toEqual([
            'all',
            ['==', ['geometry-type'], 'Point'],
            ['!=', ['get', 'id'], 'marker-1'],
        ]);
        expect(fake.layers.get('basemap')?.filter).toBeUndefined();

        // Picked up: the copy is drawn bigger
        expect(fake.layers.get(`${PREVIEW_PREFIX}-1-icon`)?.layout?.['icon-size'])
            .toEqual(['interpolate', ['linear'], ['zoom'], 4, 1, 18, 1.5]);

        // The map stays put under the finger
        expect(fake.dragPan.disable).toHaveBeenCalled();
        expect(featureDragStatus.phase).toBe('dragging');
        expect(featureDragStatus.label).toBe('Alpha');
        expect(save).not.toHaveBeenCalled();
    });

    it('follows the finger without saving, then saves once on drop', async () => {
        attach();
        await pickUp();

        for (const [x, y] of [[120, 220], [160, 260], [200, 300]] as Array<[number, number]>) {
            const move = touch(fake.canvas, 'touchmove', [[x, y]]);
            expect(move.defaultPrevented).toBe(true);
            vi.advanceTimersByTime(16);
        }

        expect(save).not.toHaveBeenCalled();
        const preview = previewFeature();
        expect(preview.geometry.coordinates[0]).toBeCloseTo(2);
        expect(preview.geometry.coordinates[1]).toBeCloseTo(-3);

        const end = touch(fake.canvas, 'touchend', [], [[200, 300]]);
        expect(end.defaultPrevented).toBe(true);
        await settle();

        expect(save).toHaveBeenCalledTimes(1);
        const saved = save.mock.calls[0][0] as Feature;
        expect(saved.id).toBe('marker-1');
        expect((saved.geometry as { coordinates: number[] }).coordinates[0]).toBeCloseTo(2);
        expect((saved.geometry as { coordinates: number[] }).coordinates[1]).toBeCloseTo(-3);
        expect((saved.properties.center as number[])[0]).toBeCloseTo(2);
        expect(saved.properties.callsign).toBe('Alpha');

        // Preview gone, original shown again, the map pans again
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect([...fake.layers.keys()].some((id) => id.startsWith(PREVIEW_PREFIX))).toBe(false);
        expect(fake.layers.get('-1-icon')?.filter).toEqual(['==', ['geometry-type'], 'Point']);
        expect(fake.dragPan.enabled).toBe(true);

        expect(featureDragStatus.phase).toBe('moved');
    });

    it('offers Undo for a few seconds, which saves the old position', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);
        touch(fake.canvas, 'touchend', [], [[150, 250]]);
        await settle();

        expect(featureDragStatus.phase).toBe('moved');
        await undoFeatureMove();

        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][0]).toEqual(ownMarker());
        expect(featureDragStatus.phase).toBe('idle');
    });

    it('Undo is gone after its window', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);
        touch(fake.canvas, 'touchend', [], [[150, 250]]);
        await settle();

        vi.advanceTimersByTime(UNDO_WINDOW);
        expect(featureDragStatus.phase).toBe('idle');

        await undoFeatureMove();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('dismissing the status line drops the Undo', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);
        touch(fake.canvas, 'touchend', [], [[150, 250]]);
        await settle();

        dismissFeatureMoveStatus();
        await undoFeatureMove();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('a second finger puts the marker back - nothing saved', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);

        touch(fake.canvas, 'touchstart', [[150, 250], [300, 400]]);
        touch(fake.canvas, 'touchend', [], [[150, 250]]);
        await settle();

        expect(save).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.layers.get('-1-icon')?.filter).toEqual(['==', ['geometry-type'], 'Point']);
        expect(fake.dragPan.enabled).toBe(true);
        expect(featureDragStatus.phase).toBe('idle');
    });

    it('touchcancel puts the marker back', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);
        touch(fake.canvas, 'touchcancel', []);
        await settle();

        expect(save).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
    });

    it('lifting the finger without moving is no move', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchend', [], [[100, 200]]);
        await settle();

        expect(save).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(featureDragStatus.phase).toBe('idle');
    });

    it('a failed save puts the marker back and says so', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        save.mockImplementationOnce(async () => { throw new Error('IndexedDB closed'); });

        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 250]]);
        touch(fake.canvas, 'touchend', [], [[150, 250]]);
        await settle();

        // The save, then the old position written back in case half of it landed
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][0]).toEqual(ownMarker());

        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.layers.get('-1-icon')?.filter).toEqual(['==', ['geometry-type'], 'Point']);
        expect(featureDragStatus.phase).toBe('error');
        expect(featureDragStatus.message).toContain('IndexedDB closed');

        await undoFeatureMove();
        expect(save).toHaveBeenCalledTimes(2);
        error.mockRestore();
    });

    it('a tap stays a tap', async () => {
        attach();
        touch(fake.canvas, 'touchstart', [[100, 200]]);
        await flush();
        vi.advanceTimersByTime(150);
        const end = touch(fake.canvas, 'touchend', [], [[100, 200]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(end.defaultPrevented).toBe(false);
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.map.fire).not.toHaveBeenCalled();
    });

    it('a long press on the empty map still opens its menu', async () => {
        attach();
        await pickUp([300, 600]);

        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.map.fire).toHaveBeenCalledWith('contextmenu', expect.anything());
    });

    it('an object that may not be moved keeps the map menu', async () => {
        resolve.mockImplementation(async () => undefined);
        attach();
        await pickUp();

        expect(resolve).toHaveBeenCalledWith('marker-1');
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.map.fire).toHaveBeenCalledWith('contextmenu', expect.anything());
    });

    it('the inside of an area is not a handle - its outline is', async () => {
        fake.setRendered([{ at: [100, 200], layer: '-1-poly', properties: { id: 'marker-1' } }]);
        attach();
        await pickUp();

        expect(resolve).not.toHaveBeenCalled();
        expect(fake.map.fire).toHaveBeenCalledWith('contextmenu', expect.anything());

        fake.map.fire.mockClear();
        touch(fake.canvas, 'touchend', [], [[100, 200]]);
        fake.setRendered([
            { at: [100, 200], layer: '-1-poly', properties: { id: 'marker-1' } },
            { at: [104, 200], layer: '-1-polyline', properties: { id: 'marker-1' } },
        ]);
        await pickUp();

        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(true);
        expect(fake.map.fire).not.toHaveBeenCalled();
    });

    it('not a sensor cone', async () => {
        fake.setRendered([{ at: [100, 200], layer: '-1-polyline', properties: { id: 'marker-1', derived: 'sensor' } }]);
        attach();
        await pickUp();

        expect(resolve).not.toHaveBeenCalled();
    });

    it('swallows the browser\'s own context menu over a claimed object (Android)', async () => {
        attach();
        touch(fake.canvas, 'touchstart', [[100, 200]]);
        await flush();

        const native = new Event('contextmenu', { bubbles: true, cancelable: true });
        fake.canvasContainer.dispatchEvent(native);
        expect(native.defaultPrevented).toBe(true);
    });

    it('a drag down the map drops where the finger is, not at the top edge', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[150, 600]]);
        touch(fake.canvas, 'touchend', [], [[150, 600]]);
        await settle();

        // 100 px = 1°: from (100, 200) to (150, 600) is 0.5° east, 4° south
        const saved = save.mock.calls[0][0] as Feature;
        const [lng, lat] = (saved.geometry as { coordinates: number[] }).coordinates;
        expect(lng).toBeCloseTo(1.5);
        expect(lat).toBeCloseTo(-6);
    });

    it('a drag past the edge drops at the edge', async () => {
        attach();
        await pickUp();
        touch(fake.canvas, 'touchmove', [[-80, 200]]);
        touch(fake.canvas, 'touchend', [], [[-80, 200]]);
        await settle();

        const saved = save.mock.calls[0][0] as Feature;
        expect((saved.geometry as { coordinates: number[] }).coordinates[0]).toBeCloseTo(0);
    });

    it('nothing while a signature is being placed, during the tour or when not allowed', async () => {
        attach({ allowed: () => false });
        await pickUp();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        touch(fake.canvas, 'touchend', [], [[100, 200]]);
        drag?.detach();
        detachLongPress?.();

        attach();
        const detachPlacement = attachPlacementHandler();
        armSignature({ source: 'iconset', icon: 'x' } as never, 'X');
        await pickUp();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        touch(fake.canvas, 'touchend', [], [[100, 200]]);
        detachPlacement();

        tour.state.active = true;
        await pickUp();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(resolve).not.toHaveBeenCalled();
    });

    it('ignores touches on the menus and popups over the map', async () => {
        attach();
        const popup = document.createElement('div');
        fake.canvasContainer.appendChild(popup);

        touch(popup, 'touchstart', [[100, 200]]);
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(resolve).not.toHaveBeenCalled();
    });

    it('detaches when the map is removed', async () => {
        attach();
        const removes = fake.map.once.mock.calls.filter(([type]) => type === 'remove');
        removes.forEach(([, fn]) => (fn as () => void)());

        await pickUp();
        expect(resolve).not.toHaveBeenCalled();
    });
});

describe('attachFeatureDrag - mouse', () => {
    it('drags straight away and holds the map still while the button is down', async () => {
        attach();
        mouse(fake.canvas, 'mousedown', 100, 200);
        await flush();
        expect(fake.dragPan.disable).toHaveBeenCalled();

        mouse(document, 'mousemove', 130, 240);
        vi.advanceTimersByTime(16);
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(true);
        expect(featureDragStatus.kind).toBe('mouse');

        mouse(document, 'mouseup', 150, 250);
        await settle();

        expect(save).toHaveBeenCalledTimes(1);
        const saved = save.mock.calls[0][0] as Feature;
        expect((saved.geometry as { coordinates: number[] }).coordinates[0]).toBeCloseTo(1.5);
        expect((saved.geometry as { coordinates: number[] }).coordinates[1]).toBeCloseTo(-2.5);
        expect(fake.dragPan.enabled).toBe(true);
    });

    it('a click stays a click', async () => {
        attach();
        mouse(fake.canvas, 'mousedown', 100, 200);
        await flush();
        mouse(document, 'mousemove', 102, 201);
        mouse(document, 'mouseup', 102, 201);
        await settle();

        expect(save).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(fake.dragPan.enabled).toBe(true);
    });

    it('Escape puts the object back', async () => {
        attach();
        mouse(fake.canvas, 'mousedown', 100, 200);
        await flush();
        mouse(document, 'mousemove', 160, 260);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        mouse(document, 'mouseup', 160, 260);
        await settle();

        expect(save).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
    });

    it('right, ctrl and shift clicks are not drags', async () => {
        attach();
        mouse(fake.canvas, 'mousedown', 100, 200, { button: 2 });
        mouse(fake.canvas, 'mousedown', 100, 200, { ctrlKey: true });
        mouse(fake.canvas, 'mousedown', 100, 200, { shiftKey: true });
        await flush();

        expect(resolve).not.toHaveBeenCalled();
    });

    it('the map pans when the mouse moves on before the object is known', async () => {
        let answer: (value: DragSubject | undefined) => void = () => undefined;
        resolve.mockImplementation(() => new Promise((r) => { answer = r; }));

        attach();
        mouse(fake.canvas, 'mousedown', 100, 200);
        mouse(document, 'mousemove', 160, 260);
        answer(subject());
        await flush();
        mouse(document, 'mousemove', 180, 280);
        mouse(document, 'mouseup', 180, 280);
        await settle();

        expect(fake.dragPan.disable).not.toHaveBeenCalled();
        expect(fake.sources.has(PREVIEW_SOURCE)).toBe(false);
        expect(save).not.toHaveBeenCalled();
    });

    it('ignores the mouse events a browser emulates after a touch', async () => {
        attach();
        touch(fake.canvas, 'touchstart', [[100, 200]]);
        touch(fake.canvas, 'touchend', [], [[100, 200]]);
        mouse(fake.canvas, 'mousedown', 100, 200);
        await flush();

        // Only the touch looked the object up
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(fake.dragPan.disable).not.toHaveBeenCalled();
    });
});

describe('storeFeatureDragOptions', () => {
    function fakeCOT(overrides: Record<string, unknown> = {}) {
        const feature = ownMarker();
        return {
            id: 'marker-1',
            is_self: false,
            is_skittle: false,
            is_editable: true,
            geometry: feature.geometry,
            properties: feature.properties,
            origin: { mode: OriginMode.CONNECTION },
            as_feature: () => JSON.parse(JSON.stringify(feature)),
            ...overrides,
        };
    }

    function fakeStore(cot: unknown) {
        return {
            worker: {
                db: {
                    get: vi.fn(async () => cot),
                    add: vi.fn(async () => undefined),
                },
            },
            refresh: vi.fn(async () => undefined),
            locked: [] as string[],
            radial: { mode: 'cot' as string | undefined, cot: {} as unknown },
        };
    }

    it('resolves an own marker with its name and stored feature', async () => {
        const store = fakeStore(fakeCOT());
        const opts = storeFeatureDragOptions(store as unknown as FeatureDragStore, () => [], () => true);

        const found = await opts.resolve('marker-1');
        expect(store.worker.db.get).toHaveBeenCalledWith('marker-1', { mission: true });
        expect(found).toEqual({ id: 'marker-1', label: 'Alpha', feature: ownMarker() });
    });

    it('refuses what may not be moved', async () => {
        for (const cot of [
            fakeCOT({ is_self: true }),
            fakeCOT({ is_skittle: true }),
            fakeCOT({ is_editable: false }),
            undefined,
        ]) {
            const opts = storeFeatureDragOptions(fakeStore(cot) as unknown as FeatureDragStore, () => [], () => true);
            expect(await opts.resolve('marker-1')).toBeUndefined();
        }

        const locked = fakeStore(fakeCOT());
        locked.locked.push('marker-1');
        const opts = storeFeatureDragOptions(locked as unknown as FeatureDragStore, () => [], () => true);
        expect(await opts.resolve('marker-1')).toBeUndefined();
    });

    it('in a Data Sync only with write access', async () => {
        const from = vi.spyOn(Subscription, 'from');
        const cot = fakeCOT({ origin: { mode: OriginMode.MISSION, mode_id: 'mission-guid' } });

        from.mockResolvedValueOnce({ role: { permissions: ['MISSION_READ'] } } as never);
        let opts = storeFeatureDragOptions(fakeStore(cot) as unknown as FeatureDragStore, () => [], () => true);
        expect(await opts.resolve('marker-1')).toBeUndefined();
        expect(from).toHaveBeenCalledWith('mission-guid');

        from.mockResolvedValueOnce({ role: { permissions: ['MISSION_READ', 'MISSION_WRITE'] } } as never);
        opts = storeFeatureDragOptions(fakeStore(cot) as unknown as FeatureDragStore, () => [], () => true);
        expect(await opts.resolve('marker-1')).toBeDefined();

        from.mockRestore();
    });

    it('saves as Edit Geometry does: authored add, then a refresh', async () => {
        const store = fakeStore(fakeCOT());
        const opts = storeFeatureDragOptions(store as unknown as FeatureDragStore, () => [], () => true);

        await opts.save(ownMarker());
        expect(store.worker.db.add).toHaveBeenCalledWith(ownMarker(), { authored: true });
        expect(store.refresh).toHaveBeenCalledTimes(1);
        expect(store.worker.db.add.mock.invocationCallOrder[0]).toBeLessThan(store.refresh.mock.invocationCallOrder[0]);
    });

    it('closes an open ring menu on pickup', () => {
        const store = fakeStore(fakeCOT());
        const opts = storeFeatureDragOptions(store as unknown as FeatureDragStore, () => [], () => true);

        opts.onPickup?.();
        expect(store.radial.mode).toBeUndefined();
        expect(store.radial.cot).toBeUndefined();
    });
});
