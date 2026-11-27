/**
 * PzBat12 prototype: planning mode.
 *
 * While a plan is open, every new own object (drawn, imported, range rings …)
 * becomes a personal object in the folder /Planung/<name> instead of going into
 * the Active Mission (workers/atlas-database.ts, `plan`). Nothing reaches the
 * TAK Server until the plan is shared - in one step into a Data Sync, to people
 * or groups, or as a data package.
 *
 * To remove the prototype: delete this folder and the lines marked
 * "PzBat12: planning mode" in Map.vue, DrawTools.vue and atlas-database.ts.
 * Plans already drawn stay as ordinary own objects in the folder Planung.
 */
import { reactive } from 'vue';
import { v4 as randomUUID } from 'uuid';
import KV from '../../../base/kv.ts';
import { OriginMode } from '../../../base/cot.ts';
import OverlayManager from '../../../base/overlay.ts';
import { server } from '../../../std.ts';
import { useMapStore } from '../../../stores/map.ts';
import PathManager from '../../../utils/path-manager.ts';
import type { Feature, Mission_Create } from '../../../types.ts';

/** Folder that holds one sub-folder per plan */
export const PLAN_ROOT = '/Planung';

const KV_KEY = 'planning-path';

export type PlanDialog = 'start' | 'share' | 'end' | null;

export const planning = reactive<{
    /** Folder of the open plan, null when not planning */
    path: string | null;
    /** Objects in the open plan */
    count: number;
    dialog: PlanDialog;
}>({
    path: null,
    count: 0,
    dialog: null,
});

/** Folder of a plan name: /Planung/<name>, a slash in the name would nest it */
export function planPath(name: string): string {
    const clean = name.replace(/\//g, '-').replace(/\s+/g, ' ').trim();
    return PathManager.normalize(`${PLAN_ROOT}/${clean || defaultPlanName()}`);
}

export function planName(path: string): string {
    return PathManager.displayName(path);
}

/** "Plan 27.11. 14:05" */
export function defaultPlanName(now = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `Plan ${pad(now.getDate())}.${pad(now.getMonth() + 1)}. ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isPlanPath(path: string | undefined): boolean {
    if (!path) return false;
    return PathManager.normalize(path).startsWith(`${PLAN_ROOT}/`);
}

/** Tell the worker and remember the open plan on this device */
async function apply(): Promise<void> {
    const mapStore = useMapStore();
    await mapStore.worker.db.setPlan(planning.path ?? undefined);

    if (planning.path) {
        await KV.update(KV_KEY, planning.path);
    } else {
        await KV.delete(KV_KEY);
    }

    await refreshCount();
}

/** Reopen the plan that was open before a reload */
export async function loadPlanning(): Promise<void> {
    const stored = await KV.value(KV_KEY);
    planning.path = stored && isPlanPath(stored) ? PathManager.normalize(stored) : null;
    await apply();
}

export async function startPlan(name: string): Promise<void> {
    planning.path = planPath(name);
    planning.dialog = null;
    await apply();
}

export async function resumePlan(path: string): Promise<void> {
    planning.path = PathManager.normalize(path);
    planning.dialog = null;
    await apply();
}

/** Leave planning mode - the objects stay in their folder */
export async function endPlan(): Promise<void> {
    planning.path = null;
    planning.dialog = null;
    await apply();
}

/** Plans this user has drawn so far, with their number of objects */
export async function listPlans(): Promise<Array<{ path: string; name: string; count: number }>> {
    const mapStore = useMapStore();
    const paths = await mapStore.worker.db.paths();

    return paths
        .filter((p) => isPlanPath(p.path) && PathManager.parentPath(p.path) === PLAN_ROOT)
        .map((p) => ({ path: p.path, name: planName(p.path), count: p.count }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** The objects of a plan as features */
export async function planFeatures(path = planning.path): Promise<Feature[]> {
    if (!path) return [];

    const mapStore = useMapStore();
    const cots = await mapStore.worker.db.pathFeatures(path);

    return Array.from(cots).map((cot) => cot.as_feature({ clone: true }));
}

export async function refreshCount(): Promise<void> {
    if (!planning.path) {
        planning.count = 0;
        return;
    }

    const mapStore = useMapStore();
    planning.count = (await mapStore.worker.db.pathFeatures(planning.path)).size;
}

/**
 * Move every object of the open plan into a Data Sync - they leave the plan
 * and planning mode ends. Returns the number of objects published
 */
export async function publishToMission(guid: string): Promise<number> {
    const mapStore = useMapStore();
    const feats = await planFeatures();

    for (const original of feats) {
        const feat = JSON.parse(JSON.stringify(original)) as Feature;

        await mapStore.worker.db.remove(feat.id);

        // Missions should never share ids with personal objects
        const id = randomUUID();
        feat.id = id;
        feat.properties.id = id;
        feat.properties.uid = id;
        feat.path = '/';
        feat.origin = { mode: OriginMode.MISSION, mode_id: guid };

        await mapStore.worker.db.add(feat, { authored: true });
    }

    await endPlan();
    await mapStore.refresh();

    return feats.length;
}

/**
 * Keep the open plan as a data package on the TAK Server - a snapshot for
 * ATAK or for later. The plan itself is not changed
 */
export async function savePackage(name: string, groups: string[]): Promise<void> {
    const feats = await planFeatures();

    const res = await server.PUT('/api/marti/package', {
        body: {
            type: 'FeatureCollection',
            name,
            public: true,
            groups,
            keywords: [],
            assets: [],
            basemaps: [],
            destinations: [],
            features: feats.map((f) => ({ id: f.properties.id || f.id, type: f.type, properties: f.properties, geometry: f.geometry })),
        }
    });

    if (res.error) throw new Error(res.error.message);
}

/**
 * Create a new Data Sync for the open plan and move the plan into it - with
 * a data package of the plan first when asked. Returns the new Mission guid
 */
export async function publishToNewMission(opts: {
    name: string;
    groups: string[];
    password?: string;
    withPackage: boolean;
}): Promise<string> {
    // The package reads the objects while they are still in the plan; a
    // failure here stops before anything is created or moved
    if (opts.withPackage) await savePackage(opts.name, opts.groups);

    const body: Mission_Create = {
        name: opts.name,
        group: opts.groups,
        description: '',
        keywords: [],
        defaultRole: 'MISSION_SUBSCRIBER',
    };
    if (opts.password) body.password = opts.password;

    const res = await server.POST('/api/marti/mission', { body });
    if (res.error) throw new Error(res.error.message);

    // Subscribes and loads the Data Sync onto the map - the plan can then move in
    await OverlayManager.createLoaded({
        name: res.data.name,
        url: `/mission/${encodeURIComponent(res.data.guid)}`,
        type: 'geojson',
        mode: 'mission',
        token: res.data.token,
        mode_id: res.data.guid,
    });

    await publishToMission(res.data.guid);

    return res.data.guid;
}

/** Delete every object of the open plan and leave planning mode */
export async function discardPlan(): Promise<void> {
    const mapStore = useMapStore();

    for (const feat of await planFeatures()) {
        await mapStore.worker.db.remove(feat.id);
    }

    await endPlan();
    await mapStore.refresh();
}
