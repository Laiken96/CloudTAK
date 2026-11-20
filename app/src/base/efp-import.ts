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

    return { grid, gridAdded, targets, inMission };
}
