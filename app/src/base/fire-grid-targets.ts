import { db } from '../database.ts';
import type { EfpTargetFeature } from '../utils/efp-package.ts';

/**
 * The targets of a fire grid (imported with an Einheitsfeuerplan data package)
 * are local features of this device: never filed into a mission and never sent
 * to the TAK Server as CoTs of their own. They keep the UIDs of the
 * Einheitsfeuerplan, so importing the same file again updates them.
 *
 * The map implements this host (stores/modules/fire-grid-targets.ts); the fire
 * grids only know the UIDs of their targets.
 */
export interface FireGridTargetHost {
    /** Create or update a target as a local feature of this device, never in a mission */
    put(feature: EfpTargetFeature): Promise<void>;
    /** Delete a local feature of this device; a mission feature with the same UID is left alone */
    remove(uid: string): Promise<void>;
    /** Whether a local feature with this UID is on this device */
    has(uid: string): Promise<boolean>;
    /** The subscribed mission that holds a feature with this UID, if any */
    mission(uid: string): Promise<FireGridTargetMission | null>;
    /** Hide or show features on the map of this device */
    setHidden(uids: string[], hidden: boolean): void;
}

export interface FireGridTargetMission {
    guid: string;
    name: string;
}

/**
 * The subscribed mission holding a feature with this UID, as the map database
 * finds it (`AtlasDatabase.get(uid, { mission: true })`). The app tells
 * features apart by UID only and prefers the local feature, so a target is
 * never added locally while its UID is in a mission: the local copy would
 * shadow the mission feature, and deleting it in the mission would delete
 * the local copy instead.
 */
export async function missionHolding(uid: string): Promise<FireGridTargetMission | null> {
    const feat = await db.subscription_feature.get(uid);
    if (!feat || feat.deleted) return null;

    const sub = await db.subscription.get(feat.mission);
    if (!sub || !sub.subscribed) return null;

    return { guid: sub.guid, name: sub.name || sub.guid };
}
