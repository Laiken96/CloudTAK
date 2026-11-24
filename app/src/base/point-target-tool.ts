/**
 * Point Target (Drawing Tools, artillery): one tap on the map sets a target,
 * a spot marker named Z01, Z02 ... (utils/point-target.ts) saved the way a
 * drawn point is saved: an own object, or in the Active Mission when one is
 * set. PointTargetPanel.vue then shows its name and LV95 coordinates and
 * follows the target while it is moved, renamed or deleted.
 *
 * - One target per start: after the tap the tool is off and map taps open
 *   objects again. The panel stays until it is closed.
 * - Until then map taps belong to the tool alone: the map store asks
 *   isPlacingTarget() before opening objects, ring menus, the long press menu
 *   or picking up an object to move it
 * - Closing the panel before the tap, Escape, or starting a drawing tool or
 *   Measure Distance ends the tool without an object
 * - No double tap zoom lock as in measure-tool.ts: the first tap ends the
 *   tool, a second one is an ordinary tap on the map
 */
import { reactive, watch } from 'vue';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Feature } from '../types.ts';
import { nextTargetName, pointTargetFeature, type LngLat } from '../utils/point-target.ts';
import { stopMeasure } from './measure-tool.ts';
import { tr } from '../i18n/index.ts';

/** Class on the map container while placing - lets taps through DOM markers (own position) */
export const PLACING_TARGET_CLASS = 'cloudtak-placing-target';

/**
 * - placing: the next map tap sets the target
 * - saving: the tap was taken, the target is being saved
 * - placed: the panel shows the target, map taps are ordinary again
 */
export type PointTargetPhase = 'idle' | 'placing' | 'saving' | 'placed';

export interface PlacedTarget {
    id: string;
    callsign: string;
    coord: LngLat;
}

export const pointTargetState = reactive<{
    phase: PointTargetPhase;
    target: PlacedTarget | null;
    /** The placed target is no longer there */
    gone: boolean;
    /** Why the last tap set no target */
    error: string;
}>({
    phase: 'idle',
    target: null,
    gone: false,
    error: '',
});

/** A new start or a stop makes a save still running from before stale */
let session = 0;
let attached = 0;

/** True while map taps belong to the point target tool */
export function isPlacingTarget(): boolean {
    return (pointTargetState.phase === 'placing' || pointTargetState.phase === 'saving') && attached > 0;
}

function reset(phase: PointTargetPhase): void {
    session += 1;
    pointTargetState.phase = phase;
    pointTargetState.target = null;
    pointTargetState.gone = false;
    pointTargetState.error = '';
}

/** Arm the tool: the next map tap sets a target */
export function startPointTarget(): void {
    // Both tools want the next tap
    stopMeasure();
    reset('placing');
}

/** Close the tool and its panel - a target already set stays on the map */
export function stopPointTarget(): void {
    reset('idle');
}

export interface PointTargetHost {
    /** Callsigns of the objects that may already carry a target name */
    callsigns(): Promise<Iterable<unknown>>;
    /** Save the new object the way a drawn point is saved */
    save(feature: Feature): Promise<void>;
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Set the target at the position: name it, save it, show it. Null if the tool
 * was not waiting for a tap, the save failed (the tool waits for the next tap)
 * or the tool was closed meanwhile.
 */
export async function placePointTarget(
    host: PointTargetHost,
    coord: LngLat,
    opts: { id?: string; now?: Date } = {}
): Promise<PlacedTarget | null> {
    if (pointTargetState.phase !== 'placing') return null;

    const mine = session;
    pointTargetState.phase = 'saving';
    pointTargetState.error = '';

    try {
        const callsign = nextTargetName(await host.callsigns());
        const feature = pointTargetFeature(callsign, coord, opts);

        await host.save(feature);

        const placed: PlacedTarget = { id: String(feature.id), callsign, coord: [coord[0], coord[1]] };

        // Closed while it was saved: the object exists, the panel stays closed
        if (session !== mine) return placed;

        pointTargetState.target = placed;
        pointTargetState.gone = false;
        pointTargetState.phase = 'placed';

        return placed;
    } catch (err) {
        console.error('Point Target: cannot save the target', err);
        if (session !== mine) return null;

        pointTargetState.phase = 'placing';
        pointTargetState.error = tr('Could not set the target: {message}', { message: errorText(err) });

        return null;
    }
}

export interface TargetLookup {
    /** Current name and position of an object, undefined once it is deleted */
    lookup(id: string): Promise<{ callsign: string; coord: LngLat } | undefined>;
}

/** Take over a move, rename or delete of the placed target */
export async function refreshPlacedTarget(host: TargetLookup): Promise<void> {
    const target = pointTargetState.target;
    if (pointTargetState.phase !== 'placed' || !target) return;

    const { id } = target;
    const mine = session;

    let current: { callsign: string; coord: LngLat } | undefined;
    try {
        current = await host.lookup(id);
    } catch (err) {
        // Keep what is shown, the next look may work
        console.warn('Point Target: cannot look up the target', err);
        return;
    }

    if (session !== mine || pointTargetState.target?.id !== id) return;

    if (!current) {
        pointTargetState.gone = true;
        return;
    }

    pointTargetState.gone = false;

    const shown = pointTargetState.target;
    if (shown.callsign !== current.callsign) shown.callsign = current.callsign;
    if (shown.coord[0] !== current.coord[0] || shown.coord[1] !== current.coord[1]) {
        shown.coord = [current.coord[0], current.coord[1]];
    }
}

type PointTargetMap = Pick<MapLibreMap, 'on' | 'off' | 'once' | 'getContainer' | 'getCanvas'>;

/**
 * Attach the tool to the map: the tap that sets the target, Escape, the
 * crosshair cursor. Returns the function that detaches it again.
 */
export function attachPointTargetTool(map: PointTargetMap, host: PointTargetHost): () => void {
    attached += 1;

    const container = map.getContainer();
    const canvas = map.getCanvas();
    const doc = container.ownerDocument;
    let detached = false;

    function onClick(e: MapMouseEvent): void {
        if (pointTargetState.phase !== 'placing') return;

        const lngLat = e.lngLat.wrap();
        // Saving runs on: the phase is 'saving' before the next listener of this tap asks
        void placePointTarget(host, [lngLat.lng, lngLat.lat]);
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (pointTargetState.phase === 'placing') stopPointTarget();
    }

    const stopWatch = watch(() => pointTargetState.phase, (phase) => {
        const placing = phase === 'placing' || phase === 'saving';
        container.classList.toggle(PLACING_TARGET_CLASS, placing);
        canvas.style.cursor = placing ? 'crosshair' : '';
    }, { immediate: true });

    map.on('click', onClick);
    doc.addEventListener('keydown', onKeyDown);

    function detach(): void {
        if (detached) return;
        detached = true;
        attached -= 1;

        stopWatch();
        map.off('click', onClick);
        map.off('remove', detach);
        doc.removeEventListener('keydown', onKeyDown);

        container.classList.remove(PLACING_TARGET_CLASS);
        canvas.style.cursor = '';
    }

    map.once('remove', detach);

    return detach;
}
