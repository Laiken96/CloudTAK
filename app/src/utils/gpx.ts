/**
 * GPX import and export as ATAK does it (`com.atakmap.android.routes.RouteGpxIO`,
 * ATAK-CIV 5.5.1.10):
 *
 * - Every GPX route and every GPX track becomes a TAK route (`b-m-r`); all
 *   segments of a track go into one route.
 * - Consecutive points closer than 1 m are dropped, routes left with fewer
 *   than 2 points are skipped.
 * - ATAK's own line colour and width (`tak:LineColor`, `tak:LineWidth`) are
 *   kept, as are Garmin display colours. ATAK's default is a white route, 3 wide.
 * - Waypoints that stand on their own become point markers (ATAK shows them
 *   when a GPX is imported as an overlay).
 *
 * A route exports as a GPX route with ATAK's extensions, readable by ATAK,
 * Garmin devices and other GPS software.
 */

import { v4 as randomUUID } from 'uuid';
import type { LineString, Point } from 'geojson';

export interface GpxPoint {
    lng: number;
    lat: number;
    ele?: number;
    name?: string;
    desc?: string;
}

export interface GpxPath {
    kind: 'rte' | 'trk';
    name: string;
    desc?: string;
    /** `#rrggbb` */
    color?: string;
    width?: number;
    points: GpxPoint[];
}

export interface GpxDocument {
    name?: string;
    paths: GpxPath[];
    waypoints: GpxPoint[];
    /** Points dropped for lying within 1 m of the one before */
    skipped: number;
}

/** ATAK's TOLERANCE_DISTANCE_METERS */
const TOLERANCE_M = 1;

/** ATAK's Route.DEFAULT_ROUTE_COLOR and DEFAULT_STROKE_WEIGHT */
export const GPX_ROUTE_COLOR = '#ffffff';
export const GPX_ROUTE_WIDTH = 3;

/** Colour of imported waypoints, as a newly placed spot marker */
export const GPX_WAYPOINT_COLOR = '#ffffff';

const GARMIN_COLORS: Record<string, string> = {
    black: '#000000',
    darkred: '#8b0000',
    darkgreen: '#006400',
    darkyellow: '#b5b820',
    darkblue: '#00008b',
    darkmagenta: '#8b008b',
    darkcyan: '#008b8b',
    lightgray: '#d3d3d3',
    darkgray: '#a9a9a9',
    red: '#ff0000',
    green: '#00ff00',
    yellow: '#ffff00',
    blue: '#0000ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#ffffff'
};

function children(el: Element, name: string): Element[] {
    return Array.from(el.children).filter((c) => c.localName === name);
}

function text(el: Element, name: string): string | undefined {
    const value = children(el, name)[0]?.textContent?.trim();
    return value ? value : undefined;
}

/** First element of that name anywhere below, whatever its namespace */
function descendant(el: Element, name: string): Element | undefined {
    return Array.from(el.getElementsByTagName('*')).find((c) => c.localName === name);
}

/** Great circle distance [m] */
export function distance(a: GpxPoint, b: GpxPoint): number {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function point(el: Element): GpxPoint | null {
    const lat = Number(el.getAttribute('lat'));
    let lng = Number(el.getAttribute('lon'));

    if (!el.hasAttribute('lat') || !el.hasAttribute('lon')) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;

    if (lng > 180) lng -= 360;
    else if (lng < -180) lng += 360;

    const p: GpxPoint = { lng, lat };

    const ele = text(el, 'ele');
    if (ele !== undefined && Number.isFinite(Number(ele))) p.ele = Number(ele);

    const name = text(el, 'name');
    if (name) p.name = name;

    const desc = text(el, 'desc') ?? text(el, 'cmt');
    if (desc) p.desc = desc;

    return p;
}

/** ARGB integer as ATAK stores colours, to `#rrggbb` */
export function argbToHex(argb: number): string {
    return `#${((argb >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** `#rrggbb` to the signed ARGB integer ATAK writes, fully opaque */
export function hexToArgb(hex: string): number {
    return (0xff000000 | parseInt(hex.replace('#', ''), 16)) | 0;
}

function pathStyle(el: Element): { color?: string; width?: number } {
    const extensions = children(el, 'extensions')[0];
    if (!extensions) return {};

    const style: { color?: string; width?: number } = {};

    const atakColor = descendant(extensions, 'LineColor')?.textContent?.trim();
    const garminColor = descendant(extensions, 'DisplayColor')?.textContent?.trim();
    const styleColor = descendant(extensions, 'color')?.textContent?.trim();

    if (atakColor && /^-?\d+$/.test(atakColor)) {
        style.color = argbToHex(Number(atakColor));
    } else if (garminColor && GARMIN_COLORS[garminColor.toLowerCase()]) {
        style.color = GARMIN_COLORS[garminColor.toLowerCase()];
    } else if (styleColor && /^#?[0-9a-f]{6}$/i.test(styleColor)) {
        style.color = `#${styleColor.replace('#', '').toLowerCase()}`;
    }

    const width = Number(descendant(extensions, 'LineWidth')?.textContent?.trim());
    if (Number.isFinite(width) && width > 0) style.width = width;

    return style;
}

/** Drop points closer than 1 m to the previous one; counts what was dropped */
function thin(points: GpxPoint[]): { points: GpxPoint[]; skipped: number } {
    const kept: GpxPoint[] = [];
    let skipped = 0;

    for (const p of points) {
        const prev = kept[kept.length - 1];
        if (prev && distance(prev, p) < TOLERANCE_M) {
            skipped++;
            continue;
        }
        kept.push(p);
    }

    return { points: kept, skipped };
}

/** Read a GPX document. Throws if the text is no GPX. */
export function parseGpx(xml: string): GpxDocument {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement;

    if (doc.getElementsByTagName('parsererror').length || !root || root.localName !== 'gpx') {
        throw new Error('Not a GPX file');
    }

    const result: GpxDocument = { paths: [], waypoints: [], skipped: 0 };

    const metadata = children(root, 'metadata')[0];
    const name = metadata ? text(metadata, 'name') : undefined;
    if (name) result.name = name;

    result.waypoints = children(root, 'wpt').map(point).filter((p): p is GpxPoint => p !== null);

    const add = (kind: 'rte' | 'trk', el: Element, raw: GpxPoint[], fallback: string): void => {
        const { points, skipped } = thin(raw);
        result.skipped += skipped;
        if (points.length < 2) return;

        const path: GpxPath = { kind, name: text(el, 'name') ?? fallback, points, ...pathStyle(el) };
        const desc = text(el, 'desc') ?? text(el, 'cmt');
        if (desc) path.desc = desc;

        result.paths.push(path);
    };

    children(root, 'rte').forEach((rte, i) => {
        add('rte', rte, children(rte, 'rtept').map(point).filter((p): p is GpxPoint => p !== null), `GPX Route ${i + 1}`);
    });

    children(root, 'trk').forEach((trk, i) => {
        const raw = children(trk, 'trkseg')
            .flatMap((seg) => children(seg, 'trkpt'))
            .map(point)
            .filter((p): p is GpxPoint => p !== null);

        add('trk', trk, raw, `GPX Track ${i + 1}`);
    });

    return result;
}

/** A feature as CloudTAK's feature store takes it */
export interface GpxFeature {
    id: string;
    type: 'Feature';
    path: string;
    properties: {
        id: string;
        type: string;
        how: string;
        archived: boolean;
        callsign: string;
        remarks: string;
        time: string;
        start: string;
        stale: string;
        center: [number, number];
        [key: string]: unknown;
    };
    geometry: LineString | Point;
}

function coordinates(points: GpxPoint[]): number[][] {
    const withEle = points.every((p) => p.ele !== undefined);
    return points.map((p) => withEle ? [p.lng, p.lat, p.ele as number] : [p.lng, p.lat]);
}

/**
 * CloudTAK features for a GPX document: a route per GPX route and track, a
 * spot marker per standalone waypoint
 */
export function gpxFeatures(
    doc: GpxDocument,
    opts: { routes?: boolean; waypoints?: boolean; now?: Date; id?: () => string } = {}
): GpxFeature[] {
    const now = opts.now ?? new Date();
    const id = opts.id ?? (() => randomUUID());

    // As a feature drawn on the map: kept (archived), stale after 2 hours
    const times = {
        time: now.toISOString(),
        start: now.toISOString(),
        stale: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
    };

    const features: GpxFeature[] = [];

    if (opts.routes !== false) {
        for (const path of doc.paths) {
            const fid = id();
            features.push({
                id: fid,
                type: 'Feature',
                path: '/',
                properties: {
                    id: fid,
                    type: 'b-m-r',
                    how: 'h-e',
                    archived: true,
                    callsign: path.name,
                    remarks: path.desc ?? '',
                    stroke: path.color ?? GPX_ROUTE_COLOR,
                    'stroke-width': path.width ?? GPX_ROUTE_WIDTH,
                    'stroke-opacity': 1,
                    'stroke-style': 'solid',
                    ...times,
                    center: [0, 0]
                },
                geometry: { type: 'LineString', coordinates: coordinates(path.points) }
            });
        }
    }

    if (opts.waypoints !== false) {
        doc.waypoints.forEach((wpt, i) => {
            const fid = id();
            features.push({
                id: fid,
                type: 'Feature',
                path: '/',
                properties: {
                    id: fid,
                    type: 'b-m-p-s-m',
                    how: 'h-e',
                    archived: true,
                    callsign: wpt.name ?? `GPX Waypoint ${i + 1}`,
                    remarks: wpt.desc ?? '',
                    'marker-color': GPX_WAYPOINT_COLOR,
                    'marker-opacity': 1,
                    ...times,
                    center: [wpt.lng, wpt.lat]
                },
                geometry: { type: 'Point', coordinates: coordinates([wpt])[0] }
            });
        });
    }

    return features;
}

/** West, south, east, north of the features, null if there are none */
export function gpxBounds(features: GpxFeature[]): [number, number, number, number] | null {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;

    for (const f of features) {
        const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const [lng, lat] of coords) {
            w = Math.min(w, lng);
            e = Math.max(e, lng);
            s = Math.min(s, lat);
            n = Math.max(n, lat);
        }
    }

    return Number.isFinite(w) ? [w, s, e, n] : null;
}

function escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** A route as GPX 1.1, with ATAK's colour and width */
export function routeToGpx(route: {
    properties: { callsign?: string; remarks?: string; stroke?: string; 'stroke-width'?: number; [key: string]: unknown };
    geometry: LineString;
}): string {
    const name = route.properties.callsign || 'Route';
    const color = typeof route.properties.stroke === 'string' && /^#[0-9a-f]{6}$/i.test(route.properties.stroke)
        ? route.properties.stroke
        : GPX_ROUTE_COLOR;
    const width = Number(route.properties['stroke-width']) || GPX_ROUTE_WIDTH;

    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="CloudTAK" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tak="http://tak.gov">',
        '  <rte>',
        `    <name>${escapeXml(name)}</name>`
    ];

    if (route.properties.remarks) lines.push(`    <desc>${escapeXml(route.properties.remarks)}</desc>`);

    lines.push(
        '    <extensions>',
        `      <tak:LineColor>${hexToArgb(color)}</tak:LineColor>`,
        `      <tak:LineWidth>${width.toFixed(1)}</tak:LineWidth>`,
        '    </extensions>'
    );

    for (const [lng, lat, ele] of route.geometry.coordinates) {
        const pt = `    <rtept lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}"`;
        lines.push(Number.isFinite(ele) ? `${pt}><ele>${(ele as number).toFixed(1)}</ele></rtept>` : `${pt}/>`);
    }

    lines.push('  </rte>', '</gpx>', '');
    return lines.join('\n');
}

/** File name for an exported route */
export function gpxFileName(name: string): string {
    const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base || 'route'}.gpx`;
}
