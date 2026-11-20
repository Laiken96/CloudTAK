import FireGrids, { type FireGrid } from './fire-grids.ts';
import type { FireGridTargetHost, FireGridTargetMission } from './fire-grid-targets.ts';
import { efpTargetFeature, type EfpPackage, type EfpTargetFeature } from '../utils/efp-package.ts';

/**
 * Import an Einheitsfeuerplan data package read by readEfpPackage: the grid as
 * a fire grid of this device (kept if the same grid is already there), the
 * targets as local features of this device that belong to the grid. They are
 * never filed into a mission nor sent to the TAK Server, and keep the UIDs of
 * the Einheitsfeuerplan, so importing the same file again updates the targets
 * instead of doubling them.
 *
 * A target whose UID is already in a subscribed mission (an import before the
 * targets belonged to the grid) is left there unchanged and reported: nothing
 * is deleted from a shared mission, and a local copy with the same UID would
 * shadow the mission feature (see missionHolding).
 */
export interface EfpImportResult {
    /** Null if the file holds no grid (Einheitsfeuerplan before V1.5) */
    grid: FireGrid | null;
    /** False if the same grid was already on this device */
    gridAdded: boolean;
    /** Targets stored as local features; they belong to the grid if there is one */
    targets: EfpTargetFeature[];
    /** Targets left alone because their UID is in a mission */
    inMission: EfpMissionTarget[];
    /** Targets of an older version of the same plan that this import replaced */
    replaced: number;
    /** A newer version of the same plan is on this device: nothing was imported */
    newerVersion: string | null;
}

export interface EfpMissionTarget {
    target: EfpTargetFeature;
    mission: FireGridTargetMission;
}

export async function importEfpPackage(
    pkg: EfpPackage,
    host: FireGridTargetHost
): Promise<EfpImportResult> {
    let grid: FireGrid | null = null;
    let gridAdded = false;

    // Every export of a plan gets new UIDs: a newer version replaces the
    // targets of an older one, an older version does not replace a newer one
    const { older, newer } = await boundVersions(pkg.uid);
    if (newer) {
        return { grid: null, gridAdded: false, targets: [], inMission: [], replaced: 0, newerVersion: newer };
    }

    if (pkg.grid) {
        const { name, e0, n0, z, ncols, nrows } = pkg.grid;
        const result = await FireGrids.ensure({ name, e0, n0, z, ncols, nrows });
        grid = result.grid;
        gridAdded = result.added;
    }

    const targets: EfpTargetFeature[] = [];
    const inMission: EfpMissionTarget[] = [];

    for (const feature of pkg.targets.map((t) => efpTargetFeature(pkg, t))) {
        const mission = await host.mission(feature.id);
        if (mission) {
            inMission.push({ target: feature, mission });
            continue;
        }

        await host.put(feature);
        targets.push(feature);
    }

    const uids = targets.map((t) => t.id);
    if (grid) {
        grid = await FireGrids.bindTargets(grid.id, uids);
    } else if (uids.length) {
        host.setHidden(uids, false);
    }

    // The targets of the older version go - only local features, a mission
    // feature with the same UID is left alone (see FireGridTargetHost.remove)
    if (older.length) {
        const drop = new Set(older);
        for (const uid of older) await host.remove(uid);
        host.setHidden(older, false);

        for (const g of [...FireGrids.state.grids]) {
            if (g.targets.some((uid) => drop.has(uid))) {
                const next = await FireGrids.update(g.id, { targets: g.targets.filter((uid) => !drop.has(uid)) });
                if (grid && next.id === grid.id) grid = next;
            }
        }
    }

    return { grid, gridAdded, targets, inMission, replaced: older.length, newerVersion: null };
}

/**
 * Plan and version of an Einheitsfeuerplan UID (package or target):
 * `EFP-MERKUR-Inf-Kp-10-1-v2611190830-Z03` → plan `EFP-MERKUR-Inf-Kp-10-1`,
 * version `2611190830` (export time JJMMTThhmm UTC, so it sorts in time)
 */
export function efpPlanVersion(uid: string): { plan: string; version: string } | null {
    const match = /^(EFP-\S+?)-v(\d{10})(?:-|$)/.exec(uid);
    return match ? { plan: match[1], version: match[2] } : null;
}

/** `2611190830` → `19.11.2026 08:30 UTC` */
export function efpVersionLabel(version: string): string {
    const [yy, mm, dd, hh, mi] = version.match(/\d\d/g) ?? [];
    return `${dd}.${mm}.20${yy} ${hh}:${mi} UTC`;
}

/**
 * Targets of other versions of the same plan that belong to a fire grid on
 * this device: the UIDs of older versions, and the newest newer version
 */
async function boundVersions(packageUid: string): Promise<{ older: string[]; newer: string | null }> {
    const current = efpPlanVersion(packageUid);
    if (!current) return { older: [], newer: null };

    await FireGrids.load();

    const older: string[] = [];
    let newer: string | null = null;

    for (const grid of FireGrids.state.grids) {
        for (const uid of grid.targets) {
            const other = efpPlanVersion(uid);
            if (!other || other.plan !== current.plan || other.version === current.version) continue;

            if (other.version > current.version) {
                if (!newer || other.version > newer) newer = other.version;
            } else {
                older.push(uid);
            }
        }
    }

    return { older, newer };
}
