/**
 * Long press on a touch screen, for the map's context menu.
 *
 * The context ring (new object, paste, position info with the fire grid cell)
 * hangs on MapLibre's `contextmenu` event. A right click and Android Chrome's
 * long press fire it, iOS Safari's long press does not. This adds the long
 * press for touch and hands it to the same `contextmenu` listeners, with the
 * same position data.
 *
 * - fires after LONG_PRESS_DELAY with one finger held still
 * - cancelled by moving more than LONG_PRESS_TOLERANCE, by a second finger
 *   (pinch), by lifting the finger and by touchcancel
 * - one gesture, one menu: a browser that fires `contextmenu` itself wins
 *   while ours is still waiting, and its event is dropped after ours fired
 * - lifting the finger after it fired is not a tap, so the menu that just
 *   opened does not close again
 */
import type { LngLat, Map as MapLibreMap, Point } from 'maplibre-gl';
import { isSignatureArmed } from './signature-placement.ts';
import { tour } from '../tutorial/tour.ts';

export const LONG_PRESS_DELAY = 500;
export const LONG_PRESS_TOLERANCE = 10;
/** A `contextmenu` of the browser this soon after our long press belongs to the same gesture */
export const NATIVE_GRACE = 1000;

export interface LongPress {
    clientX: number;
    clientY: number;
    /** The touchstart that began the press */
    event: TouchEvent;
}

export interface LongPressOptions {
    delay?: number;
    tolerance?: number;
    /** Checked when the finger goes down and again when the press fires */
    enabled?: () => boolean;
    /**
     * Element whose `contextmenu` events count as the browser's own long
     * press - an ancestor of the listeners that must not see a duplicate
     */
    guard?: HTMLElement;
    onLongPress: (press: LongPress) => void;
}

export function attachLongPress(target: HTMLElement, opts: LongPressOptions): () => void {
    const delay = opts.delay ?? LONG_PRESS_DELAY;
    const tolerance = opts.tolerance ?? LONG_PRESS_TOLERANCE;
    const guard = opts.guard ?? target;
    const enabled = opts.enabled ?? (() => true);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; event: TouchEvent } | null = null;
    /** The current gesture already opened the menu */
    let fired = false;
    let firedAt = Number.NEGATIVE_INFINITY;

    function cancel(): void {
        if (timer) clearTimeout(timer);
        timer = undefined;
        start = null;
    }

    function onTouchStart(event: TouchEvent): void {
        fired = false;

        if (event.touches.length !== 1 || !enabled()) {
            cancel();
            return;
        }

        const touch = event.touches[0];
        cancel();
        start = { x: touch.clientX, y: touch.clientY, event };

        timer = setTimeout(() => {
            timer = undefined;
            const press = start;
            start = null;

            if (!press || !enabled()) return;

            fired = true;
            firedAt = Date.now();
            opts.onLongPress({ clientX: press.x, clientY: press.y, event: press.event });
        }, delay);
    }

    function onTouchMove(event: TouchEvent): void {
        if (!start) return;

        if (event.touches.length !== 1) {
            cancel();
            return;
        }

        const touch = event.touches[0];
        if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > tolerance) cancel();
    }

    function onTouchEnd(event: TouchEvent): void {
        cancel();

        // No click after the press: it would close the menu that just opened
        if (fired && event.cancelable) event.preventDefault();
    }

    function onTouchCancel(): void {
        cancel();
    }

    function onContextMenu(event: Event): void {
        if (start) {
            // This browser has its own long press - let it open the menu
            cancel();
            return;
        }

        if (Date.now() - firedAt < NATIVE_GRACE) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchmove', onTouchMove, { passive: true });
    target.addEventListener('touchend', onTouchEnd, { passive: false });
    target.addEventListener('touchcancel', onTouchCancel, { passive: true });
    // Capture: runs before the map's own contextmenu listeners further in
    guard.addEventListener('contextmenu', onContextMenu, true);

    return () => {
        cancel();
        target.removeEventListener('touchstart', onTouchStart);
        target.removeEventListener('touchmove', onTouchMove);
        target.removeEventListener('touchend', onTouchEnd);
        target.removeEventListener('touchcancel', onTouchCancel);
        guard.removeEventListener('contextmenu', onContextMenu, true);
    };
}

type LongPressMap = Pick<MapLibreMap, 'getCanvasContainer' | 'getContainer' | 'unproject' | 'project' | 'fire' | 'once'>;

export interface MapContextEvent {
    lngLat: LngLat;
    point: Point;
    originalEvent: TouchEvent;
}

/**
 * Long press on the map opens the same context menu as a right click: it is
 * fired as the map's `contextmenu` event. Not while a favourite signature is
 * being placed, not during the tutorial, and not when `allowed` says no
 * (e.g. while drawing). Detaches itself when the map is removed.
 */
export function attachMapLongPress(map: LongPressMap, allowed: () => boolean = () => true): () => void {
    const canvas = map.getCanvasContainer();

    const detach = attachLongPress(canvas, {
        guard: map.getContainer(),
        enabled: () => !isSignatureArmed() && !tour.state.active && allowed(),
        onLongPress: ({ clientX, clientY, event }) => {
            // Relative to the canvas container, as MapLibre computes event points
            const rect = canvas.getBoundingClientRect();
            const lngLat = map.unproject([
                clientX - rect.left - canvas.clientLeft,
                clientY - rect.top - canvas.clientTop,
            ]);

            const data: MapContextEvent = { lngLat, point: map.project(lngLat), originalEvent: event };
            map.fire('contextmenu', data);
        },
    });

    map.once('remove', detach);
    return detach;
}
