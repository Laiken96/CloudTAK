/**
 * Point Target (Drawing Tools, artillery): name, object and LV95 readout of a
 * target set with one tap on the map - the tool is base/point-target-tool.ts.
 *
 * - Targets are named Z01, Z02 ...: one more than the highest number an object
 *   already carries as `Z<nr>` at the start of its callsign. The targets of an
 *   Einheitsfeuerplan (`Z03 D2/6`) count as well, so no name is doubled, and a
 *   gap is not filled: a number left out of a fire plan or still used in an
 *   order stays free
 * - A target is a spot marker (`b-m-p-s-m`) in the colour of the targets of the
 *   Einheitsfeuerplan (utils/efp-package.ts): CloudTAK draws it as a yellow
 *   point with its name, ATAK, iTAK and WinTAK as a Spot Map marker
 * - The coordinates are always LV95, whatever format is chosen elsewhere; out
 *   of the LV95 area there are none
 */
import { v4 as randomUUID } from 'uuid';
import type { Feature } from '../types.ts';
import { formatLv95, inSwitzerland, wgsToLv95 } from './lv95.ts';

/** [lng, lat] */
export type LngLat = [number, number];

export const POINT_TARGET_TYPE = 'b-m-p-s-m';

/** As the targets of the Einheitsfeuerplan */
export const POINT_TARGET_COLOR = '#FFD60A';

/**
 * `Z03`, `Z3`, `Z03 D2/6`, `z12a` - Z, the number (up to four digits) and no
 * further digit. `Zug 3`, `Z 3` or `Z12345` are no target names.
 */
const TARGET_NAME = /^\s*Z(\d{1,4})(?!\d)/i;

/** The number of a target name at the start of a callsign, null for none */
export function targetNumber(callsign: unknown): number | null {
    if (typeof callsign !== 'string') return null;

    const m = TARGET_NAME.exec(callsign);
    if (!m) return null;

    const n = Number(m[1]);
    return n > 0 ? n : null;
}

/** 1 -> `Z01`, 123 -> `Z123` */
export function targetName(n: number): string {
    return `Z${String(n).padStart(2, '0')}`;
}

/** The name of the next target: one past the highest target number in use */
export function nextTargetName(callsigns: Iterable<unknown>): string {
    let highest = 0;

    for (const callsign of callsigns) {
        const n = targetNumber(callsign);
        if (n !== null && n > highest) highest = n;
    }

    return targetName(highest + 1);
}

/** A new target as a point Feature - shaped like a drawn point, saved the same way */
export function pointTargetFeature(
    name: string,
    coord: LngLat,
    opts: { id?: string; now?: Date } = {}
): Feature {
    const id = opts.id ?? randomUUID();
    const now = opts.now ?? new Date();

    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            type: POINT_TARGET_TYPE,
            how: 'h-g-i-g-o',
            archived: true,
            callsign: name,
            time: now.toISOString(),
            start: now.toISOString(),
            stale: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            center: [coord[0], coord[1]],
            'marker-color': POINT_TARGET_COLOR,
            'marker-opacity': 1,
        },
        geometry: {
            type: 'Point',
            coordinates: [coord[0], coord[1]]
        }
    } as Feature;
}

export type Lv95Readout =
    | { inArea: true; E: number; N: number; /** `2 564 579 / 1 252 022` */ text: string }
    | { inArea: false };

/** LV95 of a position for display; none outside the area where LV95 is valid */
export function lv95Readout(coord: LngLat): Lv95Readout {
    const [lng, lat] = coord;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSwitzerland(lat, lng)) {
        return { inArea: false };
    }

    const [E, N] = wgsToLv95(lat, lng);
    return { inArea: true, E, N, text: formatLv95(E, N) };
}
