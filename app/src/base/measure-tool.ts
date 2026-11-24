/**
 * Measure Distance (Drawing Tools): tap the map to set point A, then B, then
 * more points for a path of several segments. Every segment shows its length
 * on the map, MeasurePanel.vue the total and the bearing of the last segment.
 *
 * - A tap within SNAP_RADIUS of a point object (signature, own position)
 *   snaps the point onto it, e.g. own position to target
 * - A point is moved by dragging it (touch and mouse); it snaps while dragged
 * - The measurement is temporary: it lives here and in its own map source,
 *   is never stored, never sent and is gone when the tool is closed
 * - While the tool is attached, map taps belong to it alone: the map store
 *   asks isMeasuring() before opening objects, ring menus, the long press
 *   menu or picking up an object to move it
 */
import { reactive, watch } from 'vue';
import type {
    GeoJSONSource,
    LayerSpecification,
    Map as MapLibreMap,
    MapGeoJSONFeature,
    MapMouseEvent,
    MapTouchEvent,
    PointLike,
} from 'maplibre-gl';
import { measureGeoJSON, type LngLat } from '../utils/measure.ts';

export const MEASURE_SOURCE = 'cloudtak-measure';

/** Layers bottom to top */
export const MEASURE_LAYERS = [
    'cloudtak-measure-casing',
    'cloudtak-measure-line',
    'cloudtak-measure-point',
    'cloudtak-measure-label',
];

/** Class on the map container while measuring - lets taps through DOM markers (own position) */
export const MEASURING_CLASS = 'cloudtak-measuring';

/** A tap this close (px) to a point object snaps onto it */
export const SNAP_RADIUS = 20;
/** A touch this close (px) to a measure point drags it */
export const HANDLE_RADIUS = 22;
/** Movement (px) before a pressed point starts to follow */
const DRAG_THRESHOLD = 3;
/** The click the browser fires after a drag is not a new point */
const CLICK_AFTER_DRAG = 400;

const LINE_COLOR = '#ffcc00';
const SNAP_COLOR = '#1E90FF';

export interface MeasureSnap {
    kind: 'own' | 'object';
    /** Name of the object, shown in the panel */
    label: string;
    /** Object id, to look up its exact position */
    id?: string;
}

export interface MeasurePoint {
    /** Stays with the point while it is moved */
    key: number;
    coord: LngLat;
    snap?: MeasureSnap;
}

export const measureState = reactive<{ active: boolean; points: MeasurePoint[] }>({
    active: false,
    points: [],
});

let nextKey = 1;
let attached = 0;

/** True while map taps belong to the measure tool */
export function isMeasuring(): boolean {
    return measureState.active && attached > 0;
}

export function startMeasure(): void {
    measureState.active = true;
}

/** Close the tool - the measurement is gone */
export function stopMeasure(): void {
    measureState.active = false;
    measureState.points = [];
}

/** Start again with no point, the tool stays open */
export function clearMeasure(): void {
    measureState.points = [];
}

export function undoMeasurePoint(): void {
    measureState.points = measureState.points.slice(0, -1);
}

export function addMeasurePoint(coord: LngLat, snap?: MeasureSnap): MeasurePoint {
    const point: MeasurePoint = { key: nextKey++, coord: [coord[0], coord[1]], snap };
    measureState.points.push(point);

    // The reactive proxy, so later changes through it are seen
    return measureState.points[measureState.points.length - 1];
}

export function moveMeasurePoint(key: number, coord: LngLat, snap?: MeasureSnap): void {
    const point = measureState.points.find((p) => p.key === key);
    if (!point) return;

    point.coord = [coord[0], coord[1]];
    point.snap = snap;
}

export interface ScreenPoint {
    x: number;
    y: number;
}

export interface SnapCandidate {
    coord: LngLat;
    /** Where it is on the screen */
    point: ScreenPoint;
    snap: MeasureSnap;
    /** The tap hit its symbol - wins over the distance to its anchor */
    direct?: boolean;
}

function pixels(a: ScreenPoint, b: ScreenPoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The candidate a tap snaps to: one whose symbol was hit, else the nearest
 * within the radius, else none
 */
export function nearestSnap(tap: ScreenPoint, candidates: SnapCandidate[], radius = SNAP_RADIUS): SnapCandidate | undefined {
    let best: SnapCandidate | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const d = pixels(tap, candidate.point);
        if (!candidate.direct && d > radius) continue;

        // A hit symbol always beats one that is only near
        const score = candidate.direct ? d - 1e6 : d;
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return best;
}

/** Index of the measure point under the finger, -1 for none */
export function vertexAt(tap: ScreenPoint, points: ScreenPoint[], radius = HANDLE_RADIUS): number {
    let best = -1;
    let bestDistance = radius;

    points.forEach((point, index) => {
        const d = pixels(tap, point);
        // Later points win a tie: they lie on top
        if (d <= bestDistance) {
            best = index;
            bestDistance = d;
        }
    });

    return best;
}

export interface MeasureHost {
    /** Map layers whose point objects can be snapped to; `type` 'cot' for map objects */
    snapLayers(): Array<{ id: string; type: string }>;
    /** Own position when known */
    ownPosition(): LngLat | undefined;
    /** Exact position of a map object - the drawn one is rounded to the tile grid */
    resolve?(id: string): Promise<LngLat | undefined>;
}

type MeasureMap = Pick<MapLibreMap,
    'on' | 'off' | 'once' | 'getSource' | 'addSource' | 'removeSource' | 'getLayer' | 'addLayer'
    | 'removeLayer' | 'moveLayer' | 'getLayersOrder' | 'getStyle' | 'project' | 'unproject'
    | 'queryRenderedFeatures' | 'getContainer' | 'getCanvas' | 'doubleClickZoom'
>;

function layers(): LayerSpecification[] {
    return [{
        id: 'cloudtak-measure-casing',
        type: 'line',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#000000', 'line-opacity': 0.6, 'line-width': 6 },
    }, {
        id: 'cloudtak-measure-line',
        type: 'line',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LINE_COLOR, 'line-width': 3 },
    }, {
        id: 'cloudtak-measure-point',
        type: 'circle',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'vertex'],
        paint: {
            // A snapped point is a ring, the object it sits on stays visible
            'circle-radius': ['case', ['get', 'snapped'], 11, 7],
            'circle-color': LINE_COLOR,
            'circle-opacity': ['case', ['get', 'snapped'], 0, 1],
            'circle-stroke-color': ['case', ['get', 'snapped'], SNAP_COLOR, '#000000'],
            'circle-stroke-width': ['case', ['get', 'snapped'], 3, 2],
        },
    }, {
        id: 'cloudtak-measure-label',
        type: 'symbol',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'label'],
        layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Bold'],
            'text-size': 14,
            'text-anchor': 'bottom',
            'text-offset': [0, -0.4],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0, 0, 0, 0.9)',
            'text-halo-width': 2,
        },
    }];
}

interface Drag {
    key: number;
    start: ScreenPoint;
    moved: boolean;
    kind: 'touch' | 'mouse';
    /** Latest position, applied on the next frame */
    pending?: { coord: LngLat; snap?: MeasureSnap };
}

/**
 * Attach the tool to the map: source and layers, taps, dragging. Returns the
 * function that detaches it again and removes everything from the map.
 */
export function attachMeasureTool(map: MeasureMap, host: MeasureHost): () => void {
    attached += 1;

    const container = map.getContainer();
    const canvas = map.getCanvas();
    const doc = container.ownerDocument;

    let drag: Drag | null = null;
    let frame: number | null = null;
    let clickBlockedUntil = 0;
    let detached = false;

    function styleReady(): boolean {
        try {
            return Boolean(map.getStyle());
        } catch {
            return false;
        }
    }

    function render(): void {
        if (detached || !styleReady()) return;

        const source = map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined;
        if (!source) return;

        source.setData(measureGeoJSON(measureState.points.map((p) => ({ coord: p.coord, snapped: Boolean(p.snap) }))));
    }

    /** Source and layers there and on top - after a style reload or a layer added above */
    function ensureLayers(): void {
        if (detached || !styleReady()) return;

        let added = false;
        if (!map.getSource(MEASURE_SOURCE)) {
            map.addSource(MEASURE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            added = true;
        }

        for (const layer of layers()) {
            if (!map.getLayer(layer.id)) {
                map.addLayer(layer);
                added = true;
            }
        }

        const order = map.getLayersOrder();
        const top = order.slice(-MEASURE_LAYERS.length);
        if (top.length !== MEASURE_LAYERS.length || top.some((id, i) => id !== MEASURE_LAYERS[i])) {
            for (const id of MEASURE_LAYERS) map.moveLayer(id);
        }

        if (added) render();
    }

    function removeLayers(): void {
        if (!styleReady()) return;

        for (const id of [...MEASURE_LAYERS].reverse()) {
            if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(MEASURE_SOURCE)) map.removeSource(MEASURE_SOURCE);
    }

    function lngLatAt(point: ScreenPoint): LngLat {
        const lngLat = map.unproject([point.x, point.y]).wrap();
        return [lngLat.lng, lngLat.lat];
    }

    function screen(coord: LngLat): ScreenPoint {
        const p = map.project(coord);
        return { x: p.x, y: p.y };
    }

    function snapCandidates(features: MapGeoJSONFeature[], cotLayers: Set<string>, direct: boolean): SnapCandidate[] {
        const result: SnapCandidate[] = [];

        for (const feat of features) {
            if (feat.geometry.type !== 'Point') continue;

            const [lng, lat] = feat.geometry.coordinates;
            const id = feat.properties?.id ?? feat.id;
            const callsign = feat.properties?.callsign;

            result.push({
                coord: [lng, lat],
                point: screen([lng, lat]),
                direct,
                snap: {
                    kind: 'object',
                    label: typeof callsign === 'string' ? callsign : '',
                    id: cotLayers.has(feat.layer.id) && id !== undefined ? String(id) : undefined,
                },
            });
        }

        return result;
    }

    /** Point object or own position near the screen point */
    function findSnap(point: ScreenPoint): SnapCandidate | undefined {
        const candidates: SnapCandidate[] = [];

        const snapLayers = host.snapLayers().filter((layer) => map.getLayer(layer.id));
        if (snapLayers.length) {
            const ids = snapLayers.map((layer) => layer.id);
            const cotLayers = new Set(snapLayers.filter((layer) => layer.type === 'cot').map((layer) => layer.id));

            const box: [PointLike, PointLike] = [
                [point.x - SNAP_RADIUS, point.y - SNAP_RADIUS],
                [point.x + SNAP_RADIUS, point.y + SNAP_RADIUS],
            ];

            candidates.push(...snapCandidates(map.queryRenderedFeatures([point.x, point.y], { layers: ids }), cotLayers, true));
            candidates.push(...snapCandidates(map.queryRenderedFeatures(box, { layers: ids }), cotLayers, false));
        }

        const own = host.ownPosition();
        if (own) {
            candidates.push({ coord: own, point: screen(own), snap: { kind: 'own', label: '' } });
        }

        return nearestSnap(point, candidates);
    }

    /** Replace the rounded drawn position of a snapped object by the stored one */
    function refine(point: MeasurePoint): void {
        const id = point.snap?.id;
        if (!id || !host.resolve) return;

        const { key } = point;
        host.resolve(id).then((exact) => {
            if (!exact || detached) return;

            const current = measureState.points.find((p) => p.key === key);
            // Moved or snapped elsewhere since
            if (!current || current.snap?.id !== id) return;

            current.coord = [exact[0], exact[1]];
        }).catch((err: unknown) => {
            console.error('Measure: cannot look up the snapped object', err);
        });
    }

    function hitVertex(point: ScreenPoint): number {
        return vertexAt(point, measureState.points.map((p) => screen(p.coord)));
    }

    function holdDoubleTapZoom(): void {
        // Two quick taps are two points, not a zoom
        if (map.doubleClickZoom.isEnabled()) map.doubleClickZoom.disable();
    }

    function onClick(e: MapMouseEvent): void {
        if (drag || Date.now() < clickBlockedUntil) return;

        const tap = { x: e.point.x, y: e.point.y };
        // A tap on a measure point grabs it, it sets no new one
        if (hitVertex(tap) >= 0) return;

        const snap = findSnap(tap);
        const point = addMeasurePoint(snap ? snap.coord : lngLatAt(tap), snap?.snap);
        refine(point);
    }

    function beginDrag(index: number, point: ScreenPoint, kind: Drag['kind']): void {
        const target = measureState.points[index];
        if (!target) return;

        drag = { key: target.key, start: point, moved: false, kind };
        if (kind === 'mouse') canvas.style.cursor = 'grabbing';
    }

    function applyPending(): void {
        if (frame !== null) {
            cancelAnimationFrame(frame);
            frame = null;
        }

        if (!drag?.pending) return;
        moveMeasurePoint(drag.key, drag.pending.coord, drag.pending.snap);
        drag.pending = undefined;
    }

    function moveDrag(point: ScreenPoint): void {
        if (!drag) return;
        if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < DRAG_THRESHOLD) return;
        drag.moved = true;

        const snap = findSnap(point);
        drag.pending = { coord: snap ? snap.coord : lngLatAt(point), snap: snap?.snap };

        // One map update per frame however often the finger reports
        if (frame === null) {
            frame = requestAnimationFrame(() => {
                frame = null;
                applyPending();
            });
        }
    }

    function endDrag(): void {
        if (!drag) return;

        applyPending();

        const key = drag.key;
        const moved = drag.moved;
        drag = null;
        clickBlockedUntil = Date.now() + CLICK_AFTER_DRAG;
        canvas.style.cursor = 'crosshair';

        if (moved) {
            const point = measureState.points.find((p) => p.key === key);
            if (point) refine(point);
        }
    }

    function onTouchStart(e: MapTouchEvent): void {
        holdDoubleTapZoom();

        if (drag) {
            // A second finger: the point stays where it is, the map zooms
            if (e.points.length > 1) endDrag();
            return;
        }

        if (e.points.length !== 1) return;

        const index = hitVertex(e.point);
        if (index < 0) return;

        // The map does not pan under the finger dragging the point
        e.preventDefault();
        beginDrag(index, { x: e.point.x, y: e.point.y }, 'touch');
    }

    function onTouchMove(e: MapTouchEvent): void {
        if (!drag || drag.kind !== 'touch') return;

        if (e.points.length !== 1) {
            endDrag();
            return;
        }

        if (e.originalEvent.cancelable) e.originalEvent.preventDefault();
        moveDrag({ x: e.point.x, y: e.point.y });
    }

    function onTouchEnd(): void {
        if (drag?.kind === 'touch') endDrag();
    }

    function onMouseDown(e: MapMouseEvent): void {
        holdDoubleTapZoom();
        if (e.originalEvent.button !== 0) return;

        const index = hitVertex(e.point);
        if (index < 0) return;

        e.preventDefault();
        beginDrag(index, { x: e.point.x, y: e.point.y }, 'mouse');
    }

    function onMouseMove(e: MapMouseEvent): void {
        if (drag?.kind === 'mouse') {
            moveDrag({ x: e.point.x, y: e.point.y });
            return;
        }

        if (!drag) canvas.style.cursor = hitVertex(e.point) >= 0 ? 'grab' : 'crosshair';
    }

    function onMouseUp(): void {
        if (drag?.kind === 'mouse') endDrag();
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key !== 'Escape' || e.defaultPrevented) return;

        if (drag) {
            // Back where it was picked up is not known any more - just stop following
            drag.pending = undefined;
            endDrag();
        } else {
            stopMeasure();
        }
    }

    function onStyleData(): void {
        ensureLayers();
    }

    map.on('click', onClick);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchEnd);
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('styledata', onStyleData);
    doc.addEventListener('keydown', onKeyDown);

    container.classList.add(MEASURING_CLASS);
    canvas.style.cursor = 'crosshair';
    holdDoubleTapZoom();

    ensureLayers();

    const stopWatch = watch(() => measureState.points.map((p) => `${p.key}:${p.coord[0]},${p.coord[1]}:${p.snap ? 1 : 0}`).join('|'), render, { immediate: true });

    function detach(): void {
        if (detached) return;
        detached = true;
        attached -= 1;

        stopWatch();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        drag = null;

        map.off('click', onClick);
        map.off('touchstart', onTouchStart);
        map.off('touchmove', onTouchMove);
        map.off('touchend', onTouchEnd);
        map.off('touchcancel', onTouchEnd);
        map.off('mousedown', onMouseDown);
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
        map.off('styledata', onStyleData);
        map.off('remove', detach);
        doc.removeEventListener('keydown', onKeyDown);

        container.classList.remove(MEASURING_CLASS);
        canvas.style.cursor = '';

        try {
            map.doubleClickZoom.enable();
            removeLayers();
        } catch (err) {
            // The map is going away anyway
            console.warn('Measure: cleanup on a removed map', err);
        }
    }

    map.once('remove', detach);

    return detach;
}
