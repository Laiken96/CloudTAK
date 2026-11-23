/**
 * Objects of the files attached to a mission (Data Sync) on the map.
 *
 * A mission carries objects (its UIDs) and files. ATAK and WinTAK users often
 * attach drawings as files (a `.cot` per drawing, data packages, KML), which
 * the mission's object list does not contain. This draws the objects of those
 * files as part of the mission:
 *
 * - They are painted into the mission's own overlay (stores/map.ts,
 *   renderMission), so hiding or unsubscribing the mission takes them along,
 *   and the hashtag, path and object visibility filters of the overlay apply.
 * - They are read-only (base/mission-file-hooks.ts marks them): a tap shows the
 *   object, nothing edits, moves or deletes it.
 * - They never reach the server: they are kept here, in memory and in a cache
 *   by file hash (KV `mission-file:v1:<hash>` - the hash is the content, so an
 *   entry never changes), never in the mission's object store
 *   (subscription_feature), whose changes are submitted to the TAK Server.
 *   AtlasDatabase.add() and SubscriptionFeature.update() refuse them as well.
 * - An object of the mission with the same UID wins over a file's object, and
 *   the newest file wins over older ones.
 * - Files above MISSION_FILE_MAX_BYTES are skipped. Each file has a status
 *   (Mission > Files): on the map with how many objects, or why not.
 *
 * The main thread downloads and reads the files (DOMParser is not available in
 * workers) and paints them; the worker finds them by UID from the cache, for
 * the object view and the ring menu (missionFileCOT, AtlasDatabase.get).
 */
// eslint-disable-next-line vue/prefer-import-from-vue
import { shallowReactive } from '@vue/reactivity';
import { db, type DBSubscriptionContent } from '../database.ts';
import { std } from '../std.ts';
import COT, { OriginMode } from './cot.ts';
import Filter from './filter.ts';
import { renderMissionFeature } from './subscription-feature.ts';
import { MISSION_FILE_PROPERTY } from './mission-file-hooks.ts';
import { WorkerMessageType } from '../utils/events.ts';
import {
    MISSION_FILE_MAX_BYTES,
    MissionFileError,
    missionFileKind,
} from '../utils/mission-file-kind.ts';
import type { Feature } from '../types.ts';

/** Bump when reading changes, so cached results are read again */
const CACHE_VERSION = 1;
const CACHE_PREFIX = 'mission-file:';
const CACHE_KEY_PREFIX = `${CACHE_PREFIX}v${CACHE_VERSION}:`;

/** A failed download is tried again after this long */
export const MISSION_FILE_RETRY_MS = 60 * 1000;

const DOWNLOAD_TIMEOUT_MS = 60 * 1000;

export type MissionFileState = 'loading' | 'loaded' | 'too-large' | 'invalid' | 'failed';

export interface MissionFileStatus {
    state: MissionFileState;
    /** Objects read from the file */
    count?: number;
    /** Objects drawn - fewer when the mission or a newer file has the same UID */
    shown?: number;
    error?: string;
}

/** The result of reading a file, cached by its hash */
interface CacheEntry {
    v: number;
    /** Styled objects, marked with MISSION_FILE_PROPERTY */
    features?: Feature[];
    /** Not readable: why */
    error?: string;
    tooLarge?: boolean;
}

/** What the store needs of a Subscription */
export interface MissionFileSubscription {
    guid: string;
    headers(): Record<string, string>;
    contents: { list(): Promise<DBSubscriptionContent[]> };
    fetch(): Promise<unknown>;
}

export interface MissionFileStoreOptions {
    /** Download a file by hash */
    download?: (hash: string, headers: Record<string, string>) => Promise<Uint8Array>;
    /** Ask for the mission to be painted again */
    repaint?: (guid: string) => void;
    now?: () => number;
}

/**
 * The files of a mission that are read onto the map, newest first - the
 * first file with a UID wins
 */
export function mapFiles(contents: DBSubscriptionContent[]): DBSubscriptionContent[] {
    return contents
        .filter((content) => content.hash && missionFileKind(content.name, content.mimeType) !== null)
        .sort((a, b) => {
            const time = new Date(b.submissionTime).getTime() - new Date(a.submissionTime).getTime();
            if (time) return time;
            return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
        });
}

export async function downloadMissionFile(hash: string, headers: Record<string, string>): Promise<Uint8Array> {
    const res = await std(`/api/marti/api/files/${encodeURIComponent(hash)}`, {
        headers: { ...headers },
        timeout: DOWNLOAD_TIMEOUT_MS,
    });

    // std() returns the parsed body for JSON - not a map file
    if (!(res instanceof Response)) throw new MissionFileError('invalid', 'The file is JSON');

    const length = Number(res.headers.get('Content-Length') || 0);
    if (length > MISSION_FILE_MAX_BYTES) throw new MissionFileError('too-large');

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MISSION_FILE_MAX_BYTES) throw new MissionFileError('too-large');

    return bytes;
}

function repaintMission(guid: string): void {
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

function statusKey(guid: string, hash: string): string {
    return `${guid}:${hash}`;
}

function sameStatus(a: MissionFileStatus | undefined, b: MissionFileStatus): boolean {
    return !!a
        && a.state === b.state
        && a.count === b.count
        && a.shown === b.shown
        && a.error === b.error;
}

export class MissionFileStore {
    /** Status per mission and file, `<guid>:<hash>` - reactive for the file list */
    readonly statuses = shallowReactive(new Map<string, MissionFileStatus>());

    private readonly opts: Required<MissionFileStoreOptions>;

    /** Read files by hash */
    private readonly entries = new Map<string, CacheEntry>();
    /** Objects of a read file by UID, for find() */
    private readonly index = new Map<string, Map<string, Feature>>();
    private readonly loading = new Map<string, Promise<void>>();
    private readonly failures = new Map<string, { at: number; error: string }>();
    /** Hashes painted per mission */
    private readonly painted = new Map<string, Set<string>>();
    /** Missions whose file list was refreshed from the server in this session */
    private readonly refreshed = new Set<string>();
    private pruned = false;

    constructor(opts: MissionFileStoreOptions = {}) {
        this.opts = {
            download: opts.download ?? downloadMissionFile,
            repaint: opts.repaint ?? repaintMission,
            now: opts.now ?? Date.now,
        };
    }

    status(guid: string, hash: string): MissionFileStatus | undefined {
        return this.statuses.get(statusKey(guid, hash));
    }

    /** Set a status, leaving the list alone when nothing changed */
    private setStatus(guid: string, hash: string, status: MissionFileStatus): void {
        const key = statusKey(guid, hash);
        if (!sameStatus(this.statuses.get(key), status)) this.statuses.set(key, status);
    }

    /** Resolves when no file is loading */
    async idle(): Promise<void> {
        while (this.loading.size) {
            await Promise.allSettled([...this.loading.values()]);
        }
    }

    /**
     * Try a failed download again now
     */
    retry(guid: string, hash: string): void {
        this.failures.delete(hash);
        this.setStatus(guid, hash, { state: 'loading' });
        this.opts.repaint(guid);
    }

    /**
     * The objects of the mission's files, rendered for its overlay. Files not
     * read yet are loaded in the background and the mission is painted again
     * when they are in.
     *
     * @param mission - The mission's own objects as they are painted; their UIDs win
     */
    async features(sub: MissionFileSubscription, mission: Feature[]): Promise<Feature[]> {
        try {
            return await this.paint(sub, mission);
        } catch (err) {
            // The mission's own objects are painted regardless
            console.error(`Mission ${sub.guid}: objects of its files not painted`, err);
            return [];
        }
    }

    private async paint(sub: MissionFileSubscription, mission: Feature[]): Promise<Feature[]> {
        this.refreshContents(sub);

        if (!this.pruned) {
            this.pruned = true;
            void this.prune();
        }

        const files = mapFiles(await sub.contents.list());
        const taken = new Set(mission.map((feat) => String(feat.id)));
        const filters = await Filter.list();
        const hashes = new Set<string>();
        const out: Feature[] = [];

        for (const content of files) {
            hashes.add(content.hash);

            if (content.size > MISSION_FILE_MAX_BYTES) {
                this.setStatus(sub.guid, content.hash, { state: 'too-large' });
                continue;
            }

            const entry = await this.entry(content.hash);

            if (!entry) {
                const failure = this.failures.get(content.hash);
                this.load(sub, content);

                this.setStatus(sub.guid, content.hash, this.loading.has(content.hash) || !failure
                    ? { state: 'loading' }
                    : { state: 'failed', error: failure.error });
                continue;
            }

            if (entry.tooLarge) {
                this.setStatus(sub.guid, content.hash, { state: 'too-large' });
                continue;
            }

            if (entry.error || !entry.features) {
                this.setStatus(sub.guid, content.hash, { state: 'invalid', error: entry.error });
                continue;
            }

            let shown = 0;
            for (const feat of entry.features) {
                const id = String(feat.id);
                if (taken.has(id)) continue;
                taken.add(id);

                let blocked = false;
                for (const filter of filters) {
                    if (await filter.test(feat)) {
                        blocked = true;
                        break;
                    }
                }

                if (blocked) continue;

                out.push(renderMissionFeature(feat));
                shown++;
            }

            this.setStatus(sub.guid, content.hash, { state: 'loaded', count: entry.features.length, shown });
        }

        this.forget(sub.guid, hashes);

        return out;
    }

    /**
     * An object of the files of the subscribed missions by UID, from the
     * cache only (no download) - the worker side of features()
     */
    async find(id: string): Promise<{ mission: string; feature: Feature } | undefined> {
        const guids = await db.subscription
            .filter((sub) => sub.subscribed)
            .primaryKeys();

        for (const guid of guids) {
            const contents = await db.subscription_contents
                .where('mission')
                .equals(guid)
                .toArray();

            for (const content of mapFiles(contents)) {
                if (content.size > MISSION_FILE_MAX_BYTES) continue;

                const entry = await this.entry(content.hash);
                if (!entry?.features) continue;

                let byId = this.index.get(content.hash);
                if (!byId) {
                    byId = new Map(entry.features.map((feat) => [String(feat.id), feat]));
                    this.index.set(content.hash, byId);
                }

                const feature = byId.get(id);
                if (feature) return { mission: String(guid), feature: structuredClone(feature) };
            }
        }

        return undefined;
    }

    /** Read a file once per session: memory, then the cache */
    private async entry(hash: string): Promise<CacheEntry | undefined> {
        const known = this.entries.get(hash);
        if (known) return known;

        try {
            const row = await db.kv.get(`${CACHE_KEY_PREFIX}${hash}`);
            if (!row?.value) return undefined;

            const entry = JSON.parse(row.value) as CacheEntry;
            if (entry.v !== CACHE_VERSION) return undefined;

            this.entries.set(hash, entry);
            return entry;
        } catch (err) {
            console.warn(`Mission file ${hash}: cache not readable`, err);
            return undefined;
        }
    }

    private load(sub: MissionFileSubscription, content: DBSubscriptionContent): void {
        const hash = content.hash;
        if (this.loading.has(hash)) return;

        const failure = this.failures.get(hash);
        if (failure && this.opts.now() - failure.at < MISSION_FILE_RETRY_MS) return;

        const kind = missionFileKind(content.name, content.mimeType);
        if (!kind) return;

        const job = (async () => {
            try {
                let entry: CacheEntry;

                try {
                    const bytes = await this.opts.download(hash, sub.headers());

                    // The readers (node-cot, fflate) load with the first file
                    const { parseMissionFile } = await import('../utils/mission-file-parser.ts');
                    const features = await parseMissionFile(kind, bytes, { idPrefix: hash.slice(0, 16) });

                    for (const feat of features) {
                        await COT.style(feat);
                        (feat.properties as Record<string, unknown>)[MISSION_FILE_PROPERTY] = hash;
                    }

                    entry = { v: CACHE_VERSION, features };
                } catch (err) {
                    // Not a download problem - the content itself, so it is cached
                    if (!(err instanceof MissionFileError)) throw err;

                    entry = err.reason === 'too-large'
                        ? { v: CACHE_VERSION, tooLarge: true }
                        : { v: CACHE_VERSION, error: err.message };
                }

                this.failures.delete(hash);
                this.entries.set(hash, entry);
                this.index.delete(hash);

                try {
                    await db.kv.put({ key: `${CACHE_KEY_PREFIX}${hash}`, value: JSON.stringify(entry) });
                } catch (err) {
                    console.warn(`Mission file ${content.name}: could not be cached`, err);
                }
            } catch (err) {
                console.warn(`Mission file ${content.name}: download failed`, err);

                this.failures.set(hash, {
                    at: this.opts.now(),
                    error: err instanceof Error ? err.message : String(err),
                });
            } finally {
                this.loading.delete(hash);

                // Every mission with this file, the requesting one even if its paint is still running
                const guids = new Set([sub.guid]);
                for (const [guid, hashes] of this.painted) {
                    if (hashes.has(hash)) guids.add(guid);
                }

                for (const guid of guids) this.opts.repaint(guid);
            }
        })();

        this.loading.set(hash, job);
    }

    /**
     * Refresh the mission's file list once per session - a mission loaded
     * from this device's storage is otherwise only refreshed by a sync
     */
    private refreshContents(sub: MissionFileSubscription): void {
        if (this.refreshed.has(sub.guid)) return;
        this.refreshed.add(sub.guid);

        sub.fetch().catch((err: unknown) => {
            console.warn(`Mission ${sub.guid}: file list not refreshed`, err);
        });
    }

    /** Drop what belongs to files no longer attached to the mission */
    private forget(guid: string, hashes: Set<string>): void {
        const before = this.painted.get(guid);
        this.painted.set(guid, hashes);

        if (!before) return;

        let removed = false;
        for (const hash of before) {
            if (hashes.has(hash)) continue;

            this.statuses.delete(statusKey(guid, hash));
            removed = true;
        }

        if (removed) void this.prune();
    }

    /**
     * Drop read files of no subscribed mission, in memory and in the cache
     */
    async prune(): Promise<void> {
        try {
            const live = new Set<string>();
            for (const hashes of this.painted.values()) {
                for (const hash of hashes) live.add(hash);
            }

            for (const hash of [...this.entries.keys()]) {
                if (live.has(hash)) continue;
                this.entries.delete(hash);
                this.index.delete(hash);
            }

            const subscribed = new Set(await db.subscription
                .filter((sub) => sub.subscribed)
                .primaryKeys());

            const referenced = new Set((await db.subscription_contents
                .filter((content) => subscribed.has(content.mission))
                .toArray()).map((content) => content.hash));

            const keys = await db.kv
                .where('key')
                .startsWith(CACHE_PREFIX)
                .primaryKeys();

            const stale = keys.filter((key) => {
                return !key.startsWith(CACHE_KEY_PREFIX)
                    || !referenced.has(key.slice(CACHE_KEY_PREFIX.length));
            });

            if (stale.length) await db.kv.bulkDelete(stale);
        } catch (err) {
            console.warn('Mission files: cache not pruned', err);
        }
    }
}

export const missionFiles = new MissionFileStore();

/**
 * An object of a mission file as a CoT of its mission, for the object view and
 * the ring menu - read-only (isMissionFileFeature)
 */
export async function missionFileCOT(id: string): Promise<COT | undefined> {
    const found = await missionFiles.find(id);
    if (!found) return undefined;

    return await COT.load(found.feature, {
        mode: OriginMode.MISSION,
        mode_id: found.mission
    });
}
