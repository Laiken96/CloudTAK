/**
 * The small pieces of "objects of mission files" (base/mission-files.ts) that
 * upstream code hooks into. Kept free of heavy imports so base/cot.ts and
 * base/subscription-contents.ts can use it without import cycles.
 */
import { db } from '../database.ts';
import { WorkerMessageType } from '../utils/events.ts';

/**
 * Property marking an object read from a file attached to a mission, holding
 * the file's hash. Such an object is read-only: it is never edited, moved,
 * deleted or stored, and never sent to the server - not as a mission object
 * and not as an own object.
 */
export const MISSION_FILE_PROPERTY = 'mission-file';

/** The object comes from a file attached to a mission and is read-only */
export function isMissionFileFeature(feat: { properties?: unknown } | null | undefined): boolean {
    const props = feat?.properties as Record<string, unknown> | undefined;
    const hash = props?.[MISSION_FILE_PROPERTY];

    return typeof hash === 'string' && hash.length > 0;
}

/**
 * Hashes of the files attached to a mission, as stored locally
 */
export async function missionFileHashes(guid: string): Promise<string[]> {
    const contents = await db.subscription_contents
        .where('mission')
        .equals(guid)
        .toArray();

    return contents.map((content) => content.hash).sort();
}

/**
 * Repaint the mission when its files changed since `before` (from
 * missionFileHashes), so objects of new files appear and those of removed or
 * replaced files disappear
 */
export async function announceMissionFileChange(guid: string, before: string[]): Promise<void> {
    const after = await missionFileHashes(guid);
    if (after.length === before.length && after.every((hash, i) => hash === before[i])) return;

    const channel = new BroadcastChannel('cloudtak');
    try {
        channel.postMessage({
            type: WorkerMessageType.Mission_Change_Feature,
            body: { guid }
        });
    } finally {
        channel.close();
    }
}
