/**
 * Fire grid (Gridded Reference Graphic) in the Swiss LV95 frame, as drawn by the
 * Einheitsfeuerplan of Pz Bat 12 (`s3-einheitsfeuerplan`, V1.3) so a cell named
 * in CloudTAK is the same cell on the Einheitsfeuerplan map and target list:
 *
 * - the grid is `ncols` x `nrows` square cells of `z` metres, its origin
 *   (`e0`, `n0`) is the north west corner in LV95
 * - columns are lettered from west to east without I and O (A..Z, then AA..),
 *   rows are numbered from north to south starting at 1
 * - each cell holds 3 x 3 fine fields numbered like a telephone keypad,
 *   1 in the north west, 9 in the south east: `D2/6` is spoken "Delta Two Six"
 *
 * LV95 <-> WGS84 uses the official swisstopo approximation (~1 m) with the same
 * exact inverse as the Einheitsfeuerplan, so a point maps to the cell drawn there.
 */

import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

export interface FireGridParams {
    /** LV95 easting of the north west corner [m] */
    e0: number;
    /** LV95 northing of the north west corner [m] */
    n0: number;
    /** Cell size [m], a divisor of 1000 */
    z: number;
    ncols: number;
    nrows: number;
}

/** A cell (`k` unset) or fine field (`k` 1..9) of a grid, 1-based */
export interface FireGridCell {
    i: number;
    j: number;
    k?: number;
}

export const FIRE_GRID_LIMITS = {
    minSize: 10,
    maxSize: 1000,
    maxCells: 80,
} as const;

/** Cell sizes the Einheitsfeuerplan accepts: divisors of 1000 m from 10 m up */
export const FIRE_GRID_SIZES = [10, 20, 25, 40, 50, 100, 125, 200, 250, 500, 1000] as const;

/** Grid of a new Einheitsfeuerplan */
export const FIRE_GRID_DEFAULTS: FireGridParams = { e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 };

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

const NATO: Record<string, string> = {
    A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
    G: 'Golf', H: 'Hotel', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November',
    P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor',
    W: 'Whiskey', X: 'X-Ray', Y: 'Yankee', Z: 'Zulu'
};

const DIGIT = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** The window around Switzerland in which the LV95 approximation is valid */
const CH_WINDOW = { latMin: 45.5, latMax: 48.1, lngMin: 5.5, lngMax: 11.0 };

/** Column 1 -> `A`, 24 -> `Z`, 25 -> `AA` */
export function colName(i: number): string {
    const n = LETTERS.length;
    if (i <= n) return LETTERS[i - 1];
    return LETTERS[Math.floor((i - 1) / n) - 1] + LETTERS[(i - 1) % n];
}

/** Inverse of colName, 1-based, -1 for a name that is no column */
export function colIndex(name: string): number {
    const a = LETTERS.indexOf(name.charAt(0));
    if (a < 0) return -1;
    if (name.length === 1) return a + 1;
    const b = LETTERS.indexOf(name.charAt(1));
    if (b < 0 || name.length > 2) return -1;
    return (a + 1) * LETTERS.length + b + 1;
}

/** `D2` or `D2/6` */
export function designation(cell: FireGridCell): string {
    return colName(cell.i) + cell.j + (cell.k ? '/' + cell.k : '');
}

/** `D2/6` -> `Delta Two Six` */
export function spoken(cell: FireGridCell): string {
    const parts: string[] = [];
    for (const c of colName(cell.i)) parts.push(NATO[c]);
    for (const d of String(cell.j)) parts.push(DIGIT[Number(d)]);
    if (cell.k) parts.push(DIGIT[cell.k]);
    return parts.join(' ');
}

/** Read `D2`, `d2/6` or `D 2 / 6`; null if the text is no designation */
export function parseDesignation(text: string): FireGridCell | null {
    const m = text.trim().toUpperCase().match(/^([A-Z]{1,2})\s*(\d{1,3})\s*(?:\/\s*([1-9]))?$/);
    if (!m) return null;

    const i = colIndex(m[1]);
    const j = parseInt(m[2], 10);
    if (i < 1 || j < 1) return null;

    return m[3] ? { i, j, k: Number(m[3]) } : { i, j };
}

/** True if the cell lies inside the grid */
export function inGrid(P: FireGridParams, cell: FireGridCell): boolean {
    return cell.i >= 1 && cell.i <= P.ncols && cell.j >= 1 && cell.j <= P.nrows
        && (cell.k === undefined || (cell.k >= 1 && cell.k <= 9));
}

/** Round half to even, as the Einheitsfeuerplan shows LV95 metres (`12.5` -> `12`) */
export function bankersRound(x: number): number {
    const f = Math.floor(x), d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
}

/** LV95 centre of a cell */
export function cellCenter(P: FireGridParams, i: number, j: number): [number, number] {
    return [P.e0 + (i - 0.5) * P.z, P.n0 - (j - 0.5) * P.z];
}

/** Offset of fine field 1..9 from its cell centre, telephone layout (1 = north west) */
export function keypadOffset(z: number, k: number): [number, number] {
    const t = z / 3, col = (k - 1) % 3, row = Math.floor((k - 1) / 3);
    return [(col - 1) * t, (1 - row) * t];
}

/** LV95 centre of a cell or fine field */
export function fireGridCenter(P: FireGridParams, cell: FireGridCell): [number, number] {
    const c = cellCenter(P, cell.i, cell.j);
    if (!cell.k) return c;

    const o = keypadOffset(P.z, cell.k);
    return [c[0] + o[0], c[1] + o[1]];
}

/** The cell and fine field holding an LV95 point, null outside the grid */
export function cellFromLv95(P: FireGridParams, E: number, N: number): Required<FireGridCell> | null {
    const x = (E - P.e0) / P.z, y = (P.n0 - N) / P.z;
    if (x < 0 || y < 0 || x >= P.ncols || y >= P.nrows) return null;

    const i = Math.floor(x) + 1, j = Math.floor(y) + 1;
    const col = Math.min(2, Math.floor((x - (i - 1)) * 3));
    const row = Math.min(2, Math.floor((y - (j - 1)) * 3));
    return { i, j, k: row * 3 + col + 1 };
}

export function inSwitzerland(lat: number, lng: number): boolean {
    return !(lat < CH_WINDOW.latMin || lat > CH_WINDOW.latMax || lng < CH_WINDOW.lngMin || lng > CH_WINDOW.lngMax);
}

/** LV95 -> [lat, lng], official swisstopo approximation (~1 m) */
export function lv95ToWgs(E: number, N: number): [number, number] {
    const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
    const lng = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
    const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
    return [lat * 100 / 36, lng * 100 / 36];
}

/** Official approximation of the other direction (~1 m), start value for wgsToLv95 */
function wgsToLv95Approx(lat: number, lng: number): [number, number] {
    const p = (lat * 3600 - 169028.66) / 10000, l = (lng * 3600 - 26782.5) / 10000;
    const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
    const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
    return [E, N];
}

/**
 * [lat, lng] -> LV95 as the exact inverse of lv95ToWgs (Newton steps), so a point
 * lands in the cell drawn from lv95ToWgs. Valid around Switzerland only.
 */
export function wgsToLv95(lat: number, lng: number): [number, number] {
    let c = wgsToLv95Approx(lat, lng);
    const h = 100;

    for (let it = 0; it < 2; it++) {
        const w0 = lv95ToWgs(c[0], c[1]);
        const wE = lv95ToWgs(c[0] + h, c[1]);
        const wN = lv95ToWgs(c[0], c[1] + h);
        const a = (wE[0] - w0[0]) / h, b = (wN[0] - w0[0]) / h;
        const d = (wE[1] - w0[1]) / h, e = (wN[1] - w0[1]) / h;
        const det = a * e - b * d;
        if (!det) break;

        const rLat = lat - w0[0], rLng = lng - w0[1];
        c = [c[0] + (e * rLat - b * rLng) / det, c[1] + (a * rLng - d * rLat) / det];
    }

    return c;
}

/** GeoJSON position [lng, lat] of an LV95 point */
export function lv95ToLngLat(E: number, N: number): [number, number] {
    const [lat, lng] = lv95ToWgs(E, N);
    return [lng, lat];
}

/** The cell and fine field at a GeoJSON position, null outside the grid or Switzerland */
export function cellAt(P: FireGridParams, lng: number, lat: number): Required<FireGridCell> | null {
    if (!inSwitzerland(lat, lng)) return null;
    const [E, N] = wgsToLv95(lat, lng);
    return cellFromLv95(P, E, N);
}

/** Problems with grid parameters, in the words of the Einheitsfeuerplan; empty if valid */
export function validateFireGrid(P: Partial<FireGridParams>): string[] {
    const errors: string[] = [];

    if (!Number.isFinite(P.e0) || !Number.isFinite(P.n0)) {
        errors.push('Origin is not a number');
    } else {
        const [lat, lng] = lv95ToWgs(P.e0 as number, P.n0 as number);
        if (!inSwitzerland(lat, lng)) errors.push('Origin lies outside Switzerland (LV95 E 2 4xx xxx-2 8xx xxx, N 1 0xx xxx-1 3xx xxx)');
    }

    const z = P.z as number;
    if (!(z >= FIRE_GRID_LIMITS.minSize && z <= FIRE_GRID_LIMITS.maxSize) || Math.abs(1000 / z - Math.round(1000 / z)) > 1e-9) {
        errors.push('Cell size must divide 1000 m (10 to 1000 m)');
    }

    for (const n of [P.ncols, P.nrows]) {
        if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > FIRE_GRID_LIMITS.maxCells) {
            errors.push(`Columns and rows: 1 to ${FIRE_GRID_LIMITS.maxCells}`);
            break;
        }
    }

    return errors;
}

/** The Einheitsfeuerplan link fragment of a grid: `e0=..&n0=..&z=..&c=..&r=..` */
export function fireGridHash(P: FireGridParams): string {
    return `e0=${P.e0}&n0=${P.n0}&z=${P.z}&c=${P.ncols}&r=${P.nrows}`;
}

/**
 * Read the grid of an Einheitsfeuerplan link (the whole link, or the part after `#`).
 * Null if the text holds no complete, valid grid.
 */
export function parseFireGridLink(text: string): FireGridParams | null {
    const raw = text.trim();
    const hash = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;

    const q: Record<string, number> = {};
    for (const part of hash.split('&')) {
        const [key, value] = part.split('=');
        if (!key || value === undefined || value.trim() === '') continue;
        q[key.trim()] = Number(value);
    }

    const P = { e0: q.e0, n0: q.n0, z: q.z, ncols: q.c, nrows: q.r };
    if (!Object.values(P).every((v) => Number.isFinite(v))) return null;
    if (validateFireGrid(P).length) return null;

    return P;
}

/** Grid of the same size with its centre near a point, origin on a whole kilometre */
export function fireGridAround(lng: number, lat: number, size: Pick<FireGridParams, 'z' | 'ncols' | 'nrows'>): FireGridParams {
    const [E, N] = wgsToLv95(lat, lng);
    return {
        e0: Math.round((E - size.ncols * size.z / 2) / 1000) * 1000,
        n0: Math.round((N + size.nrows * size.z / 2) / 1000) * 1000,
        z: size.z,
        ncols: size.ncols,
        nrows: size.nrows
    };
}

/** LV95 line through points, with a vertex at least every `step` metres */
function densify(from: [number, number], to: [number, number], step: number): Array<[number, number]> {
    const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
    const coords: Array<[number, number]> = [];

    for (let s = 0; s <= n; s++) {
        coords.push(lv95ToLngLat(from[0] + (to[0] - from[0]) * s / n, from[1] + (to[1] - from[1]) * s / n));
    }

    return coords;
}

/** Vertex spacing: a straight LV95 line bends in WGS84, 1 km keeps the error at centimetres */
const DENSIFY_STEP = 1000;

export type FireGridFeature = Feature<LineString | Point, {
    kind: 'frame' | 'line' | 'fine' | 'cell' | 'edge';
    label?: string;
}>;

/**
 * The grid as GeoJSON in WGS84: the frame, the cell lines, the fine field lines,
 * a label point at every cell centre and the column and row names along the edge
 */
export function fireGridGeoJSON(P: FireGridParams): FeatureCollection<LineString | Point, FireGridFeature['properties']> {
    const features: FireGridFeature[] = [];
    const east = P.e0 + P.ncols * P.z, south = P.n0 - P.nrows * P.z;

    const line = (kind: 'frame' | 'line' | 'fine', from: [number, number], to: [number, number]): void => {
        features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: densify(from, to, DENSIFY_STEP) } });
    };

    const point = (kind: 'cell' | 'edge', label: string, E: number, N: number): void => {
        features.push({ type: 'Feature', properties: { kind, label }, geometry: { type: 'Point', coordinates: lv95ToLngLat(E, N) } });
    };

    // Frame as one ring so it draws without gaps at the corners
    features.push({
        type: 'Feature',
        properties: { kind: 'frame' },
        geometry: {
            type: 'LineString',
            coordinates: [
                ...densify([P.e0, P.n0], [east, P.n0], DENSIFY_STEP),
                ...densify([east, P.n0], [east, south], DENSIFY_STEP).slice(1),
                ...densify([east, south], [P.e0, south], DENSIFY_STEP).slice(1),
                ...densify([P.e0, south], [P.e0, P.n0], DENSIFY_STEP).slice(1),
            ]
        }
    });

    for (let i = 1; i < P.ncols; i++) line('line', [P.e0 + i * P.z, P.n0], [P.e0 + i * P.z, south]);
    for (let j = 1; j < P.nrows; j++) line('line', [P.e0, P.n0 - j * P.z], [east, P.n0 - j * P.z]);

    const t = P.z / 3;
    for (let f = 1; f < P.ncols * 3; f++) {
        if (f % 3) line('fine', [P.e0 + f * t, P.n0], [P.e0 + f * t, south]);
    }
    for (let f = 1; f < P.nrows * 3; f++) {
        if (f % 3) line('fine', [P.e0, P.n0 - f * t], [east, P.n0 - f * t]);
    }

    for (let j = 1; j <= P.nrows; j++) {
        for (let i = 1; i <= P.ncols; i++) {
            const [E, N] = cellCenter(P, i, j);
            point('cell', designation({ i, j }), E, N);
        }
    }

    const margin = Math.min(P.z / 2, 150);
    for (let i = 1; i <= P.ncols; i++) {
        const E = P.e0 + (i - 0.5) * P.z;
        point('edge', colName(i), E, P.n0 + margin);
        point('edge', colName(i), E, south - margin);
    }
    for (let j = 1; j <= P.nrows; j++) {
        const N = P.n0 - (j - 0.5) * P.z;
        point('edge', String(j), P.e0 - margin, N);
        point('edge', String(j), east + margin, N);
    }

    return { type: 'FeatureCollection', features };
}

/** Outline of a cell or fine field as a WGS84 polygon */
export function fireGridCellPolygon(P: FireGridParams, cell: FireGridCell): Feature<Polygon, { label: string }> {
    const size = cell.k ? P.z / 3 : P.z;
    const [cE, cN] = fireGridCenter(P, cell);
    const w = cE - size / 2, e = cE + size / 2, n = cN + size / 2, s = cN - size / 2;

    return {
        type: 'Feature',
        properties: { label: designation(cell) },
        geometry: {
            type: 'Polygon',
            coordinates: [[
                lv95ToLngLat(w, n), lv95ToLngLat(e, n), lv95ToLngLat(e, s), lv95ToLngLat(w, s), lv95ToLngLat(w, n)
            ]]
        }
    };
}

/** [[west, south], [east, north]] of the grid in WGS84 */
export function fireGridBounds(P: FireGridParams): [[number, number], [number, number]] {
    const east = P.e0 + P.ncols * P.z, south = P.n0 - P.nrows * P.z;
    const corners = [lv95ToLngLat(P.e0, P.n0), lv95ToLngLat(east, P.n0), lv95ToLngLat(east, south), lv95ToLngLat(P.e0, south)];

    return [
        [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1]))],
        [Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))]
    ];
}

/**
 * Map zoom to show a cell or fine field: its whole cell about 240 px wide, so the
 * neighbouring cells stay in view and the map is not enlarged past its detail
 */
export function fireGridShowZoom(P: Pick<FireGridParams, 'z'>): number {
    return Math.min(17, Math.max(10, zoomForLength(P.z, 240)));
}

/**
 * Lowest map zoom at which a length of `metres` spans `pixels` on screen around
 * Swiss latitudes - used to show cell labels and fine lines only once they fit
 */
export function zoomForLength(metres: number, pixels: number): number {
    const metresPerPixelZ0 = 156543.03 * Math.cos(46.8 * Math.PI / 180);
    return Math.log2(pixels * metresPerPixelZ0 / metres);
}
