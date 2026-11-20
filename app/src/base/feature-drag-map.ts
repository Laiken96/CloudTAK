/**
 * Drag objects on the map (see feature-drag.ts for the gesture and the rule
 * which objects may be moved).
 *
 * While an object is dragged nothing is written: the original is hidden with
 * a layer filter and a copy is drawn in a preview source with the same
 * layers, slightly enlarged. Dropping saves once, the same way as saving after
 * Edit Geometry, so Data Sync and the TAK Server get the new position; a
 * failed save puts the object back. A few seconds after the drop the move can
 * be undone (FeatureDragStatus.vue).
 */
import { reactive } from 'vue';
import type {
    FilterSpecification,
    GeoJSONSource,
    LayerSpecification,
    LngLat,
    Map as MapLibreMap,
    MapGeoJSONFeature,
} from 'maplibre-gl';
import type { Feature as GeoJSONFeature, FeatureCollection, Geometry } from 'geojson';
import COT, { OriginMode } from './cot.ts';
import { DERIVED_SENSOR } from './cot/derived.ts';
import { renderMissionFeature } from './subscription-feature.ts';
import Subscription from './subscription.ts';
import { isSignatureArmed } from './signature-placement.ts';
import { tour } from '../tutorial/tour.ts';
import { tr } from '../i18n/index.ts';
import {
    DragGesture,
    canMoveCOT,
    effectiveDelta,
    lngLatDelta,
    scaleSize,
    translateFeature,
    translateGeometry,
    type Delta,
    type DragPoint,
    type PointerKind,
} from './feature-drag.ts';
import type { Feature } from '../types.ts';

export const PREVIEW_SOURCE = 'feature-drag-preview';
export const PREVIEW_PREFIX = 'feature-drag-preview-';

/** How far around the finger / the mouse an object is found */
export const TOUCH_RADIUS = 12;
export const MOUSE_RADIUS = 4;
/** A drop closer than this to where it was picked up is no move */
export const MIN_MOVE_PIXELS = 2;
/** How long Undo is offered after a drop */
export const UNDO_WINDOW = 8000;
/** Longest wait for the map to draw the saved position before the preview goes */
export const SETTLE_TIMEOUT = 600;
/** Mouse events this soon after a touch are the browser's emulation of it */
const GHOST_MOUSE = 1000;
/** The picked-up object is drawn this much bigger */
const LIFT = 1.25;
const HALO_COLOR = '#1E90FF';

export interface DragSubject {
    id: string;
    /** Name for the status line */
    label: string;
    /** The object as stored - saved again by Undo */
    feature: Feature;
}

interface DragTarget {
    subject: DragSubject;
    /** Map source the object is drawn from */
    source: string;
}

export interface FeatureDragOptions {
    /** Extra condition, eg only while no drawing tool is active */
    allowed?: () => boolean;
    /** Map layers whose features are CoTs - only these can be picked up */
    layers: () => string[];
    /** The object with this id when it may be moved, otherwise undefined */
    resolve: (id: string) => Promise<DragSubject | undefined>;
    /** Persist the moved object - the same path as saving after Edit Geometry */
    save: (feature: Feature) => Promise<void>;
    /** Features drawn for the object in its source (rendered and derived) */
    render?: (feature: Feature, source: string) => GeoJSONFeature[];
    /** Called when an object is picked up, eg to close an open ring menu */
    onPickup?: () => void;
}

export interface FeatureDrag {
    /** The current gesture is on a movable object - the map's long press stays out */
    claimed: () => boolean;
    detach: () => void;
}

export type FeatureDragPhase = 'idle' | 'dragging' | 'saving' | 'moved' | 'undoing' | 'error';

/** State of the status line - FeatureDragStatus.vue */
export const featureDragStatus = reactive<{
    phase: FeatureDragPhase;
    label: string;
    kind: PointerKind;
    message: string;
    /** End of the Undo window (ms) */
    until: number;
}>({
    phase: 'idle',
    label: '',
    kind: 'touch',
    message: '',
    until: 0,
});

interface LastMove {
    subject: DragSubject;
    save: (feature: Feature) => Promise<void>;
}

let lastMove: LastMove | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
/** A save or undo is running - no new drag until it is done */
let busy = false;

function clearStatusTimer(): void {
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = undefined;
}

function setStatus(phase: FeatureDragPhase, fields: Partial<typeof featureDragStatus> = {}): void {
    clearStatusTimer();
    Object.assign(featureDragStatus, { message: '', until: 0 }, fields, { phase });
}

/** Hide the status line; an offered Undo is gone with it */
export function dismissFeatureMoveStatus(): void {
    clearStatusTimer();
    lastMove = undefined;
    setStatus('idle', { label: '' });
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Put the last moved object back where it was */
export async function undoFeatureMove(): Promise<void> {
    const move = lastMove;
    if (!move || busy) return;

    lastMove = undefined;
    busy = true;
    setStatus('undoing', { label: move.subject.label });

    try {
        await move.save(JSON.parse(JSON.stringify(move.subject.feature)) as Feature);
        setStatus('idle', { label: '' });
    } catch (err) {
        console.error('Failed to undo the move', err);
        setStatus('error', {
            label: move.subject.label,
            message: tr('Could not undo the move: {message}', { message: errorText(err) }),
        });
    } finally {
        busy = false;
    }
}

/** For tests: forget the status and the offered Undo */
export function resetFeatureDragStatus(): void {
    lastMove = undefined;
    busy = false;
    setStatus('idle', { label: '' });
}

/** The features of an object as its source draws them */
export function renderForSource(feature: Feature, source: string): GeoJSONFeature[] {
    if (source === '-1') {
        return [COT.as_rendered(feature), ...COT.as_derived(feature)] as GeoJSONFeature[];
    }

    // Data Sync overlays draw the stored feature with its icon
    return [renderMissionFeature(feature) as unknown as GeoJSONFeature];
}

type DragMap = Pick<MapLibreMap,
    | 'getCanvas'
    | 'getCanvasContainer'
    | 'getContainer'
    | 'unproject'
    | 'project'
    | 'queryRenderedFeatures'
    | 'getLayer'
    | 'getLayersOrder'
    | 'getFilter'
    | 'setFilter'
    | 'addLayer'
    | 'removeLayer'
    | 'getSource'
    | 'addSource'
    | 'removeSource'
    | 'once'
    | 'off'
    | 'triggerRepaint'
    | 'dragPan'
>;

interface Session {
    target: DragTarget;
    kind: PointerKind;
    from: LngLat;
    fromPoint: DragPoint;
    point: DragPoint;
    base: GeoJSONFeature[];
    delta: Delta;
    hidden: Array<{ layer: string; before: FilterSpecification | undefined; set: FilterSpecification }>;
    layers: string[];
    frame?: number;
}

function sameFilter(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Make objects on the map draggable. Detaches itself when the map is removed
 */
export function attachFeatureDrag(map: DragMap, opts: FeatureDragOptions): FeatureDrag {
    const canvasContainer = map.getCanvasContainer();
    const canvas = map.getCanvas();
    const container = map.getContainer();
    const render = opts.render ?? renderForSource;

    let session: Session | undefined;
    let lastTouch = Number.NEGATIVE_INFINITY;
    let panHeld = false;
    let panWasEnabled = false;
    let cursorBefore: string | undefined;

    // No text selection or callout from a long press in iOS Safari - on the
    // canvas only, text in popups over the map stays selectable
    canvas.style.setProperty('-webkit-touch-callout', 'none');
    canvas.style.setProperty('-webkit-user-select', 'none');
    canvas.style.setProperty('user-select', 'none');

    function holdMap(): void {
        if (panHeld) return;
        panHeld = true;
        panWasEnabled = map.dragPan.isEnabled();
        if (panWasEnabled) map.dragPan.disable();
    }

    function releaseMap(): void {
        if (!panHeld) return;
        panHeld = false;
        if (panWasEnabled) map.dragPan.enable();
    }

    function setCursor(cursor: string): void {
        if (cursorBefore === undefined) cursorBefore = canvas.style.cursor;
        canvas.style.cursor = cursor;
    }

    function restoreCursor(): void {
        if (cursorBefore === undefined) return;
        canvas.style.cursor = cursorBefore;
        cursorBefore = undefined;
    }

    function local(clientX: number, clientY: number): DragPoint {
        const rect = canvasContainer.getBoundingClientRect();
        return {
            x: clientX - rect.left - canvasContainer.clientLeft,
            y: clientY - rect.top - canvasContainer.clientTop,
        };
    }

    /** Dragging past the edge drops at the edge */
    function clamp(point: DragPoint): DragPoint {
        const width = canvasContainer.clientWidth;
        const height = canvasContainer.clientHeight;
        return {
            x: width > 0 ? Math.min(Math.max(point.x, 0), width) : point.x,
            y: height > 0 ? Math.min(Math.max(point.y, 0), height) : point.y,
        };
    }

    async function probe(point: DragPoint, kind: PointerKind): Promise<DragTarget | null> {
        const layers = opts.layers().filter((id) => map.getLayer(id));
        if (!layers.length) return null;

        const r = kind === 'touch' ? TOUCH_RADIUS : MOUSE_RADIUS;
        const hits = map.queryRenderedFeatures([[point.x - r, point.y - r], [point.x + r, point.y + r]], { layers });

        // The topmost object - not by the inside of an area or a sensor cone,
        // a long press there still opens the map's menu
        const hit = hits.find((feat: MapGeoJSONFeature) => {
            return feat.layer.type !== 'fill' && feat.properties && feat.properties.derived !== DERIVED_SENSOR;
        });
        if (!hit) return null;

        // As the map's click: the CoT id is a property, vector ids are numbers
        const id = hit.properties.id || hit.id;
        if (id === undefined || id === null || id === '') return null;

        const subject = await opts.resolve(String(id));
        if (!subject) return null;

        return { subject, source: String(hit.source) };
    }

    function hideOriginal(target: DragTarget): Session['hidden'] {
        const hidden: Session['hidden'] = [];
        const predicate: FilterSpecification = ['!=', ['get', 'id'], target.subject.id];

        for (const layer of map.getLayersOrder()) {
            if (layer.startsWith(PREVIEW_PREFIX)) continue;
            const style = map.getLayer(layer);
            if (!style || style.source !== target.source) continue;

            const before = map.getFilter(layer) ?? undefined;
            const set = (before ? ['all', before, predicate] : predicate) as FilterSpecification;

            try {
                map.setFilter(layer, set);
                hidden.push({ layer, before, set });
            } catch (err) {
                console.error(`Failed to hide the moved object in layer ${layer}`, err);
            }
        }

        return hidden;
    }

    function showOriginal(hidden: Session['hidden']): void {
        for (const { layer, before, set } of hidden) {
            if (!map.getLayer(layer)) continue;
            // Someone else set the filter meanwhile (eg feature visibility) - theirs stays
            if (!sameFilter(map.getFilter(layer), set)) continue;

            try {
                map.setFilter(layer, before ?? null);
            } catch (err) {
                console.error(`Failed to show the moved object in layer ${layer}`, err);
            }
        }
    }

    function previewLayers(target: DragTarget): LayerSpecification[] {
        const layers: LayerSpecification[] = [
            {
                id: `${PREVIEW_PREFIX}halo-line`,
                type: 'line',
                source: PREVIEW_SOURCE,
                filter: ['all', ['!', ['has', 'derived']], ['!=', ['geometry-type'], 'Point']],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': HALO_COLOR, 'line-width': 12, 'line-opacity': 0.35, 'line-blur': 2 },
            },
            {
                id: `${PREVIEW_PREFIX}halo-point`,
                type: 'circle',
                source: PREVIEW_SOURCE,
                filter: ['all', ['!', ['has', 'derived']], ['==', ['geometry-type'], 'Point']],
                paint: {
                    'circle-radius': 26,
                    'circle-color': HALO_COLOR,
                    'circle-opacity': 0.18,
                    'circle-stroke-color': HALO_COLOR,
                    'circle-stroke-width': 2,
                    'circle-stroke-opacity': 0.8,
                },
            },
        ];

        for (const layer of map.getLayersOrder()) {
            if (layer.startsWith(PREVIEW_PREFIX)) continue;
            const style = map.getLayer(layer);
            if (!style || style.source !== target.source) continue;

            // A plain copy: the layer spec as JSON, edited below without its union types
            const spec = JSON.parse(JSON.stringify(style.serialize())) as {
                id: string;
                type: string;
                source: string;
                'source-layer'?: string;
                layout?: Record<string, unknown>;
                paint?: Record<string, unknown>;
            };

            spec.id = `${PREVIEW_PREFIX}${layer}`;
            spec.source = PREVIEW_SOURCE;
            delete spec['source-layer'];

            if (spec.type === 'symbol') {
                spec.layout = spec.layout ?? {};
                const size = scaleSize(spec.layout['icon-size'] ?? 1, LIFT);
                if (size !== undefined) spec.layout['icon-size'] = size;
            } else if (spec.type === 'circle') {
                spec.paint = spec.paint ?? {};
                const radius = scaleSize(spec.paint['circle-radius'] ?? 5, LIFT);
                if (radius !== undefined) spec.paint['circle-radius'] = radius;
            }

            layers.push(spec as unknown as LayerSpecification);
        }

        return layers;
    }

    function previewData(s: Session): FeatureCollection {
        return {
            type: 'FeatureCollection',
            features: s.base.map((feat) => ({
                ...feat,
                geometry: translateGeometry(feat.geometry as Geometry, s.delta),
            })),
        };
    }

    function showPreview(s: Session): void {
        map.addSource(PREVIEW_SOURCE, { type: 'geojson', data: previewData(s) });

        for (const spec of previewLayers(s.target)) {
            try {
                map.addLayer(spec);
                s.layers.push(spec.id);
            } catch (err) {
                console.error(`Failed to add the preview layer ${spec.id}`, err);
            }
        }
    }

    function updatePreview(s: Session): void {
        if (s.frame !== undefined) return;

        s.frame = requestAnimationFrame(() => {
            s.frame = undefined;
            const source = map.getSource(PREVIEW_SOURCE) as GeoJSONSource | undefined;
            if (source && session === s) source.setData(previewData(s));
        });
    }

    function removePreview(s: Session): void {
        if (s.frame !== undefined) cancelAnimationFrame(s.frame);
        s.frame = undefined;

        for (const layer of s.layers) {
            if (map.getLayer(layer)) map.removeLayer(layer);
        }
        s.layers = [];

        if (map.getSource(PREVIEW_SOURCE)) map.removeSource(PREVIEW_SOURCE);
    }

    /** Wait until the map drew the saved position, so the original does not flash at the old one */
    function settled(): Promise<void> {
        return new Promise((resolve) => {
            const done = (): void => {
                clearTimeout(timer);
                map.off('idle', done);
                resolve();
            };
            const timer = setTimeout(done, SETTLE_TIMEOUT);
            map.once('idle', done);
            map.triggerRepaint();
        });
    }

    function end(s: Session): void {
        removePreview(s);
        showOriginal(s.hidden);
        if (session === s) session = undefined;
    }

    function track(s: Session, point: DragPoint): void {
        s.point = clamp(point);
        const to = map.unproject([s.point.x, s.point.y]);
        s.delta = effectiveDelta(s.target.subject.feature.geometry as Geometry, lngLatDelta(s.from, to));
    }

    function pickup(target: DragTarget, from: DragPoint, kind: PointerKind): void {
        holdMap();
        setCursor('grabbing');

        const s: Session = {
            target,
            kind,
            from: map.unproject([from.x, from.y]),
            fromPoint: { ...from },
            point: { ...from },
            base: [],
            delta: [0, 0],
            hidden: [],
            layers: [],
        };

        try {
            s.base = render(target.subject.feature, target.source);
            showPreview(s);
            s.hidden = hideOriginal(target);
        } catch (err) {
            console.error('Failed to pick up the object', err);
            removePreview(s);
            showOriginal(s.hidden);
            gesture.cancel();
            return;
        }

        session = s;
        lastMove = undefined;
        setStatus('dragging', { label: target.subject.label, kind });

        // A short buzz where the browser can (not iOS Safari)
        if (kind === 'touch' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(20); } catch { /* not allowed - fine */ }
        }

        opts.onPickup?.();
    }

    function cancelDrag(): void {
        const s = session;
        if (!s) return;

        end(s);
        setStatus('idle', { label: '' });
    }

    async function drop(point: DragPoint): Promise<void> {
        const s = session;
        if (!s) return;

        track(s, point);

        const moved = Math.hypot(s.point.x - s.fromPoint.x, s.point.y - s.fromPoint.y);
        if (moved < MIN_MOVE_PIXELS) {
            cancelDrag();
            return;
        }

        const subject = s.target.subject;
        const feature = translateFeature(subject.feature, s.delta);

        // The preview stays at the drop while the save runs
        const source = map.getSource(PREVIEW_SOURCE) as GeoJSONSource | undefined;
        if (s.frame !== undefined) cancelAnimationFrame(s.frame);
        s.frame = undefined;
        source?.setData(previewData(s));

        busy = true;
        setStatus('saving', { label: subject.label });

        try {
            await opts.save(feature);

            await settled();
            end(s);

            lastMove = { subject, save: opts.save };
            setStatus('moved', { label: subject.label, until: Date.now() + UNDO_WINDOW });
            statusTimer = setTimeout(() => {
                statusTimer = undefined;
                lastMove = undefined;
                setStatus('idle', { label: '' });
            }, UNDO_WINDOW);
        } catch (err) {
            console.error('Failed to save the moved object', err);

            // A half-applied save would leave the object at the new place
            try {
                await opts.save(JSON.parse(JSON.stringify(subject.feature)) as Feature);
            } catch (revertErr) {
                console.error('Failed to put the object back', revertErr);
            }

            end(s);
            setStatus('error', {
                label: subject.label,
                message: tr('Could not move the object: {message}', { message: errorText(err) }),
            });
        } finally {
            busy = false;
        }
    }

    const gesture = new DragGesture<DragTarget>({
        enabled: () => !busy
            && !session
            && !isSignatureArmed()
            && !tour.state.active
            && (opts.allowed ? opts.allowed() : true),
        probe,
        onClaim: (_target, kind) => {
            // A touch may still pan the map until the object is picked up.
            // A mouse drags the object: the map holds still from here on (a
            // mouse that moved past the threshold first has panned the map
            // and never gets here)
            if (kind !== 'mouse') return;

            holdMap();
            setCursor('grab');
        },
        onPickup: pickup,
        onMove: (point) => {
            if (!session) return;
            track(session, point);
            updatePreview(session);
        },
        onDrop: (point) => {
            void drop(point);
        },
        onCancel: cancelDrag,
        onRelease: () => {
            releaseMap();
            restoreCursor();
        },
    });

    function onTouchStart(event: TouchEvent): void {
        lastTouch = Date.now();

        if (gesture.state !== 'idle') {
            // A second finger: pinch, not drag
            if (event.touches.length > 1) gesture.down('touch', { x: 0, y: 0 }, event.touches.length);
            return;
        }

        if (event.target !== canvas || event.touches.length !== 1) return;

        const touch = event.touches[0];
        gesture.down('touch', local(touch.clientX, touch.clientY), 1);
    }

    function onTouchMove(event: TouchEvent): void {
        if (gesture.state === 'idle') return;

        const touch = event.touches[0];
        if (!touch) return;

        gesture.move(local(touch.clientX, touch.clientY), event.touches.length);

        // The map and the page stay put under the dragged object
        if (gesture.dragging && event.cancelable) event.preventDefault();
    }

    function onTouchEnd(event: TouchEvent): void {
        lastTouch = Date.now();
        if (gesture.state === 'idle') return;

        // Another finger is still down - only the last one lifting ends it
        if (event.touches.length > 0) return;

        const touch = event.changedTouches[0];
        const dropped = gesture.up(touch ? local(touch.clientX, touch.clientY) : undefined);

        // No click on whatever lies under the dropped object
        if (dropped && event.cancelable) event.preventDefault();
    }

    function onTouchCancel(): void {
        lastTouch = Date.now();
        gesture.cancel();
    }

    function onMouseDown(event: MouseEvent): void {
        if (Date.now() - lastTouch < GHOST_MOUSE) return;
        if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
        if (event.target !== canvas) return;

        gesture.down('mouse', local(event.clientX, event.clientY), 1);
    }

    function onMouseMove(event: MouseEvent): void {
        if (gesture.state === 'idle') return;

        gesture.move(local(event.clientX, event.clientY), 1);
        if (gesture.dragging) event.preventDefault();
    }

    function onMouseUp(event: MouseEvent): void {
        if (gesture.state === 'idle') return;
        gesture.up(local(event.clientX, event.clientY));
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && gesture.state !== 'idle') gesture.cancel();
    }

    function onBlur(): void {
        gesture.cancel();
    }

    /** No context menu over an object being picked up (Android's own long press, a right click) */
    function onContextMenu(event: Event): void {
        if (!gesture.claimed) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    const doc = canvasContainer.ownerDocument;
    const win = doc.defaultView;

    canvasContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    canvasContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    canvasContainer.addEventListener('touchend', onTouchEnd, { passive: false });
    canvasContainer.addEventListener('touchcancel', onTouchCancel, { passive: true });
    canvasContainer.addEventListener('mousedown', onMouseDown);
    doc.addEventListener('mousemove', onMouseMove);
    doc.addEventListener('mouseup', onMouseUp);
    doc.addEventListener('keydown', onKeyDown);
    win?.addEventListener('blur', onBlur);
    // Capture: before the map's own contextmenu listeners further in
    container.addEventListener('contextmenu', onContextMenu, true);

    let detached = false;
    function detach(): void {
        if (detached) return;
        detached = true;

        gesture.cancel();
        if (session) end(session);

        canvasContainer.removeEventListener('touchstart', onTouchStart);
        canvasContainer.removeEventListener('touchmove', onTouchMove);
        canvasContainer.removeEventListener('touchend', onTouchEnd);
        canvasContainer.removeEventListener('touchcancel', onTouchCancel);
        canvasContainer.removeEventListener('mousedown', onMouseDown);
        doc.removeEventListener('mousemove', onMouseMove);
        doc.removeEventListener('mouseup', onMouseUp);
        doc.removeEventListener('keydown', onKeyDown);
        win?.removeEventListener('blur', onBlur);
        container.removeEventListener('contextmenu', onContextMenu, true);
    }

    map.once('remove', detach);

    return {
        claimed: () => gesture.claimed,
        detach,
    };
}

/** What attachMapFeatureDrag() uses of the map store */
export interface FeatureDragStore {
    worker: {
        db: {
            get(id: string, opts: { mission: boolean }): Promise<COT | undefined>;
            add(feature: Feature, opts: { authored: boolean }): Promise<unknown>;
        };
    };
    refresh(): Promise<void>;
    locked: string[];
    radial: { mode?: string; cot?: unknown };
}

/**
 * The map store's side: which layers hold CoTs, which objects may be moved
 * and how a move is saved
 */
export function storeFeatureDragOptions(
    store: FeatureDragStore,
    layers: () => string[],
    allowed: () => boolean
): FeatureDragOptions {
    return {
        allowed,
        layers,
        resolve: async (id) => {
            const cot = await store.worker.db.get(id, { mission: true });
            if (!cot) return undefined;

            let mission: Subscription | undefined;
            if (cot.origin.mode === OriginMode.MISSION && cot.origin.mode_id) {
                mission = await Subscription.from(cot.origin.mode_id);
            }

            if (!canMoveCOT(cot, { mission, lockedOn: store.locked[store.locked.length - 1] })) return undefined;

            return {
                id: cot.id,
                label: String(cot.properties.callsign || ''),
                feature: cot.as_feature({ clone: true }),
            };
        },
        // As the save after Edit Geometry (stores/modules/draw.ts, 'deselect')
        save: async (feature) => {
            await store.worker.db.add(feature, { authored: true });
            await store.refresh();
        },
        onPickup: () => {
            // The ring menu would stay behind at the old place
            store.radial.mode = undefined;
            store.radial.cot = undefined;
        },
    };
}
