/**
 * Grid lines as ATAK draws them (`com.atakmap.android.gridlines`, ATAK-CIV
 * 5.5.1.10): an MGRS grid, or a latitude/longitude graticule in decimal
 * degrees or in degrees, minutes and seconds, in white, magenta, green or
 * yellow.
 *
 * MGRS shows the grid zone boundaries, the 100 km squares and the finest of
 * the 10 km, 1 km and 100 m lines that are still far enough apart on screen.
 * As in ATAK, a line carries its MGRS digits where it enters the screen at the
 * top or left edge (`53` is the 1 km line 53 of its square, as written in
 * `32T LT 53 56`), and each 100 km square carries its zone and letters.
 *
 * UTM uses the Krüger series to n³ on WGS84 (accurate to about a millimetre
 * within a zone), so the lines agree with the MGRS coordinates CloudTAK shows.
 */

export type LngLat = [number, number];

export interface Bounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

export type GridType = 'MGRS' | 'Decimal Degrees' | 'Degrees, Minutes, Seconds';

/** The grid types of ATAK's grid line preferences */
export const GRID_TYPES: GridType[] = ['MGRS', 'Decimal Degrees', 'Degrees, Minutes, Seconds'];

/** The grid colours of ATAK's grid line preferences (white is ATAK's default) */
export const GRID_COLORS: Array<{ name: string; value: string }> = [
    { name: 'White', value: '#ffffff' },
    { name: 'Magenta', value: '#ff00ff' },
    { name: 'Green', value: '#00ff00' },
    { name: 'Yellow', value: '#ffff00' }
];

/* ---------------------------------------------------------------- UTM ---- */

const RAD = Math.PI / 180;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;

const n = WGS84_F / (2 - WGS84_F);
const RECTIFYING = WGS84_A / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64);
const ECC = 2 * Math.sqrt(n) / (1 + n);

const ALPHA = [n / 2 - 2 * n ** 2 / 3 + 5 * n ** 3 / 16, 13 * n ** 2 / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
const BETA = [n / 2 - 2 * n ** 2 / 3 + 37 * n ** 3 / 96, n ** 2 / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
const DELTA = [2 * n - 2 * n ** 2 / 3 - 2 * n ** 3, 7 * n ** 2 / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];

export interface Utm {
    zone: number;
    north: boolean;
    easting: number;
    northing: number;
}

export function centralMeridian(zone: number): number {
    return 6 * zone - 183;
}

/** UTM zone of a position, with the exceptions for Norway (32V) and Svalbard (31X to 37X) */
export function utmZone([lng, lat]: LngLat): number {
    const x = ((lng + 180) % 360 + 360) % 360 - 180;

    if (lat >= 56 && lat < 64 && x >= 3 && x < 12) return 32;

    if (lat >= 72 && lat <= 84 && x >= 0) {
        if (x < 9) return 31;
        if (x < 21) return 33;
        if (x < 33) return 35;
        if (x < 42) return 37;
    }

    return Math.floor((x + 180) / 6) % 60 + 1;
}

/**
 * UTM coordinates of a position, in the given zone (default: its own) and on
 * the given side of the equator (default: its own)
 */
export function toUtm([lng, lat]: LngLat, zone = utmZone([lng, lat]), north = lat >= 0): Utm {
    const φ = lat * RAD;
    const λ = (lng - centralMeridian(zone)) * RAD;

    const t = Math.sinh(Math.atanh(Math.sin(φ)) - ECC * Math.atanh(ECC * Math.sin(φ)));
    const ξ1 = Math.atan2(t, Math.cos(λ));
    const η1 = Math.atanh(Math.sin(λ) / Math.sqrt(1 + t * t));

    let ξ = ξ1, η = η1;
    for (let j = 1; j <= 3; j++) {
        ξ += ALPHA[j - 1] * Math.sin(2 * j * ξ1) * Math.cosh(2 * j * η1);
        η += ALPHA[j - 1] * Math.cos(2 * j * ξ1) * Math.sinh(2 * j * η1);
    }

    return {
        zone,
        north,
        easting: FALSE_EASTING + K0 * RECTIFYING * η,
        northing: (north ? 0 : FALSE_NORTHING_SOUTH) + K0 * RECTIFYING * ξ
    };
}

export function fromUtm({ zone, north, easting, northing }: Utm): LngLat {
    const ξ = (northing - (north ? 0 : FALSE_NORTHING_SOUTH)) / (K0 * RECTIFYING);
    const η = (easting - FALSE_EASTING) / (K0 * RECTIFYING);

    let ξ1 = ξ, η1 = η;
    for (let j = 1; j <= 3; j++) {
        ξ1 -= BETA[j - 1] * Math.sin(2 * j * ξ) * Math.cosh(2 * j * η);
        η1 -= BETA[j - 1] * Math.cos(2 * j * ξ) * Math.sinh(2 * j * η);
    }

    const χ = Math.asin(Math.sin(ξ1) / Math.cosh(η1));
    let φ = χ;
    for (let j = 1; j <= 3; j++) φ += DELTA[j - 1] * Math.sin(2 * j * χ);

    return [centralMeridian(zone) + Math.atan2(Math.sinh(η1), Math.cos(ξ1)) / RAD, φ / RAD];
}

/* -------------------------------------------------------- MGRS layout ---- */

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const COLUMN_LETTERS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUV';

/** Latitude band letter, null outside MGRS's -80° to 84° */
export function latBand(lat: number): string | null {
    if (lat < -80 || lat > 84) return null;
    return BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
}

/** Letters of the 100 km square that holds a UTM position, `LT` */
export function squareId(zone: number, easting: number, northing: number): string {
    const column = COLUMN_LETTERS[(zone - 1) % 3][Math.floor(easting / 100000) - 1];
    const row = ROW_LETTERS[(Math.floor(northing / 100000) + (zone % 2 === 0 ? 5 : 0)) % 20];
    return column && row ? column + row : '';
}

/** A grid zone designation cell: a UTM zone within one latitude band */
export interface GridZone extends Bounds {
    zone: number;
    band: string;
}

const bandZoneCache = new Map<string, Array<[number, number, number]>>();

/** [zone, west, east] of every zone in a band */
function bandZones(band: string): Array<[number, number, number]> {
    const cached = bandZoneCache.get(band);
    if (cached) return cached;

    let zones: Array<[number, number, number]> = [];
    for (let z = 1; z <= 60; z++) zones.push([z, -186 + 6 * z, -180 + 6 * z]);

    if (band === 'V') {
        zones = zones.map(([z, w, e]): [number, number, number] => z === 31 ? [31, 0, 3] : z === 32 ? [32, 3, 12] : [z, w, e]);
    } else if (band === 'X') {
        const svalbard: Record<number, [number, number]> = { 31: [0, 9], 33: [9, 21], 35: [21, 33], 37: [33, 42] };
        zones = zones
            .filter(([z]) => ![32, 34, 36].includes(z))
            .map(([z, w, e]): [number, number, number] => svalbard[z] ? [z, ...svalbard[z]] : [z, w, e]);
    }

    bandZoneCache.set(band, zones);
    return zones;
}

/** Grid zone cells that overlap an area */
export function gridZones(b: Bounds): GridZone[] {
    const list: GridZone[] = [];

    for (let i = 0; i < 20; i++) {
        const south = -80 + 8 * i;
        const north = i === 19 ? 84 : south + 8;
        if (north <= b.south || south >= b.north) continue;

        const band = BANDS[i];
        for (const [zone, west, east] of bandZones(band)) {
            if (east <= b.west || west >= b.east) continue;
            list.push({ zone, band, west, east, south, north });
        }
    }

    return list;
}

/* ------------------------------------------------------------ levels ---- */

/** Closest two grid lines may come on screen before the next coarser level is used [px] */
const MIN_LINE_PX = 40;

/** Ground metres per screen pixel of a MapLibre map (512 px tiles) */
export function metersPerPixel(zoom: number, lat: number): number {
    return 40075016.686 * Math.cos(lat * RAD) / (512 * 2 ** zoom);
}

/**
 * Finest MGRS level to draw [m]: 100 m, 1 km, 10 km or 100 km, the first
 * whose lines stay at least 40 px apart. Null when even the 100 km squares
 * are too small and only the grid zones are drawn.
 */
export function mgrsLevel(mpp: number): number | null {
    for (const level of [100, 1000, 10000, 100000]) {
        if (level / mpp >= MIN_LINE_PX) return level;
    }
    return 100000 / mpp >= MIN_LINE_PX / 2 ? 100000 : null;
}

/** Whether 100 km squares are large enough on screen to carry their letters */
export function mgrsSquareLabels(mpp: number): boolean {
    return 100000 / mpp >= 2 * MIN_LINE_PX;
}

/** MGRS digits of a grid line at a level: `5` (10 km), `53` (1 km), `534` (100 m) */
export function lineDigits(value: number, level: number): string {
    const digits = level >= 100000 ? 0 : 5 - Math.round(Math.log10(level));
    if (digits <= 0) return '';

    const inSquare = ((Math.round(value) % 100000) + 100000) % 100000;
    return String(Math.floor(inSquare / level)).padStart(digits, '0');
}

/* ---------------------------------------------------------- geometry ---- */

export type GridLineKind = 'zone' | 'square' | 'line';

export interface GridLine {
    coords: LngLat[];
    kind: GridLineKind;
    /** e: a line of constant easting or longitude, n: of constant northing or latitude */
    axis: 'e' | 'n';
    /** Edge label, if the line carries one */
    label?: string;
}

export interface GridLabel {
    at: LngLat;
    text: string;
    kind: 'zone' | 'square';
}

export interface Grid {
    lines: GridLine[];
    labels: GridLabel[];
}

/** Most lines drawn for one level in one grid zone, against runaway counts on a pitched map */
const MAX_LINES = 400;

/** Clip the segment a-b to a box (Liang-Barsky), null if it misses */
function clipSegment(a: LngLat, b: LngLat, box: Bounds): [LngLat, LngLat] | null {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;

    const checks: Array<[number, number]> = [
        [-dx, a[0] - box.west],
        [dx, box.east - a[0]],
        [-dy, a[1] - box.south],
        [dy, box.north - a[1]]
    ];

    for (const [p, q] of checks) {
        if (p === 0) {
            if (q < 0) return null;
        } else {
            const r = q / p;
            if (p < 0) {
                if (r > t1) return null;
                if (r > t0) t0 = r;
            } else {
                if (r < t0) return null;
                if (r < t1) t1 = r;
            }
        }
    }

    return [
        t0 === 0 ? a : [a[0] + t0 * dx, a[1] + t0 * dy],
        t1 === 1 ? b : [a[0] + t1 * dx, a[1] + t1 * dy]
    ];
}

/** The parts of a polyline inside a box */
export function clipLine(coords: LngLat[], box: Bounds): LngLat[][] {
    const runs: LngLat[][] = [];
    let run: LngLat[] = [];

    for (let i = 0; i < coords.length - 1; i++) {
        const seg = clipSegment(coords[i], coords[i + 1], box);

        if (!seg) {
            if (run.length > 1) runs.push(run);
            run = [];
            continue;
        }

        const [p, q] = seg;
        const last = run[run.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) {
            if (run.length > 1) runs.push(run);
            run = [p];
        }

        run.push(q);
    }

    if (run.length > 1) runs.push(run);
    return runs;
}

function intersect(a: Bounds, b: Bounds): Bounds | null {
    const box = {
        west: Math.max(a.west, b.west),
        south: Math.max(a.south, b.south),
        east: Math.min(a.east, b.east),
        north: Math.min(a.north, b.north)
    };
    return box.west < box.east && box.south < box.north ? box : null;
}

function inside([lng, lat]: LngLat, b: Bounds): boolean {
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

/** Clamp a map view to the part of the world a grid can cover */
export function clampBounds(b: Bounds, minLat: number, maxLat: number): Bounds | null {
    return intersect(b, { west: -180, east: 180, south: minLat, north: maxLat });
}

/** Grow a box by a share of its size on every side */
export function padBounds(b: Bounds, share: number): Bounds {
    const dx = (b.east - b.west) * share, dy = (b.north - b.south) * share;
    return { west: b.west - dx, south: b.south - dy, east: b.east + dx, north: b.north + dy };
}

/** UTM extent of a box in one zone, from points along its edges */
function utmExtent(box: Bounds, zone: number, north: boolean): { minE: number; maxE: number; minN: number; maxN: number } {
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    const steps = 8;

    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const lng = box.west + (box.east - box.west) * f;
        const lat = box.south + (box.north - box.south) * f;

        for (const p of [[lng, box.south], [lng, box.north], [box.west, lat], [box.east, lat]] as LngLat[]) {
            const u = toUtm(p, zone, north);
            minE = Math.min(minE, u.easting);
            maxE = Math.max(maxE, u.easting);
            minN = Math.min(minN, u.northing);
            maxN = Math.max(maxN, u.northing);
        }
    }

    return { minE, maxE, minN, maxN };
}

/** Points along a UTM line, close enough together to follow its curve on the map */
function utmLine(zone: number, north: boolean, axis: 'e' | 'n', value: number, from: number, to: number): LngLat[] {
    const count = Math.min(64, Math.max(1, Math.ceil((to - from) / 5000)));
    const coords: LngLat[] = [];

    for (let i = 0; i <= count; i++) {
        const along = from + (to - from) * i / count;
        coords.push(fromUtm(axis === 'e'
            ? { zone, north, easting: value, northing: along }
            : { zone, north, easting: along, northing: value }));
    }

    return coords;
}

/** Edges of the grid zone cells inside the view, each drawn once */
function zoneBoundaries(zones: GridZone[], view: Bounds): GridLine[] {
    const seen = new Set<string>();
    const lines: GridLine[] = [];

    for (const z of zones) {
        const edges: Array<[LngLat, LngLat, 'e' | 'n']> = [
            [[z.west, z.south], [z.west, z.north], 'e'],
            [[z.east, z.south], [z.east, z.north], 'e'],
            [[z.west, z.south], [z.east, z.south], 'n'],
            [[z.west, z.north], [z.east, z.north], 'n']
        ];

        for (const [a, b, axis] of edges) {
            const key = `${a[0]},${a[1]},${b[0]},${b[1]}`;
            if (seen.has(key)) continue;
            seen.add(key);

            for (const coords of clipLine([a, b], view)) lines.push({ coords, kind: 'zone', axis });
        }
    }

    return lines;
}

/**
 * The MGRS grid for a map view: grid zone boundaries, 100 km squares and the
 * finest level that fits (see mgrsLevel), with zone and square labels placed on
 * the map. Line labels go on the screen edges, see edgeLabels().
 *
 * @param view - area to cover, usually the visible map grown a little
 * @param mpp  - ground metres per screen pixel
 */
export function mgrsGrid(view: Bounds, mpp: number): Grid {
    const area = clampBounds(view, -80, 84);
    if (!area) return { lines: [], labels: [] };

    const zones = gridZones(area);
    const lines = zoneBoundaries(zones, area);
    const labels: GridLabel[] = [];

    const level = mgrsLevel(mpp);
    const squareLabels = mgrsSquareLabels(mpp);

    for (const z of zones) {
        const box = intersect(z, area);
        if (!box) continue;

        // Zone names while the squares are too small to carry their own
        if (level === null || !squareLabels) {
            labels.push({ at: [(box.west + box.east) / 2, (box.south + box.north) / 2], text: `${z.zone}${z.band}`, kind: 'zone' });
        }

        if (level === null) continue;

        const north = z.band >= 'N';
        const ext = utmExtent(box, z.zone, north);
        const zoneExt = utmExtent(z, z.zone, north);

        for (const step of level === 100000 ? [100000] : [100000, level]) {
            const kind: GridLineKind = step === 100000 ? 'square' : 'line';
            const first = { e: Math.ceil(ext.minE / step), n: Math.ceil(ext.minN / step) };
            const last = { e: Math.floor(ext.maxE / step), n: Math.floor(ext.maxN / step) };

            if ((last.e - first.e) + (last.n - first.n) > MAX_LINES) continue;

            for (const axis of ['e', 'n'] as const) {
                for (let k = first[axis]; k <= last[axis]; k++) {
                    const value = k * step;
                    // The 100 km lines are drawn once, as squares
                    if (kind === 'line' && value % 100000 === 0) continue;

                    const coords = axis === 'e'
                        ? utmLine(z.zone, north, 'e', value, ext.minN, ext.maxN)
                        : utmLine(z.zone, north, 'n', value, ext.minE, ext.maxE);

                    const label = level < 100000 ? lineDigits(value, level) : undefined;

                    for (const run of clipLine(coords, box)) {
                        lines.push({ coords: run, kind, axis, ...(label ? { label } : {}) });
                    }
                }
            }
        }

        if (!squareLabels) continue;

        // Square letters in the lower left corner of the square (cut to its grid zone); a square
        // larger than the screen is named in the screen corner instead, see squareCornerLabel()
        const inset = 10 * mpp;
        for (let e = Math.floor(ext.minE / 100000) * 100000; e < ext.maxE; e += 100000) {
            for (let nn = Math.floor(ext.minN / 100000) * 100000; nn < ext.maxN; nn += 100000) {
                const id = squareId(z.zone, e + 1, nn + 1);
                if (!id) continue;

                const at = fromUtm({
                    zone: z.zone,
                    north,
                    easting: Math.max(e, zoneExt.minE) + inset,
                    northing: Math.max(nn, zoneExt.minN) + inset
                });

                const u = toUtm(at, z.zone, north);
                if (u.easting >= e + 100000 || u.northing >= nn + 100000) continue;
                if (!inside(at, box) || !inside(at, z)) continue;

                labels.push({ at, text: `${z.zone}${z.band} ${id}`, kind: 'square' });
            }
        }
    }

    return { lines, labels };
}

/* --------------------------------------------------------- graticule ---- */

const DD_STEPS = [30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001];
const DMS_STEPS = [30, 20, 10, 5, 2, 1, 30 / 60, 20 / 60, 10 / 60, 5 / 60, 2 / 60, 1 / 60,
    30 / 3600, 20 / 3600, 10 / 3600, 5 / 3600, 2 / 3600, 1 / 3600];

/** Spacing of the graticule [degrees]: the finest round step whose meridians stay 40 px apart */
export function graticuleStep(type: GridType, mpp: number, lat: number): number {
    const steps = type === 'Degrees, Minutes, Seconds' ? DMS_STEPS : DD_STEPS;
    const metresPerDegree = 111320 * Math.max(0.05, Math.cos(lat * RAD));

    for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i] * metresPerDegree / mpp >= MIN_LINE_PX) return steps[i];
    }

    return steps[0];
}

/** `47.45°N`, `7.05°E` or, in DMS, `47°27'00"N` at the precision the step needs */
export function formatDegrees(value: number, axis: 'lat' | 'lng', type: GridType, step: number): string {
    const hemisphere = value === 0 ? '' : axis === 'lat' ? (value > 0 ? 'N' : 'S') : (value > 0 ? 'E' : 'W');
    const abs = Math.abs(value);

    if (type !== 'Degrees, Minutes, Seconds') {
        const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);
        return `${abs.toFixed(decimals)}°${hemisphere}`;
    }

    const total = Math.round(abs * 3600);
    const d = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = total % 60;
    const pad = (v: number) => String(v).padStart(2, '0');

    if (step >= 1) return `${d}°${hemisphere}`;
    if (step >= 1 / 60 - 1e-12) return `${d}°${pad(m)}'${hemisphere}`;
    return `${d}°${pad(m)}'${pad(s)}"${hemisphere}`;
}

/** Meridians and parallels at a step, each labelled with its degrees */
export function graticule(view: Bounds, type: GridType, step: number): Grid {
    const area = clampBounds(view, -85, 85);
    if (!area) return { lines: [], labels: [] };

    const lines: GridLine[] = [];
    const first = { lng: Math.ceil(area.west / step - 1e-9), lat: Math.ceil(area.south / step - 1e-9) };
    const last = { lng: Math.floor(area.east / step + 1e-9), lat: Math.floor(area.north / step + 1e-9) };

    if ((last.lng - first.lng) + (last.lat - first.lat) > MAX_LINES) return { lines: [], labels: [] };

    for (let k = first.lng; k <= last.lng; k++) {
        const lng = k * step;
        lines.push({
            coords: [[lng, area.south], [lng, area.north]],
            kind: k === 0 ? 'zone' : 'line',
            axis: 'e',
            label: formatDegrees(lng, 'lng', type, step)
        });
    }

    for (let k = first.lat; k <= last.lat; k++) {
        const lat = k * step;
        lines.push({
            coords: [[area.west, lat], [area.east, lat]],
            kind: k === 0 ? 'zone' : 'line',
            axis: 'n',
            label: formatDegrees(lat, 'lat', type, step)
        });
    }

    return { lines, labels: [] };
}

/* ------------------------------------------------------- edge labels ---- */

export interface EdgeLabel {
    at: LngLat;
    text: string;
    anchor: 'top' | 'left' | 'bottom-left';
}

/** Room kept free in the top left corner, where the two label rows meet, and in the lower
 * left corner, where the square is named (squareCornerLabel) [px] */
const CORNER_PX = 28;

/**
 * Where labelled lines enter the screen: lines of constant easting or
 * longitude at the top edge, the others at the left edge (each falls back to
 * the other edge on a rotated map), as ATAK places its floating labels
 *
 * @param project   - map position to screen pixel
 * @param unproject - screen pixel to map position
 * @param inset     - distance of the labels from the edge [px]
 */
export function edgeLabels(
    lines: GridLine[],
    project: (p: LngLat) => [number, number],
    unproject: (xy: [number, number]) => LngLat,
    width: number,
    height: number,
    inset = 3
): EdgeLabel[] {
    const labels: EdgeLabel[] = [];

    const crossing = (pts: Array<[number, number]>, edge: 'top' | 'left'): number | null => {
        const i = edge === 'top' ? 1 : 0;
        const along = edge === 'top' ? 0 : 1;
        const max = edge === 'top' ? width - inset : height - CORNER_PX;

        for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k], b = pts[k + 1];
            if ((a[i] > 0) === (b[i] > 0) || a[i] === b[i]) continue;

            const t = (0 - a[i]) / (b[i] - a[i]);
            const pos = a[along] + t * (b[along] - a[along]);
            if (pos >= CORNER_PX && pos <= max) return pos;
        }

        return null;
    };

    for (const line of lines) {
        if (!line.label) continue;

        const pts = line.coords.map(project);
        const order: Array<'top' | 'left'> = line.axis === 'e' ? ['top', 'left'] : ['left', 'top'];

        for (const edge of order) {
            const pos = crossing(pts, edge);
            if (pos === null) continue;

            labels.push({
                at: unproject(edge === 'top' ? [pos, inset] : [inset, pos]),
                text: line.label,
                anchor: edge
            });
            break;
        }
    }

    return labels;
}

/** Grid zone and 100 km square of a position, `32T LT`; null outside MGRS */
export function squareName(p: LngLat): string | null {
    const band = latBand(p[1]);
    if (!band) return null;

    const u = toUtm(p);
    const id = squareId(u.zone, u.easting, u.northing);
    return id ? `${u.zone}${band} ${id}` : null;
}

/**
 * Name of the square in the lower left screen corner, unless that square's
 * own label is on screen: zoomed in, a square is larger than the screen and its
 * corner, where its label sits, out of sight
 */
export function squareCornerLabel(
    labels: GridLabel[],
    project: (p: LngLat) => [number, number],
    unproject: (xy: [number, number]) => LngLat,
    width: number,
    height: number,
    inset = 6
): EdgeLabel | null {
    const at = unproject([inset, height - inset]);
    const name = squareName(at);
    if (!name) return null;

    for (const label of labels) {
        if (label.kind !== 'square' || label.text !== name) continue;

        const [x, y] = project(label.at);
        if (x >= 0 && x <= width && y >= 0 && y <= height) return null;
    }

    return { at, text: name, anchor: 'bottom-left' };
}
