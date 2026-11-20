import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feature } from '../types.ts';
import {
    DragGesture,
    MAX_LATITUDE,
    MOUSE_DRAG_THRESHOLD,
    canMoveCOT,
    effectiveDelta,
    lngLatDelta,
    missionWritable,
    scaleSize,
    translateFeature,
    translateGeometry,
    type DragGestureOptions,
    type MovableCandidate,
} from './feature-drag.ts';
import { LONG_PRESS_DELAY, LONG_PRESS_TOLERANCE } from './long-press.ts';

/** Settle the probe's promise */
async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

function setup(overrides: Partial<DragGestureOptions<string>> = {}) {
    const calls = {
        claim: vi.fn(),
        pickup: vi.fn(),
        move: vi.fn(),
        drop: vi.fn(),
        cancel: vi.fn(),
        release: vi.fn(),
    };

    const gesture = new DragGesture<string>({
        probe: () => 'marker',
        onClaim: calls.claim,
        onPickup: calls.pickup,
        onMove: calls.move,
        onDrop: calls.drop,
        onCancel: calls.cancel,
        onRelease: calls.release,
        ...overrides,
    });

    return { gesture, calls };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('DragGesture - touch', () => {
    it('picks the object up after holding it still for the long press delay', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();

        expect(calls.claim).toHaveBeenCalledWith('marker', 'touch');
        expect(gesture.claimed).toBe(true);

        vi.advanceTimersByTime(LONG_PRESS_DELAY - 1);
        expect(calls.pickup).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(calls.pickup).toHaveBeenCalledWith('marker', { x: 100, y: 200 }, 'touch');
        expect(gesture.dragging).toBe(true);
    });

    it('measures the drag from where the finger rests at pickup, small drift included', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        gesture.move({ x: 104, y: 203 });
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(calls.pickup).toHaveBeenCalledWith('marker', { x: 104, y: 203 }, 'touch');
    });

    it('follows the finger and drops where it is lifted', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        gesture.move({ x: 150, y: 260 });
        gesture.move({ x: 180, y: 300 });
        expect(calls.move).toHaveBeenLastCalledWith({ x: 180, y: 300 });

        expect(gesture.up({ x: 181, y: 301 })).toBe(true);
        expect(calls.drop).toHaveBeenCalledWith({ x: 181, y: 301 });
        expect(calls.release).toHaveBeenCalledTimes(1);
        expect(gesture.state).toBe('idle');
        expect(gesture.claimed).toBe(false);
    });

    it('drops at the last known position when the lift has none', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        gesture.move({ x: 140, y: 240 });

        gesture.up();
        expect(calls.drop).toHaveBeenCalledWith({ x: 140, y: 240 });
    });

    it('is a pan of the map when the finger moves beyond the tolerance first', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        gesture.move({ x: 100 + LONG_PRESS_TOLERANCE + 1, y: 200 });

        expect(gesture.state).toBe('idle');
        expect(calls.release).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(calls.pickup).not.toHaveBeenCalled();
    });

    it('a tap stays a tap', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(200);

        expect(gesture.up({ x: 100, y: 200 })).toBe(false);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(calls.pickup).not.toHaveBeenCalled();
        expect(calls.drop).not.toHaveBeenCalled();
        expect(calls.release).toHaveBeenCalledTimes(1);
    });

    it('a second finger before pickup aborts - pinch to zoom', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        gesture.down('touch', { x: 300, y: 400 }, 2);

        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(calls.pickup).not.toHaveBeenCalled();
        expect(gesture.state).toBe('idle');
    });

    it('a second finger while dragging puts the object back', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        gesture.move({ x: 150, y: 250 });

        gesture.down('touch', { x: 300, y: 400 }, 2);

        expect(calls.cancel).toHaveBeenCalledTimes(1);
        expect(calls.drop).not.toHaveBeenCalled();
        expect(calls.release).toHaveBeenCalledTimes(1);
        expect(gesture.state).toBe('idle');
    });

    it('two fingers moving while dragging put the object back', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        gesture.move({ x: 150, y: 250 }, 2);
        expect(calls.cancel).toHaveBeenCalledTimes(1);
        expect(gesture.up()).toBe(false);
        expect(calls.drop).not.toHaveBeenCalled();
    });

    it('touchcancel puts the object back', async () => {
        const { gesture, calls } = setup();

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        gesture.cancel();
        expect(calls.cancel).toHaveBeenCalledTimes(1);
        expect(calls.drop).not.toHaveBeenCalled();
    });

    it('nothing to move under the finger: the long press belongs to the map', async () => {
        const { gesture, calls } = setup({ probe: () => null });

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        expect(gesture.claimed).toBe(false);

        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(calls.pickup).not.toHaveBeenCalled();
        expect(calls.claim).not.toHaveBeenCalled();
        expect(gesture.state).toBe('idle');
    });

    it('a probe answering after the delay is too late', async () => {
        let answer: (value: string) => void = () => undefined;
        const { gesture, calls } = setup({
            probe: () => new Promise<string>((resolve) => { answer = resolve; }),
        });

        gesture.down('touch', { x: 100, y: 200 });
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        answer('marker');
        await flush();

        expect(calls.claim).not.toHaveBeenCalled();
        expect(calls.pickup).not.toHaveBeenCalled();
    });

    it('a failing probe is no object', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { gesture, calls } = setup({ probe: () => Promise.reject(new Error('db closed')) });

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(calls.pickup).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('does nothing while disabled', async () => {
        const probe = vi.fn(() => 'marker');
        const { gesture, calls } = setup({ enabled: () => false, probe });

        gesture.down('touch', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(probe).not.toHaveBeenCalled();
        expect(calls.pickup).not.toHaveBeenCalled();
    });
});

describe('DragGesture - mouse', () => {
    it('drags once the mouse moves past the threshold, measured from the button press', async () => {
        const { gesture, calls } = setup();

        gesture.down('mouse', { x: 100, y: 200 });
        await flush();
        expect(calls.claim).toHaveBeenCalledWith('marker', 'mouse');

        gesture.move({ x: 100 + MOUSE_DRAG_THRESHOLD, y: 200 });
        expect(calls.pickup).not.toHaveBeenCalled();

        gesture.move({ x: 100 + MOUSE_DRAG_THRESHOLD + 3, y: 200 });
        expect(calls.pickup).toHaveBeenCalledWith('marker', { x: 100, y: 200 }, 'mouse');
        expect(calls.move).toHaveBeenCalledWith({ x: 100 + MOUSE_DRAG_THRESHOLD + 3, y: 200 });

        expect(gesture.up({ x: 160, y: 230 })).toBe(true);
        expect(calls.drop).toHaveBeenCalledWith({ x: 160, y: 230 });
    });

    it('needs no hold time', async () => {
        const { gesture, calls } = setup();

        gesture.down('mouse', { x: 100, y: 200 });
        await flush();
        vi.advanceTimersByTime(LONG_PRESS_DELAY * 4);

        expect(calls.pickup).not.toHaveBeenCalled();
        expect(gesture.state).toBe('pressing');
    });

    it('a click stays a click', async () => {
        const { gesture, calls } = setup();

        gesture.down('mouse', { x: 100, y: 200 });
        await flush();
        gesture.move({ x: 102, y: 201 });

        expect(gesture.up({ x: 102, y: 201 })).toBe(false);
        expect(calls.pickup).not.toHaveBeenCalled();
        expect(calls.drop).not.toHaveBeenCalled();
        // The map is free again
        expect(calls.release).toHaveBeenCalledTimes(1);
    });

    it('moving before the object is known pans the map', async () => {
        const { gesture, calls } = setup({ probe: () => new Promise(() => undefined) });

        gesture.down('mouse', { x: 100, y: 200 });
        gesture.move({ x: 130, y: 200 });

        expect(gesture.state).toBe('idle');
        expect(calls.pickup).not.toHaveBeenCalled();
    });

    it('nothing to move: the map pans', async () => {
        const { gesture, calls } = setup({ probe: () => undefined });

        gesture.down('mouse', { x: 100, y: 200 });
        await flush();
        gesture.move({ x: 130, y: 200 });

        expect(calls.claim).not.toHaveBeenCalled();
        expect(calls.pickup).not.toHaveBeenCalled();
        expect(gesture.state).toBe('idle');
    });

    it('cancel (Escape) puts the dragged object back', async () => {
        const { gesture, calls } = setup();

        gesture.down('mouse', { x: 100, y: 200 });
        await flush();
        gesture.move({ x: 140, y: 200 });

        gesture.cancel();
        expect(calls.cancel).toHaveBeenCalledTimes(1);
        expect(calls.release).toHaveBeenCalledTimes(1);
        expect(gesture.up({ x: 150, y: 200 })).toBe(false);
        expect(calls.drop).not.toHaveBeenCalled();
    });

    it('an answer of an earlier gesture does not claim the next one', async () => {
        const answers: Array<(value: string | null) => void> = [];
        const { gesture, calls } = setup({
            probe: () => new Promise<string | null>((resolve) => { answers.push(resolve); }),
        });

        gesture.down('mouse', { x: 100, y: 200 });
        gesture.up({ x: 100, y: 200 });
        gesture.down('mouse', { x: 300, y: 300 });

        answers[0]('marker');
        await flush();
        expect(calls.claim).not.toHaveBeenCalled();

        answers[1](null);
        await flush();
        expect(gesture.claimed).toBe(false);
    });
});

function candidate(overrides: Partial<MovableCandidate> = {}): MovableCandidate {
    return {
        id: 'own-marker',
        is_self: false,
        is_skittle: false,
        is_editable: true,
        geometry: { type: 'Point' },
        ...overrides,
    };
}

describe('canMoveCOT', () => {
    it('moves own markers, signatures, lines and areas', () => {
        expect(canMoveCOT(candidate())).toBe(true);
        expect(canMoveCOT(candidate({ geometry: { type: 'LineString' } }))).toBe(true);
        expect(canMoveCOT(candidate({ geometry: { type: 'Polygon' } }))).toBe(true);
    });

    it('not the own GPS position, although Edit Geometry allows it', () => {
        expect(canMoveCOT(candidate({ is_self: true }))).toBe(false);
    });

    it('not other participants', () => {
        expect(canMoveCOT(candidate({ is_skittle: true }))).toBe(false);
    });

    it('not what Edit Geometry refuses (machine generated, not archived)', () => {
        expect(canMoveCOT(candidate({ is_editable: false }))).toBe(false);
    });

    it('in a Data Sync only with write access', () => {
        expect(canMoveCOT(candidate(), { mission: { role: { permissions: ['MISSION_READ', 'MISSION_WRITE'] } } })).toBe(true);
        expect(canMoveCOT(candidate(), { mission: { role: { permissions: ['MISSION_READ'] } } })).toBe(false);
        expect(canMoveCOT(candidate(), { mission: { role: null } })).toBe(false);
        expect(canMoveCOT(candidate(), { mission: undefined })).toBe(true);
    });

    it('not the object the map is locked on', () => {
        expect(canMoveCOT(candidate(), { lockedOn: 'own-marker' })).toBe(false);
        expect(canMoveCOT(candidate(), { lockedOn: 'other' })).toBe(true);
    });

    it('not geometry collections', () => {
        expect(canMoveCOT(candidate({ geometry: { type: 'GeometryCollection' } }))).toBe(false);
    });

    it('mission write access as CoTView decides it', () => {
        expect(missionWritable(undefined)).toBe(true);
        expect(missionWritable({ role: { permissions: ['MISSION_WRITE'] } })).toBe(true);
        expect(missionWritable({})).toBe(false);
    });
});

function feature(geometry: Feature['geometry'], properties: Record<string, unknown> = {}): Feature {
    return {
        id: 'f1',
        type: 'Feature',
        path: '/',
        properties: { id: 'f1', ...properties },
        geometry,
    } as Feature;
}

describe('translateFeature', () => {
    it('moves a point and its centre, dropping the altitude', () => {
        const moved = translateFeature(feature(
            { type: 'Point', coordinates: [7.45, 46.95, 540] },
            { center: [7.45, 46.95, 540], callsign: 'Alpha' }
        ), [0.01, -0.02]);

        const coords = (moved.geometry as { coordinates: number[] }).coordinates;
        expect(coords).toHaveLength(2);
        expect(coords[0]).toBeCloseTo(7.46);
        expect(coords[1]).toBeCloseTo(46.93);
        expect(moved.properties.center).toEqual(coords);
        expect(moved.properties.callsign).toBe('Alpha');
    });

    it('moves every vertex of a line by the same offset', () => {
        const moved = translateFeature(feature({
            type: 'LineString',
            coordinates: [[7, 46], [7.1, 46.1], [7.2, 46.05]],
        }), [0.5, 0.25]);

        expect(moved.geometry.type).toBe('LineString');
        const coords = (moved.geometry as { coordinates: number[][] }).coordinates;
        expect(coords[0][0]).toBeCloseTo(7.5);
        expect(coords[0][1]).toBeCloseTo(46.25);
        expect(coords[1][0]).toBeCloseTo(7.6);
        expect(coords[1][1]).toBeCloseTo(46.35);
        expect(coords[2][0]).toBeCloseTo(7.7);
        expect(coords[2][1]).toBeCloseTo(46.3);
    });

    it('moves a polygon with a hole, rings stay closed', () => {
        const outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
        const hole = [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]];
        const moved = translateFeature(feature({ type: 'Polygon', coordinates: [outer, hole] }), [10, 20]);

        const rings = (moved.geometry as { coordinates: number[][][] }).coordinates;
        expect(rings).toEqual([
            outer.map(([x, y]) => [x + 10, y + 20]),
            hole.map(([x, y]) => [x + 10, y + 20]),
        ]);
        expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
        expect(rings[1][0]).toEqual(rings[1][rings[1].length - 1]);
    });

    it('leaves the original untouched', () => {
        const original = feature({ type: 'Point', coordinates: [1, 2] }, { center: [1, 2] });
        translateFeature(original, [1, 1]);

        expect(original.geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
        expect(original.properties.center).toEqual([1, 2]);
    });

    it('keeps the shape when held at the edge of the map', () => {
        const moved = translateFeature(feature({
            type: 'LineString',
            coordinates: [[0, 80], [0, 84]],
        }), [0, 5]);

        const coords = (moved.geometry as { coordinates: number[][] }).coordinates;
        expect(coords[1][1]).toBeCloseTo(MAX_LATITUDE);
        expect(coords[1][1] - coords[0][1]).toBeCloseTo(4);
    });
});

describe('effectiveDelta / lngLatDelta', () => {
    it('is the offset between two positions', () => {
        expect(lngLatDelta({ lng: 7, lat: 46 }, { lng: 7.5, lat: 45.75 })).toEqual([0.5, -0.25]);
    });

    it('keeps a dragged object within ±180°', () => {
        const delta = effectiveDelta({ type: 'Point', coordinates: [179, 0] }, [2, 0]);
        expect(delta[0]).toBeCloseTo(-358);

        const moved = translateGeometry({ type: 'Point', coordinates: [179, 0] }, delta);
        expect(moved.coordinates[0]).toBeCloseTo(-179);
    });

    it('a normal offset passes unchanged', () => {
        expect(effectiveDelta({ type: 'Point', coordinates: [7, 46] }, [0.1, 0.2])).toEqual([0.1, 0.2]);
    });
});

describe('scaleSize', () => {
    it('scales a number', () => {
        expect(scaleSize(1, 1.25)).toBe(1.25);
    });

    it('scales the outputs of a zoom curve and keeps it top-level', () => {
        expect(scaleSize(['interpolate', ['linear'], ['zoom'], 4, 0.8, 8, 1, 18, 1.2], 2))
            .toEqual(['interpolate', ['linear'], ['zoom'], 4, 1.6, 8, 2, 18, 2.4]);

        expect(scaleSize(['step', ['zoom'], 1, 10, 2], 2)).toEqual(['step', ['zoom'], 2, 10, 4]);
    });

    it('wraps a data expression without zoom', () => {
        expect(scaleSize(['get', 'size'], 2)).toEqual(['*', 2, ['get', 'size']]);
    });

    it('leaves a nested zoom expression alone', () => {
        const nested = ['case', ['has', 'x'], ['interpolate', ['linear'], ['zoom'], 1, 1, 2, 2], 1];
        expect(scaleSize(nested, 2)).toBe(nested);
    });

    it('has nothing to scale without a value', () => {
        expect(scaleSize(undefined, 2)).toBeUndefined();
    });
});
