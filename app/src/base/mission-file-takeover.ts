/**
 * Take the objects of mission files over into the mission.
 *
 * Objects of files attached to a mission are drawn read-only with it
 * (base/mission-files.ts) and are therefore missing wherever only the
 * mission's own objects count - Mission > Layers, the Hashtag Manager, for
 * other clients. On request (a question when a mission with such files is
 * opened, or a button in Mission > Files) a user with MISSION_WRITE takes them
 * over: each becomes an object of the mission with its UID, type and details
 * from the file, written the normal way (SubscriptionFeature.update, then
 * push to the TAK Server). From then on the mission's object wins over the
 * file's by UID, so the file's copy disappears by itself. The files stay
 * attached.
 *
 * This is the only path that writes an object of a mission file: it writes a
 * clean copy without the MISSION_FILE_PROPERTY mark. Marked objects stay
 * refused everywhere else (AtlasDatabase.add, SubscriptionFeature.update).
 *
 * Taking over the same UID again is an update, so two users taking over at
 * the same time end with one object per UID; a folder per file is found by
 * name or by a UID derived from mission and name, so it is not doubled either.
 */
// eslint-disable-next-line vue/prefer-import-from-vue
import { shallowReactive, shallowRef } from '@vue/reactivity';
import { v5 as uuidv5 } from 'uuid';
import { db } from '../database.ts';
import COT, { OriginMode } from './cot.ts';
import { MISSION_FILE_PROPERTY } from './mission-file-hooks.ts';
import { mapFiles, missionFiles, repaintMission } from './mission-files.ts';
import { MISSION_FILE_MAX_BYTES } from '../utils/mission-file-kind.ts';
import type Atlas from '../workers/atlas.ts';
import type SubscriptionFeature from './subscription-feature.ts';
import type SubscriptionLayer from './subscription-layer.ts';
import type { Feature, MissionLayer } from '../types.ts';

/** Namespace of the folder UIDs (uuid v5 of `<mission guid>/<folder name>`) */
const FOLDER_NAMESPACE = '6f0b8a52-3c1e-4d7a-9b25-8e4f1c2d7a90';

const ASKED_PREFIX = 'mission-file-asked:';

export interface TakeoverFile {
    hash: string;
    name: string;
    /** Objects of the file that are not objects of the mission yet */
    features: Feature[];
}

export interface TakeoverResult {
    /** Objects that are now objects of the mission */
    written: number;
    /** Objects not taken over - not stored, or not confirmed by the server yet */
    failed: number;
    /** Folders that could not be created or filled */
    folders: Array<{ name: string; error: string }>;
    /** First error of the objects that failed */
    error?: string;
}

/** What the takeover needs of a Subscription */
export interface TakeoverMission {
    guid: string;
    subscribed?: boolean;
    role?: { permissions?: string[] } | null;
    feature: Pick<SubscriptionFeature, 'update' | 'push'>;
    layer: Pick<SubscriptionLayer, 'list' | 'create' | 'attachFeatures'>;
}

/** Only a subscriber with write access takes objects over */
export function canTakeOver(sub: Pick<TakeoverMission, 'subscribed' | 'role'> | null | undefined): boolean {
    return !!sub?.subscribed
        && !!sub.role
        && Array.isArray(sub.role.permissions)
        && sub.role.permissions.includes('MISSION_WRITE');
}

/**
 * Of the files (newest first, as drawn) the objects whose UID is neither an
 * object of the mission nor taken by a newer file, per file. Files left
 * without objects are dropped.
 */
export function selectTakeover(
    files: Array<{ hash: string; name: string; features: Feature[] }>,
    missionIds: Set<string>
): TakeoverFile[] {
    const taken = new Set(missionIds);
    const out: TakeoverFile[] = [];

    for (const file of files) {
        const features = file.features.filter((feat) => {
            const id = String(feat.id);
            if (taken.has(id)) return false;
            taken.add(id);
            return true;
        });

        if (features.length) out.push({ hash: file.hash, name: file.name, features });
    }

    return out;
}

/**
 * The objects of the mission's files that are up for takeover, from files
 * already read (no download)
 */
export async function takeoverCandidates(guid: string): Promise<TakeoverFile[]> {
    const contents = await db.subscription_contents
        .where('mission')
        .equals(guid)
        .toArray();

    const missionIds = new Set((await db.subscription_feature
        .where('mission')
        .equals(guid)
        .filter((row) => !row.deleted)
        .primaryKeys()).map(String));

    const files: Array<{ hash: string; name: string; features: Feature[] }> = [];
    for (const content of mapFiles(contents)) {
        if (content.size > MISSION_FILE_MAX_BYTES) continue;

        const features = await missionFiles.read(content.hash);
        if (features?.length) files.push({ hash: content.hash, name: content.name, features });
    }

    return selectTakeover(files, missionIds);
}

/**
 * The object as an object of the mission: same UID, type and details, without
 * the mark of a mission file
 */
export function cleanCopy(feature: Feature): Feature {
    // JSON, not structuredClone: the object may come through a Vue proxy
    const copy = JSON.parse(JSON.stringify(feature)) as Feature;
    const props = copy.properties as Record<string, unknown>;

    delete props[MISSION_FILE_PROPERTY];

    // Added when the file was read (COT.style) - not part of the file
    if (props.remarks === 'None') delete props.remarks;

    delete copy.origin;

    return copy;
}

/** Folder name for a file: its name without extension */
export function folderName(file: string): string {
    const name = file.trim().replace(/\.[^./\\]+$/, '').trim();
    return name || file.trim() || 'Mission File';
}

/** The folder UID used when the folder is created - the same for every user */
export function folderUid(guid: string, name: string): string {
    return uuidv5(`${guid}/${name}`, FOLDER_NAMESPACE);
}

function findFolder(layers: MissionLayer[], name: string, uid: string): MissionLayer | undefined {
    const all: MissionLayer[] = [];
    const walk = (list: MissionLayer[]): void => {
        for (const layer of list) {
            all.push(layer);
            walk((layer.mission_layers || []) as MissionLayer[]);
        }
    };
    walk(layers);

    return all.find((layer) => layer.uid === uid)
        ?? all.find((layer) => layer.type === 'UID' && layer.name === name);
}

async function fileInFolder(
    sub: TakeoverMission,
    name: string,
    uids: string[]
): Promise<void> {
    const uid = folderUid(sub.guid, name);

    let target = findFolder(await sub.layer.list({ refresh: true }), name, uid)?.uid;

    if (!target) {
        let created: string | undefined;
        try {
            // The API answers with the TAK Server's item, the layer in `data`
            const res = await sub.layer.create({ name, type: 'UID', uid }) as MissionLayer & { data?: MissionLayer };
            created = res.data?.uid ?? res.uid ?? uid;
        } catch (err) {
            // Another user may have created it at the same moment
            console.warn(`Mission ${sub.guid}: folder ${name} not created`, err);
        }

        // TAK Server listings can lag behind - the created folder counts as well
        target = findFolder(await sub.layer.list({ refresh: true }), name, uid)?.uid ?? created;
    }

    if (!target) throw new Error('The folder could not be created');

    await sub.layer.attachFeatures(target, uids);
}

/**
 * Take the objects of the files over into the mission. One object or folder
 * failing does not stop the others.
 *
 * @param atlas - Only for SubscriptionFeature.update's signature (chats); the main thread passes the worker
 * @param opts.folders - File the objects of each file in a folder named after the file
 */
export async function takeOver(
    sub: TakeoverMission,
    atlas: Atlas,
    files: TakeoverFile[],
    opts: { folders: boolean }
): Promise<TakeoverResult> {
    const result: TakeoverResult = { written: 0, failed: 0, folders: [] };
    const stored = new Map<string, string[]>();

    for (const file of files) {
        const uids: string[] = [];

        for (const feature of file.features) {
            try {
                const cot = new COT(cleanCopy(feature), {
                    mode: OriginMode.MISSION,
                    mode_id: sub.guid
                });

                await sub.feature.update(atlas, cot);
                uids.push(cot.id);
            } catch (err) {
                result.failed++;
                result.error ??= err instanceof Error ? err.message : String(err);
            }
        }

        stored.set(file.hash, uids);
    }

    // The mission's objects replace the file's on the map straight away
    repaintMission(sub.guid);

    // Wait for the TAK Server - folders can only hold objects it has
    await sub.feature.push();

    for (const file of files) {
        const confirmed: string[] = [];

        for (const uid of stored.get(file.hash) ?? []) {
            const row = await db.subscription_feature.get(uid);

            if (row && row.mission === sub.guid && row.synced !== false && !row.deleted) {
                confirmed.push(uid);
            } else {
                result.failed++;
                result.error ??= row?.error || 'Not confirmed by the server';
            }
        }

        result.written += confirmed.length;

        if (!opts.folders || !confirmed.length) continue;

        const name = folderName(file.name);
        try {
            await fileInFolder(sub, name, confirmed);
        } catch (err) {
            result.folders.push({ name, error: err instanceof Error ? err.message : String(err) });
        }
    }

    repaintMission(sub.guid);

    return result;
}

/** Hashes of the mission's files the user was already asked about */
export async function askedHashes(guid: string): Promise<Set<string>> {
    try {
        const row = await db.kv.get(`${ASKED_PREFIX}${guid}`);
        const list = row?.value ? JSON.parse(row.value) as unknown : [];

        return new Set(Array.isArray(list) ? list.filter((hash): hash is string => typeof hash === 'string') : []);
    } catch (err) {
        console.warn(`Mission ${guid}: answered takeover questions not readable`, err);
        return new Set();
    }
}

/** Do not ask about these files again - a new file (new hash) is asked about */
export async function markAsked(guid: string, hashes: string[]): Promise<void> {
    const asked = await askedHashes(guid);
    for (const hash of hashes) asked.add(hash);

    await db.kv.put({ key: `${ASKED_PREFIX}${guid}`, value: JSON.stringify([...asked]) });
}

/**
 * Shared between the mission view, which asks and runs the takeover
 * (MissionFileTakeover.vue), and the file list, which offers it per file
 */
export const takeoverState = {
    /** Files with objects up for takeover, by mission */
    pending: shallowReactive(new Map<string, TakeoverFile[]>()),
    /** A takeover asked for from the file list */
    request: shallowRef<{ guid: string; hashes?: string[] } | null>(null),
};

export function requestTakeover(guid: string, hashes?: string[]): void {
    takeoverState.request.value = { guid, hashes };
}
