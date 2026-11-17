/**
 * Rubber sheets: an image (a situation sketch, a scanned map, a photo) laid on
 * the map by its four corners, as in ATAK (`com.atakmap.android.rubbersheet`,
 * ATAK-CIV 5.5.1.10). Corners can be moved freely; the whole sheet can be moved,
 * rotated and scaled, or georeferenced by two control points.
 *
 * Geometry works in Web Mercator metres: the projection is conformal, so a
 * rotation or a two point fit there keeps the image undistorted on the map.
 *
 * Exchange format is ATAK's: a KMZ with a GroundOverlay and a gx:LatLonQuad.
 */

export type LngLat = [number, number];

/** Corners in the order of a MapLibre image source: top left, top right, bottom right, bottom left */
export type Quad = [LngLat, LngLat, LngLat, LngLat];

/** Image pixel position, x to the right, y down */
export type Pixel = [number, number];

const R = 6378137;
const MAX_LAT = 85.0511287798;

export function toMercator([lng, lat]: LngLat): [number, number] {
    const φ = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
    return [R * lng * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + φ / 2))];
}

export function fromMercator([x, y]: [number, number]): LngLat {
    return [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI];
}

function mapQuad(q: Quad, fn: (xy: [number, number]) => [number, number]): Quad {
    return q.map((c) => fromMercator(fn(toMercator(c)))) as Quad;
}

/** Centre of the sheet: the mean of its corners */
export function quadCenter(q: Quad): LngLat {
    const m = q.map(toMercator);
    return fromMercator([m.reduce((s, c) => s + c[0], 0) / 4, m.reduce((s, c) => s + c[1], 0) / 4]);
}

/** Move the sheet so that `from` lands on `to` */
export function moveQuad(q: Quad, from: LngLat, to: LngLat): Quad {
    const a = toMercator(from), b = toMercator(to);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return mapQuad(q, ([x, y]) => [x + dx, y + dy]);
}

/** Turn the sheet about its centre, clockwise as seen on a north up map */
export function rotateQuad(q: Quad, degrees: number): Quad {
    const [cx, cy] = toMercator(quadCenter(q));
    const a = -degrees * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);

    return mapQuad(q, ([x, y]) => [
        cx + (x - cx) * cos - (y - cy) * sin,
        cy + (x - cx) * sin + (y - cy) * cos
    ]);
}

/** Enlarge (> 1) or shrink (< 1) the sheet about its centre */
export function scaleQuad(q: Quad, factor: number): Quad {
    const [cx, cy] = toMercator(quadCenter(q));
    return mapQuad(q, ([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

/** Ground metres per Mercator metre at a latitude */
function groundScale(lat: number): number {
    return Math.cos(lat * Math.PI / 180);
}

/**
 * A north up sheet for an image of `width` x `height` pixels, centred on a
 * position, its longer side `span` ground metres long
 */
export function placeImage(width: number, height: number, center: LngLat, span: number): Quad {
    const [cx, cy] = toMercator(center);
    const long = span / groundScale(center[1]);
    const w = width >= height ? long : long * width / height;
    const h = width >= height ? long * height / width : long;

    return [
        fromMercator([cx - w / 2, cy + h / 2]),
        fromMercator([cx + w / 2, cy + h / 2]),
        fromMercator([cx + w / 2, cy - h / 2]),
        fromMercator([cx - w / 2, cy - h / 2])
    ];
}

/**
 * Georeference an image by two control points: the image pixels `img1` and
 * `img2` are known to lie at the map positions `map1` and `map2`. Scale,
 * rotation and position follow; the image keeps its proportions.
 * Null if the two points coincide on the image or on the map.
 */
export function quadFromControlPoints(width: number, height: number, img1: Pixel, img2: Pixel, map1: LngLat, map2: LngLat): Quad | null {
    // Image y runs down, Mercator y up
    const ax = img2[0] - img1[0], ay = -(img2[1] - img1[1]);
    const m1 = toMercator(map1), m2 = toMercator(map2);
    const bx = m2[0] - m1[0], by = m2[1] - m1[1];

    const den = ax * ax + ay * ay;
    if (!Number.isFinite(den) || !Number.isFinite(bx) || !Number.isFinite(by)) return null;
    if (den === 0 || (bx === 0 && by === 0)) return null;

    // s = b / a as complex numbers: scale and rotation in one
    const sr = (bx * ax + by * ay) / den;
    const si = (by * ax - bx * ay) / den;

    const corner = ([px, py]: Pixel): LngLat => {
        const vx = px - img1[0], vy = -(py - img1[1]);
        return fromMercator([m1[0] + sr * vx - si * vy, m1[1] + si * vx + sr * vy]);
    };

    return [corner([0, 0]), corner([width, 0]), corner([width, height]), corner([0, height])];
}

/** Map position of an image pixel on a placed sheet (bilinear between the corners) */
export function pixelToLngLat(q: Quad, width: number, height: number, [px, py]: Pixel): LngLat {
    const u = px / width, v = py / height;
    const [tl, tr, br, bl] = q.map(toMercator);

    const top: [number, number] = [tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u];
    const bottom: [number, number] = [bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u];

    return fromMercator([top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v]);
}

/** Ground length of the top and left edge in metres */
export function quadSize(q: Quad): { width: number; height: number } {
    const [tl, tr, , bl] = q.map(toMercator);
    const k = groundScale(quadCenter(q)[1]);

    return {
        width: Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) * k,
        height: Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) * k
    };
}

/** Direction of the top edge, degrees clockwise from east (0 = north up) */
export function quadRotation(q: Quad): number {
    const [tl, tr] = [toMercator(q[0]), toMercator(q[1])];
    const deg = -Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * 180 / Math.PI;
    return Math.round(((deg % 360) + 540) % 360 - 180);
}

export function isQuad(value: unknown): value is Quad {
    return Array.isArray(value) && value.length === 4 && value.every((c) => Array.isArray(c) && c.length === 2
        && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 360);
}

function escapeXml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * KML of a rubber sheet as ATAK's ExportGRGTask writes it: a GroundOverlay with
 * a gx:LatLonQuad, corners counter clockwise from the lower left
 */
export function groundOverlayKml(name: string, href: string, q: Quad): string {
    const [tl, tr, br, bl] = q;
    const coords = [bl, br, tr, tl].map(([lng, lat]) => `${lng},${lat},0`).join(' ');

    return "<?xml version='1.0' encoding='UTF-8'?>\n"
        + "<kml xmlns='http://www.opengis.net/kml/2.2' xmlns:gx='http://www.google.com/kml/ext/2.2' xmlns:kml='http://www.opengis.net/kml/2.2' xmlns:atom='http://www.w3.org/2005/Atom'>\n"
        + '<GroundOverlay>\n'
        + `  <name>${escapeXml(name)}</name>\n`
        + '  <Icon>\n'
        + `    <href>${escapeXml(href)}</href>\n`
        + '    <viewBoundScale>0.75</viewBoundScale>\n'
        + '  </Icon>\n'
        + '  <gx:LatLonQuad>\n'
        + `    <coordinates>${coords}</coordinates>\n`
        + '  </gx:LatLonQuad>\n'
        + '</GroundOverlay>\n'
        + '</kml>\n';
}

export interface ParsedGroundOverlay {
    name: string;
    href: string;
    quad: Quad;
}

function child(el: Element, name: string): Element | undefined {
    return Array.from(el.getElementsByTagNameNS('*', name))[0] ?? Array.from(el.getElementsByTagName(name))[0];
}

function text(el: Element, name: string): string {
    return child(el, name)?.textContent?.trim() ?? '';
}

/**
 * The ground overlays in a KML document, from a gx:LatLonQuad or a LatLonBox
 * (with its rotation, counter clockwise as KML defines it)
 */
export function parseGroundOverlays(kml: string): ParsedGroundOverlay[] {
    const doc = new DOMParser().parseFromString(kml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];

    const overlays = [
        ...Array.from(doc.getElementsByTagNameNS('*', 'GroundOverlay')),
        ...Array.from(doc.getElementsByTagName('GroundOverlay'))
    ].filter((el, i, all) => all.indexOf(el) === i);

    const list: ParsedGroundOverlay[] = [];

    for (const el of overlays) {
        const icon = child(el, 'Icon');
        const href = icon ? text(icon, 'href') : '';
        if (!href) continue;

        let quad: Quad | null = null;

        const latLonQuad = child(el, 'LatLonQuad');
        if (latLonQuad) {
            const coords = text(latLonQuad, 'coordinates').split(/\s+/).filter(Boolean)
                .map((c) => c.split(',').map(Number).slice(0, 2) as LngLat);

            if (coords.length >= 4) {
                const [bl, br, tr, tl] = coords;
                quad = [tl, tr, br, bl];
            }
        } else {
            const box = child(el, 'LatLonBox');
            if (box) {
                const n = Number(text(box, 'north')), s = Number(text(box, 'south'));
                const e = Number(text(box, 'east')), w = Number(text(box, 'west'));
                const rotation = Number(text(box, 'rotation') || 0);

                if ([n, s, e, w].every(Number.isFinite)) {
                    quad = rotateQuad([[w, n], [e, n], [e, s], [w, s]], -(Number.isFinite(rotation) ? rotation : 0));
                }
            }
        }

        if (!quad || !isQuad(quad)) continue;

        list.push({ name: text(el, 'name') || href.split('/').pop() || 'Rubber Sheet', href, quad });
    }

    return list;
}
