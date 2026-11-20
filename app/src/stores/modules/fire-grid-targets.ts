import type { useMapStore } from '../map.ts';
import FireGrids from '../../base/fire-grids.ts';
import { missionHolding, type FireGridTargetHost } from '../../base/fire-grid-targets.ts';
import { FeatureVisibility } from './feature-visibility.ts';

/**
 * The targets of the fire grids on the map: local features in the map
 * database, shown and hidden with the per-feature visibility of this device.
 */
export function mapTargetHost(mapStore: ReturnType<typeof useMapStore>): FireGridTargetHost {
    return {
        put: async (feature) => {
            // Not authored: an authored new feature is filed into the active
            // mission and published there. The mission lookup is skipped as the
            // caller has ruled out a mission feature with this UID (missionHolding).
            await mapStore.worker.db.add(feature, { skipMissionLookup: true });
        },
        remove: async (uid) => {
            await mapStore.worker.db.remove(uid, { mission: false });
        },
        has: async (uid) => await mapStore.worker.db.has(uid),
        mission: missionHolding,
        setHidden: (uids, hidden) => {
            FeatureVisibility.setFeaturesHidden(uids, hidden);
        }
    };
}

/** The target host of the fire grids, set up once the map runs */
export function useFireGridTargets(mapStore: ReturnType<typeof useMapStore>): FireGridTargetHost {
    if (!FireGrids.targetHost) FireGrids.targetHost = mapTargetHost(mapStore);
    return FireGrids.targetHost;
}
