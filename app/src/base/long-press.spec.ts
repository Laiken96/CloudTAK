import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_DELAY, attachLongPress, attachMapLongPress } from './long-press.ts';
import { armSignature, attachPlacementHandler, disarmSignature } from './signature-placement.ts';
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

function contextmenu(target: EventTarget): Event {
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
}

/** Map container > canvas container > canvas, as MapLibre builds it */
function fakeMap() {
    const container = document.createElement('div');
    const canvasContainer = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvasContainer);
    canvasContainer.appendChild(canvas);
    document.body.appendChild(container);

    canvasContainer.getBoundingClientRect = () => ({
        top: 20, left: 10, width: 390, height: 800, right: 400, bottom: 820, x: 10, y: 20, toJSON: () => ({}),
    });

    // The map's own contextmenu listener (MapLibre listens on the canvas container)
    const native = vi.fn();
    canvasContainer.addEventListener('contextmenu', native);

    const removeHandlers: Array<() => void> = [];
    const map = {
        getContainer: () => container,
        getCanvasContainer: () => canvasContainer,
        unproject: vi.fn(([x, y]: [number, number]) => ({ lng: x / 10, lat: y / 10, wrap() { return this; } })),
        project: vi.fn((lngLat: { lng: number; lat: number }) => ({ x: lngLat.lng * 10, y: lngLat.lat * 10 })),
        fire: vi.fn(),
        once: vi.fn((type: string, fn: () => void) => {
            if (type === 'remove') removeHandlers.push(fn);
        }),
    };

    return {
        map,
        canvas,
        native,
        remove: () => removeHandlers.forEach((fn) => fn()),
    };
}

let detach: (() => void) | undefined;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    detach?.();
    detach = undefined;
    disarmSignature();
    tour.state.active = false;
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('attachMapLongPress', () => {
    it('opens the context menu at the finger after half a second', () => {
        const { map, canvas } = fakeMap();
        detach = attachMapLongPress(map as never);

        const start = touch(canvas, 'touchstart', [[110, 220]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY - 1);
        expect(map.fire).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(map.fire).toHaveBeenCalledTimes(1);

        const [type, data] = map.fire.mock.calls[0];
        expect(type).toBe('contextmenu');
        // Relative to the canvas container: 110 - 10, 220 - 20
        expect(map.unproject).toHaveBeenCalledWith([100, 200]);
        expect(data.lngLat).toMatchObject({ lng: 10, lat: 20 });
        expect(data.point).toEqual({ x: 100, y: 200 });
        expect(data.originalEvent).toBe(start);
    });

    it('lets the finger tremble a little but cancels when it moves', () => {
        const { map, canvas } = fakeMap();
        detach = attachMapLongPress(map as never);

        touch(canvas, 'touchstart', [[100, 100]]);
        touch(canvas, 'touchmove', [[105, 104]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(map.fire).toHaveBeenCalledTimes(1);

        touch(canvas, 'touchend', [], [[105, 104]]);
        touch(canvas, 'touchstart', [[100, 100]]);
        touch(canvas, 'touchmove', [[100, 115]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY * 2);
        expect(map.fire).toHaveBeenCalledTimes(1);
    });

    it('cancels for a second finger (pinch)', () => {
        const { map, canvas } = fakeMap();
        detach = attachMapLongPress(map as never);

        touch(canvas, 'touchstart', [[100, 100]]);
        touch(canvas, 'touchstart', [[100, 100], [200, 200]], [[200, 200]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY * 2);
        expect(map.fire).not.toHaveBeenCalled();

        touch(canvas, 'touchstart', [[100, 100]]);
        touch(canvas, 'touchmove', [[100, 100], [150, 150]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY * 2);
        expect(map.fire).not.toHaveBeenCalled();
    });

    it('cancels when the finger is lifted or the touch is cancelled', () => {
        const { map, canvas } = fakeMap();
        detach = attachMapLongPress(map as never);

        touch(canvas, 'touchstart', [[100, 100]]);
        vi.advanceTimersByTime(300);
        const tap = touch(canvas, 'touchend', [], [[100, 100]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(map.fire).not.toHaveBeenCalled();
        // A normal tap stays a tap
        expect(tap.defaultPrevented).toBe(false);

        touch(canvas, 'touchstart', [[100, 100]]);
        touch(canvas, 'touchcancel', [], [[100, 100]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        expect(map.fire).not.toHaveBeenCalled();
    });

    it('lifting the finger after the press does not tap the menu closed', () => {
        const { map, canvas } = fakeMap();
        detach = attachMapLongPress(map as never);

        touch(canvas, 'touchstart', [[100, 100]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        const lift = touch(canvas, 'touchend', [], [[100, 100]]);

        expect(map.fire).toHaveBeenCalledTimes(1);
        expect(lift.defaultPrevented).toBe(true);
    });

    it('opens one menu on browsers with their own long press (Android Chrome)', () => {
        const { map, canvas, native } = fakeMap();
        detach = attachMapLongPress(map as never);

        // The browser is faster: its contextmenu opens the menu, ours stands down
        touch(canvas, 'touchstart', [[100, 100]]);
        vi.advanceTimersByTime(450);
        const early = contextmenu(canvas);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        touch(canvas, 'touchend', [], [[100, 100]]);

        expect(native).toHaveBeenCalledTimes(1);
        expect(early.defaultPrevented).toBe(false);
        expect(map.fire).not.toHaveBeenCalled();

        // Ours is faster: the browser's contextmenu that follows is dropped
        vi.advanceTimersByTime(5000);
        touch(canvas, 'touchstart', [[100, 100]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        const late = contextmenu(canvas);
        touch(canvas, 'touchend', [], [[100, 100]]);

        expect(map.fire).toHaveBeenCalledTimes(1);
        expect(native).toHaveBeenCalledTimes(1);
        expect(late.defaultPrevented).toBe(true);
    });

    it('leaves a right click with the mouse alone', () => {
        const { map, canvas, native } = fakeMap();
        detach = attachMapLongPress(map as never);

        const click = contextmenu(canvas);

        expect(native).toHaveBeenCalledTimes(1);
        expect(click.defaultPrevented).toBe(false);
        expect(map.fire).not.toHaveBeenCalled();
    });

    it('stays off while a signature is placed, during the tutorial and while drawing', () => {
        const { map, canvas } = fakeMap();
        let drawing = false;
        detach = attachMapLongPress(map as never, () => !drawing);

        const press = () => {
            touch(canvas, 'touchstart', [[100, 100]]);
            vi.advanceTimersByTime(LONG_PRESS_DELAY);
            touch(canvas, 'touchend', [], [[100, 100]]);
        };

        const detachPlacement = attachPlacementHandler();
        armSignature({ type: 'a-f-G' } as never, 'Test');
        press();
        detachPlacement();
        expect(map.fire).not.toHaveBeenCalled();

        tour.state.active = true;
        press();
        tour.state.active = false;
        expect(map.fire).not.toHaveBeenCalled();

        drawing = true;
        press();
        expect(map.fire).not.toHaveBeenCalled();

        // Tutorial started while the finger is already down: no menu either
        drawing = false;
        touch(canvas, 'touchstart', [[100, 100]]);
        tour.state.active = true;
        vi.advanceTimersByTime(LONG_PRESS_DELAY);
        tour.state.active = false;
        expect(map.fire).not.toHaveBeenCalled();

        press();
        expect(map.fire).toHaveBeenCalledTimes(1);
    });

    it('lets go of the map when it is removed', () => {
        const { map, canvas, remove } = fakeMap();
        attachMapLongPress(map as never);

        remove();
        touch(canvas, 'touchstart', [[100, 100]]);
        vi.advanceTimersByTime(LONG_PRESS_DELAY);

        expect(map.fire).not.toHaveBeenCalled();
    });
});

describe('attachLongPress', () => {
    it('takes its own delay and tolerance', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const onLongPress = vi.fn();
        detach = attachLongPress(el, { delay: 800, tolerance: 30, onLongPress });

        touch(el, 'touchstart', [[0, 0]]);
        touch(el, 'touchmove', [[20, 20]]);
        vi.advanceTimersByTime(799);
        expect(onLongPress).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ clientX: 0, clientY: 0 }));
    });
});
