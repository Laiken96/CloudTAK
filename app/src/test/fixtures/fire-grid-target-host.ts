import { vi } from 'vitest';
import type { FireGridTargetHost, FireGridTargetMission } from '../../base/fire-grid-targets.ts';
import type { EfpTargetFeature } from '../../utils/efp-package.ts';

/**
 * Target host of the fire grids for tests: local features by UID, the
 * features of subscribed missions by UID, and the hidden UIDs of the map.
 */
export function fakeTargetHost(): FireGridTargetHost & {
    features: Map<string, EfpTargetFeature>;
    missions: Map<string, FireGridTargetMission>;
    hidden: Set<string>;
} {
    const features = new Map<string, EfpTargetFeature>();
    const missions = new Map<string, FireGridTargetMission>();
    const hidden = new Set<string>();

    return {
        features,
        missions,
        hidden,
        put: vi.fn(async (feature: EfpTargetFeature) => {
            features.set(feature.id, feature);
        }),
        remove: vi.fn(async (uid: string) => {
            features.delete(uid);
        }),
        has: vi.fn(async (uid: string) => features.has(uid)),
        mission: vi.fn(async (uid: string) => missions.get(uid) ?? null),
        setHidden: vi.fn((uids: string[], value: boolean) => {
            for (const uid of uids) {
                if (value) hidden.add(uid);
                else hidden.delete(uid);
            }
        })
    };
}
