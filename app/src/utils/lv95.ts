/**
 * Swiss national grid LV95 (EPSG:2056) and its predecessor LV03 (EPSG:21781).
 *
 * LV95 <-> WGS84 uses the official swisstopo approximation (~1 m) with the same
 * exact inverse as the Einheitsfeuerplan of Pz Bat 12 (`s3-einheitsfeuerplan`),
 * so CloudTAK, its fire grids and the Einheitsfeuerplan show the same metres
 * for the same point.
 *
 * Pairs are written as in the Swiss Army and the Einheitsfeuerplan: easting
 * first, whole metres, digits in groups of three split by a thin space, the
 * pair split by a slash: `2 600 000 / 1 200 000`.
 */

/**
 * The window around Switzerland and Liechtenstein in which the approximation
 * is valid (covers Chancy as well as Samnaun), as in the Einheitsfeuerplan
 */
export const LV95_AREA = { latMin: 45.5, latMax: 48.1, lngMin: 5.5, lngMax: 11.0 } as const;

/** LV03 is LV95 without the leading 2 and 1 of the false origin */
const LV03_OFFSET = { E: 2000000, N: 1000000 } as const;

/** Splits groups of three digits on screen; never typed, so not confused with a separator */
const THIN_SPACE = '\u2009';

/** True if a WGS84 position lies in the LV95 window; false for NaN */
export function inSwitzerland(lat: number, lng: number): boolean {
    return lat >= LV95_AREA.latMin && lat <= LV95_AREA.latMax
        && lng >= LV95_AREA.lngMin && lng <= LV95_AREA.lngMax;
}

/** Round half to even, as the Einheitsfeuerplan shows LV95 metres (`12.5` -> `12`) */
export function bankersRound(x: number): number {
    const f = Math.floor(x), d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;
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

/** True if an LV95 point lies in the window where the conversion is valid */
export function lv95InArea(E: number, N: number): boolean {
    const [lat, lng] = lv95ToWgs(E, N);
    return inSwitzerland(lat, lng);
}

/** Drop the marks between groups of three digits: `2'570'958` or `2 570 958` -> `2570958` */
function ungroup(text: string): string {
    return text.trim().replace(/(\d)['’\u2009\u202f\u00a0 ](?=\d{3}(?!\d))/g, '$1');
}

const PAIR_SEPARATOR = String.raw`\s*(?:[,/;]|\s)\s*`;

/**
 * Read an LV95 coordinate pair as written on Swiss maps and lists:
 * `2570958 1255625`, `2 570 958 / 1 255 625`, `2'570'958, 1'255'625`.
 * Null if the text is no LV95 pair.
 */
export function parseLv95(text: string): [number, number] | null {
    const m = ungroup(text).match(new RegExp(String.raw`^E?\s*(2\d{6}(?:\.\d+)?)${PAIR_SEPARATOR}N?\s*(1\d{6}(?:\.\d+)?)\s*$`, 'i'));
    if (!m) return null;

    return [Number(m[1]), Number(m[2])];
}

/**
 * Read an LV03 pair (`600000 200000`, `600'000 / 200'000`) and return it in LV95.
 * Southern Ticino has five digit northings (`722000 77000`). Groups split by
 * spaces only need the slash or comma between the two numbers.
 * Null if the text is no LV03 pair.
 */
export function parseLv03(text: string): [number, number] | null {
    const m = ungroup(text).match(new RegExp(String.raw`^E?\s*([4-8]\d{5}(?:\.\d+)?)${PAIR_SEPARATOR}N?\s*(\d{5,6}(?:\.\d+)?)\s*$`, 'i'));
    if (!m) return null;

    return [Number(m[1]) + LV03_OFFSET.E, Number(m[2]) + LV03_OFFSET.N];
}

export type SwissGridPair = {
    /** The frame the text was written in */
    frame: 'lv95' | 'lv03';
    /** LV95 easting [m], also for LV03 input */
    E: number;
    /** LV95 northing [m], also for LV03 input */
    N: number;
};

/**
 * Read a Swiss grid pair, LV95 or LV03, in any notation of parseLv95/parseLv03.
 * Null if the text is no Swiss pair. Does not check the area: see lv95InArea.
 */
export function parseSwissGrid(text: string): SwissGridPair | null {
    const lv95 = parseLv95(text);
    if (lv95) return { frame: 'lv95', E: lv95[0], N: lv95[1] };

    const lv03 = parseLv03(text);
    if (lv03) return { frame: 'lv03', E: lv03[0], N: lv03[1] };

    return null;
}

/** `2 600 000 / 1 200 000`: whole metres for display, as the Einheitsfeuerplan */
export function formatLv95(E: number, N: number): string {
    return `${formatLv95Value(E)} / ${formatLv95Value(N)}`;
}

/**
 * `2 600 000`: one LV95 value in whole metres, digits grouped by thin spaces or
 * by the given separator (map labels use a plain space, whose glyph every map
 * font has)
 */
export function formatLv95Value(v: number, separator = THIN_SPACE): string {
    return String(bankersRound(v)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** `2600000 1200000`: the same whole metres without groups, to copy or type over */
export function formatLv95Plain(E: number, N: number): string {
    return `${bankersRound(E)} ${bankersRound(N)}`;
}
