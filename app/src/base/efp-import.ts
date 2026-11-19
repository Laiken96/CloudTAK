import FireGrids, { type FireGrid } from './fire-grids.ts';
import { efpTargetFeature, type EfpPackage, type EfpTargetFeature } from '../utils/efp-package.ts';

/**
 * Import an Einheitsfeuerplan data package read by readEfpPackage: the grid as
 * a fire grid of this device (kept if the same grid is already there), the
 * targets as map features. `add` stores a feature by its id, so importing the
 * same file again updates the targets instead of doubling them.
 */
export interface EfpImportResult {
    /** Null if the file holds no grid (Einheitsfeuerplan before V1.5) */
    grid: FireGrid | null;
    /** False if the same grid was already on this device */
    gridAdded: boolean;
    targets: EfpTargetFeature[];
}

export async function importEfpPackage(
    pkg: EfpPackage,
    add: (feature: EfpTargetFeature) => Promise<unknown>
): Promise<EfpImportResult> {
    let grid: FireGrid | null = null;
    let gridAdded = false;

    if (pkg.grid) {
        const { name, e0, n0, z, ncols, nrows } = pkg.grid;
        const result = await FireGrids.ensure({ name, e0, n0, z, ncols, nrows });
        grid = result.grid;
        gridAdded = result.added;
    }

    const targets = pkg.targets.map((t) => efpTargetFeature(pkg, t));
    for (const feature of targets) {
        await add(feature);
    }

    return { grid, gridAdded, targets };
}
