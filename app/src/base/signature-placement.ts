import { shallowRef, readonly } from 'vue';
import { v4 as randomUUID } from 'uuid';
import type { Feature } from '../types.ts';
import { signatureProperties, type Signature } from '../utils/signature.ts';

/**
 * Quick placement of a signature, inspired by ATAK's Point Dropper: a
 * signature is armed from the favourites bar and every tap on the map places
 * one object until it is disarmed.
 */

export interface ArmedSignature {
    signature: Signature;
    label: string;
}

const armedRef = shallowRef<ArmedSignature | null>(null);

// Map taps only place while a placement handler (the favourites bar) is
// mounted - an armed signature without one must not swallow map taps
let handlers = 0;

/** The signature placed by the next map tap - change it with armSignature() / disarmSignature() */
export const armedSignature = readonly(armedRef);

export function armSignature(signature: Signature, label: string): void {
    armedRef.value = { signature: { ...signature }, label };
}

export function disarmSignature(): void {
    armedRef.value = null;
}

/** True while map taps place a signature instead of selecting objects */
export function isSignatureArmed(): boolean {
    return handlers > 0 && armedRef.value !== null;
}

/**
 * Register a placement handler for map taps. The returned function
 * unregisters it; with the last one gone the signature is disarmed.
 */
export function attachPlacementHandler(): () => void {
    handlers += 1;

    let attached = true;
    return () => {
        if (!attached) return;
        attached = false;

        handlers -= 1;
        if (handlers === 0) disarmSignature();
    };
}

function clock(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** A new point Feature with the signature at the given position - shaped like a drawn point */
export function signatureFeature(
    signature: Signature,
    label: string,
    lngLat: [number, number],
    opts: { id?: string; now?: Date } = {}
): Feature {
    const id = opts.id ?? randomUUID();
    const now = opts.now ?? new Date();

    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            how: 'h-g-i-g-o',
            archived: true,
            // The time keeps objects of the same signature apart, as ATAK does
            callsign: `${label} ${clock(now)}`.trim(),
            time: now.toISOString(),
            start: now.toISOString(),
            stale: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            center: [lngLat[0], lngLat[1]],
            ...signatureProperties(signature),
        },
        geometry: {
            type: 'Point',
            coordinates: [lngLat[0], lngLat[1]]
        }
    } as Feature;
}

/** The part of the map store a placement uses */
export interface PlacementTarget {
    worker: {
        db: {
            add(feature: Feature, opts: {
                authored?: boolean;
                created?: boolean;
                skipMissionLookup?: boolean;
            }): Promise<unknown>;
            remove(id: string, opts: { mission?: boolean }): Promise<void>;
        };
    };
    refresh(): Promise<void>;
    /** Active Data Sync - authored objects are filed there */
    mission?: { meta: { guid: string; name: string } };
}

export interface PlacedSignature {
    id: string;
    callsign: string;
    /** Data Sync the object went to, unset for an own object */
    mission?: { guid: string; name: string };
}

/**
 * Place a signature as a new object. Takes the same path as a drawn point: an
 * authored object goes to the Active Mission when one is set, otherwise it is
 * saved as an own object.
 */
export async function placeSignature(
    target: PlacementTarget,
    signature: Signature,
    label: string,
    lngLat: [number, number],
    opts: { id?: string; now?: Date } = {}
): Promise<PlacedSignature> {
    const feat = signatureFeature(signature, label, lngLat, opts);

    // Read before the write - the active mission may change while it runs
    const mission = target.mission
        ? { guid: target.mission.meta.guid, name: target.mission.meta.name }
        : undefined;

    await target.worker.db.add(feat, {
        authored: true,
        created: true,
        // Newly placed - its fresh id cannot already be in a Mission
        skipMissionLookup: true
    });

    await target.refresh();

    return {
        id: feat.id as string,
        callsign: String(feat.properties.callsign),
        mission
    };
}

/** Delete a just placed object again, wherever it was filed */
export async function undoPlacement(target: PlacementTarget, placed: PlacedSignature): Promise<void> {
    await target.worker.db.remove(placed.id, { mission: true });
    await target.refresh();
}
