/**
 * Move an object on the map by dragging it, as in ATAK: on a touch screen a
 * long press picks it up, with a mouse it is dragged straight away. Lifting
 * the finger or the button drops it.
 *
 * This file holds the parts without a map: the gesture state machine, the
 * rule which objects can be moved and the shift of their geometry.
 * feature-drag-map.ts wires them to the map (preview, saving, undo).
 */
import type { Geometry, Position } from 'geojson';
import type { Feature } from '../types.ts';
import { LONG_PRESS_DELAY, LONG_PRESS_TOLERANCE } from './long-press.ts';

/** A mouse drag starts after this many pixels - less is a click */
export const MOUSE_DRAG_THRESHOLD = 5;

export type PointerKind = 'touch' | 'mouse';

export interface DragPoint {
    x: number;
    y: number;
}

export type DragGestureState = 'idle' | 'pressing' | 'dragging';

export interface DragGestureOptions<T> {
    /** Touch: hold this long to pick the object up */
    delay?: number;
    /** Touch: moving further than this while holding is a pan of the map */
    tolerance?: number;
    /** Mouse: moving further than this starts the drag */
    threshold?: number;
    /** Checked when the pointer goes down */
    enabled?: () => boolean;
    /** The movable object under the pointer, if any */
    probe: (point: DragPoint, kind: PointerKind) => Promise<T | null | undefined> | T | null | undefined;
    /**
     * The pointer went down on a movable object. With a mouse the map must
     * stay still from here on; with a touch the map's own long press must not fire
     */
    onClaim?: (target: T, kind: PointerKind) => void;
    /** Picked up: `from` is the point the drag is measured from */
    onPickup: (target: T, from: DragPoint, kind: PointerKind) => void;
    onMove: (point: DragPoint) => void;
    onDrop: (point: DragPoint) => void;
    /** Dropped nowhere: put the object back */
    onCancel: () => void;
    /** A claimed gesture ended, however it ended (after onDrop / onCancel) */
    onRelease?: () => void;
}

/**
 * The gesture as a state machine, fed with plain pointer positions so it is
 * the same for touch and mouse and testable without a browser:
 *
 * - touch: the finger rests LONG_PRESS_DELAY within LONG_PRESS_TOLERANCE on a
 *   movable object → picked up. Moving further before that is a pan of the
 *   map, a second finger or a cancel aborts, lifting it early is a tap.
 * - mouse: button down on a movable object, then moving further than
 *   MOUSE_DRAG_THRESHOLD → dragged. Less is a click.
 * - while dragging, a second finger or cancel() puts the object back.
 *
 * The probe may be async (the editing rights live in the database); with a
 * touch it must answer before the delay is up, with a mouse before the
 * threshold is crossed - otherwise the gesture belongs to the map.
 */
export class DragGesture<T> {
    readonly opts: DragGestureOptions<T>;

    private _state: DragGestureState = 'idle';
    private kind: PointerKind = 'touch';
    private start: DragPoint = { x: 0, y: 0 };
    private last: DragPoint = { x: 0, y: 0 };
    private target: T | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    /** Answers of an earlier gesture's probe are ignored */
    private token = 0;

    constructor(opts: DragGestureOptions<T>) {
        this.opts = opts;
    }

    get state(): DragGestureState {
        return this._state;
    }

    /** The current gesture is on a movable object - the map's own gestures stay out */
    get claimed(): boolean {
        return this._state !== 'idle' && this.target !== null;
    }

    get dragging(): boolean {
        return this._state === 'dragging';
    }

    /**
     * Pointer down. `pointers` is the number of fingers on the screen - a
     * second one during a gesture aborts it
     */
    down(kind: PointerKind, point: DragPoint, pointers = 1): void {
        if (this._state === 'dragging') {
            this.cancel();
            return;
        }

        this.reset();

        if (pointers !== 1) return;
        if (this.opts.enabled && !this.opts.enabled()) return;

        const token = ++this.token;
        this._state = 'pressing';
        this.kind = kind;
        this.start = { ...point };
        this.last = { ...point };

        if (kind === 'touch') {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                if (this._state !== 'pressing' || token !== this.token) return;

                if (this.target !== null) {
                    this.pickup(this.last);
                } else {
                    // The probe found nothing or was too slow - the press belongs to the map
                    this.reset();
                }
            }, this.opts.delay ?? LONG_PRESS_DELAY);
        }

        let answer: Promise<T | null | undefined>;
        try {
            answer = Promise.resolve(this.opts.probe({ ...point }, kind));
        } catch (err) {
            answer = Promise.reject(err);
        }

        answer.then((target) => {
            if (token !== this.token || this._state !== 'pressing' || !target) return;

            this.target = target;
            this.opts.onClaim?.(target, this.kind);
        }).catch((err: unknown) => {
            console.error('Failed to look up the object to move', err);
        });
    }

    move(point: DragPoint, pointers = 1): void {
        if (this._state === 'idle') return;

        if (pointers > 1) {
            if (this._state === 'dragging') this.cancel();
            else this.reset();
            return;
        }

        this.last = { ...point };

        if (this._state === 'dragging') {
            this.opts.onMove({ ...point });
            return;
        }

        const distance = Math.hypot(point.x - this.start.x, point.y - this.start.y);

        if (this.kind === 'touch') {
            // A pan of the map, not a long press
            if (distance > (this.opts.tolerance ?? LONG_PRESS_TOLERANCE)) this.reset();
        } else if (distance > (this.opts.threshold ?? MOUSE_DRAG_THRESHOLD)) {
            if (this.target === null) {
                // Not on a movable object (or not known yet) - the map pans
                this.reset();
                return;
            }

            // The mouse grabbed the object where the button went down
            this.pickup(this.start);
            if (this.dragging) this.opts.onMove({ ...point });
        }
    }

    /** Pointer up. True when it dropped an object - no click should follow */
    up(point?: DragPoint): boolean {
        if (this._state !== 'dragging') {
            this.reset();
            return false;
        }

        const at = point ? { ...point } : { ...this.last };
        this.finish(() => this.opts.onDrop(at));
        return true;
    }

    /** Abort: a dragged object goes back where it was */
    cancel(): void {
        if (this._state === 'dragging') {
            this.finish(() => this.opts.onCancel());
        } else {
            this.reset();
        }
    }

    private pickup(from: DragPoint): void {
        const target = this.target;
        if (target === null) return;

        this.clearTimer();
        this._state = 'dragging';
        this.opts.onPickup(target, { ...from }, this.kind);
    }

    private finish(end: () => void): void {
        this.clearTimer();
        this._state = 'idle';
        this.target = null;
        this.token++;

        try {
            end();
        } finally {
            this.opts.onRelease?.();
        }
    }

    private reset(): void {
        const wasClaimed = this.claimed;

        this.clearTimer();
        this._state = 'idle';
        this.target = null;
        this.token++;

        if (wasClaimed) this.opts.onRelease?.();
    }

    private clearTimer(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
    }
}

/** What canMoveCOT() needs to know about a CoT */
export interface MovableCandidate {
    id: string;
    is_self: boolean;
    is_skittle: boolean;
    is_editable: boolean;
    geometry: { type: string };
}

/** What canMoveCOT() needs to know about the Data Sync a CoT belongs to */
export interface MissionAccess {
    role?: { permissions?: string[] } | null;
}

export const MOVABLE_GEOMETRIES = ['Point', 'LineString', 'Polygon'];

/**
 * Whether the user may write to the Data Sync - the same check as
 * CoTView's `is_editable`: no subscription known means no restriction
 */
export function missionWritable(sub: MissionAccess | null | undefined): boolean {
    if (!sub) return true;
    return !!sub.role && Array.isArray(sub.role.permissions) && sub.role.permissions.includes('MISSION_WRITE');
}

/**
 * Objects that may be dragged: exactly those that offer "Edit Geometry"
 * (CoTView: `cot.is_editable` plus write access to their Data Sync), without
 * the user's own position and the other participants (the ring menu offers
 * no pencil for them either) and without the object the map is locked on.
 */
export function canMoveCOT(
    cot: MovableCandidate,
    opts: { mission?: MissionAccess | null; lockedOn?: string } = {}
): boolean {
    // Own GPS position and other participants' positions
    if (cot.is_self || cot.is_skittle) return false;
    // Machine generated or not archived (eg a Core Event, a received track)
    if (!cot.is_editable) return false;
    if (!missionWritable(opts.mission)) return false;
    // Lock On follows the object - moving it would move the map
    if (opts.lockedOn !== undefined && opts.lockedOn === cot.id) return false;

    return MOVABLE_GEOMETRIES.includes(cot.geometry.type);
}

/** Longitude/latitude offset in degrees */
export type Delta = [number, number];

/** Web Mercator's limit - beyond it the map has no place to drop to */
export const MAX_LATITUDE = 85.051129;

function eachPosition(geometry: Geometry, fn: (position: Position) => void): void {
    switch (geometry.type) {
        case 'Point':
            fn(geometry.coordinates);
            break;
        case 'MultiPoint':
        case 'LineString':
            geometry.coordinates.forEach(fn);
            break;
        case 'MultiLineString':
        case 'Polygon':
            geometry.coordinates.forEach((ring) => ring.forEach(fn));
            break;
        case 'MultiPolygon':
            geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(fn)));
            break;
        case 'GeometryCollection':
            geometry.geometries.forEach((child) => eachPosition(child, fn));
            break;
    }
}

function mapPositions(geometry: Geometry, fn: (position: Position) => Position): Geometry {
    switch (geometry.type) {
        case 'Point':
            return { ...geometry, coordinates: fn(geometry.coordinates) };
        case 'MultiPoint':
        case 'LineString':
            return { ...geometry, coordinates: geometry.coordinates.map(fn) } as Geometry;
        case 'MultiLineString':
        case 'Polygon':
            return { ...geometry, coordinates: geometry.coordinates.map((ring) => ring.map(fn)) } as Geometry;
        case 'MultiPolygon':
            return {
                ...geometry,
                coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(fn)))
            };
        case 'GeometryCollection':
            return { ...geometry, geometries: geometry.geometries.map((child) => mapPositions(child, fn)) };
    }
}

function firstPosition(geometry: Geometry): Position | undefined {
    let first: Position | undefined;
    eachPosition(geometry, (position) => {
        if (!first) first = position;
    });
    return first;
}

/**
 * The offset that is actually applied: the latitude is held so no vertex
 * leaves the map, and a whole turn of longitude is added or taken away so
 * the object stays within ±180° (it is shifted as one, never split)
 */
export function effectiveDelta(geometry: Geometry, delta: Delta): Delta {
    let minLat = Infinity;
    let maxLat = -Infinity;

    eachPosition(geometry, (position) => {
        minLat = Math.min(minLat, position[1]);
        maxLat = Math.max(maxLat, position[1]);
    });

    let dLat = delta[1];
    if (Number.isFinite(minLat)) {
        dLat = Math.min(Math.max(dLat, -MAX_LATITUDE - minLat), MAX_LATITUDE - maxLat);
    }

    let dLng = delta[0];
    const first = firstPosition(geometry);
    if (first) {
        const lng = first[0] + dLng;
        if (lng > 180 || lng < -180) dLng -= Math.round(lng / 360) * 360;
    }

    return [dLng, dLat];
}

/**
 * Shift every vertex by the same offset. The altitude is dropped: it belongs
 * to the old place (Edit Geometry drops it as well)
 */
export function translateGeometry<G extends Geometry>(geometry: G, delta: Delta): G {
    return mapPositions(geometry, (position) => [position[0] + delta[0], position[1] + delta[1]]) as G;
}

/**
 * The feature moved by `delta`: a copy with every coordinate shifted by the
 * same offset, its centre included (an ellipse is rebuilt around its centre)
 */
export function translateFeature(feature: Feature, delta: Delta): Feature {
    const applied = effectiveDelta(feature.geometry as Geometry, delta);
    const moved = JSON.parse(JSON.stringify(feature)) as Feature;

    moved.geometry = translateGeometry(feature.geometry as Geometry, applied) as Feature['geometry'];

    const center = feature.properties.center;
    if (Array.isArray(center) && center.length >= 2 && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        moved.properties.center = [center[0] + applied[0], center[1] + applied[1]];
    }

    return moved;
}

/** Offset between two map positions */
export function lngLatDelta(
    from: { lng: number; lat: number },
    to: { lng: number; lat: number }
): Delta {
    return [to.lng - from.lng, to.lat - from.lat];
}

type SizeValue = number | unknown[];

/**
 * A size property (icon-size, circle-radius …) times `factor`, for the
 * picked-up look. Zoom curves keep their curve with every output scaled,
 * since MapLibre only accepts ["zoom"] in a top-level interpolate or step;
 * anything else it cannot scale safely is returned unchanged
 */
export function scaleSize(value: unknown, factor: number): SizeValue | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value * factor;
    if (!Array.isArray(value)) return undefined;

    const op = value[0];
    const scale = (out: unknown): unknown => (typeof out === 'number' ? out * factor : ['*', factor, out]);

    if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
        // [op, interpolation, input, stop, output, stop, output, …]
        return value.map((part, i) => (i >= 4 && i % 2 === 0 ? scale(part) : part));
    }

    if (op === 'step') {
        // ["step", input, output0, stop, output, …]
        return value.map((part, i) => (i >= 2 && i % 2 === 0 ? scale(part) : part));
    }

    if (JSON.stringify(value).includes('"zoom"')) return value;
    return ['*', factor, value];
}
