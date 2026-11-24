/**
 * Measuring distances on the map (Drawing Tools > Measure Distance): the
 * arithmetic and the readout, free of the map so it can be tested.
 *
 * Distances are great circle distances (@turf/distance, haversine on the mean
 * earth radius, within about 0.5 % of the ellipsoid). Bearings are the initial
 * great circle bearing from true north, in degrees and in the artillery mils
 * of the Swiss Army (Artilleriepromille, 6400 to the full circle).
 */
import { distance } from '@turf/distance';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

/** [longitude, latitude] */
export type LngLat = [number, number];

/** Artillery mils (Artilleriepromille) in a full circle */
export const MILS_PER_CIRCLE = 6400;

/** Unit shown after artillery mils */
export const MILS_UNIT = 'A‰';

export interface MeasureSegment {
    from: LngLat;
    to: LngLat;
    /** Metres */
    distance: number;
    /** Degrees from true north, 0 <= bearing < 360 */
    bearing: number;
}

export interface MeasureSummary {
    /** Number of points set */
    points: number;
    segments: MeasureSegment[];
    /** Sum of all segments in metres */
    total: number;
    /** The segment to the last point, undefined below two points */
    last?: MeasureSegment;
}

const RAD = Math.PI / 180;

/** Great circle distance in metres */
export function segmentDistance(from: LngLat, to: LngLat): number {
    return distance(from, to, { units: 'meters' });
}

/**
 * Initial great circle bearing from `from` to `to` in degrees from true north,
 * 0 <= bearing < 360 - the formula of @turf/bearing, which is not installed.
 */
export function initialBearing(from: LngLat, to: LngLat): number {
    const lng1 = from[0] * RAD;
    const lng2 = to[0] * RAD;
    const lat1 = from[1] * RAD;
    const lat2 = to[1] * RAD;

    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);

    return normalizeDegrees(Math.atan2(y, x) / RAD);
}

/** Any angle in degrees to 0 <= angle < 360 */
export function normalizeDegrees(degrees: number): number {
    const normalized = degrees % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

export function segments(points: readonly LngLat[]): MeasureSegment[] {
    const result: MeasureSegment[] = [];

    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];

        result.push({
            from,
            to,
            distance: segmentDistance(from, to),
            bearing: initialBearing(from, to),
        });
    }

    return result;
}

export function summarize(points: readonly LngLat[]): MeasureSummary {
    const segs = segments(points);

    return {
        points: points.length,
        segments: segs,
        total: segs.reduce((sum, seg) => sum + seg.distance, 0),
        last: segs.length ? segs[segs.length - 1] : undefined,
    };
}

/** The points without the last one - a new array, the input is left as is */
export function removeLastPoint<T>(points: readonly T[]): T[] {
    return points.slice(0, -1);
}

/** Metric distance: whole metres below 1000 m ("850 m"), from there km with two decimals ("2.35 km") */
export function formatDistance(metres: number): string {
    if (!Number.isFinite(metres) || metres < 0) return '–';

    const rounded = Math.round(metres);
    if (rounded < 1000) return `${rounded} m`;

    return `${(metres / 1000).toFixed(2)} km`;
}

/** Whole degrees, 0 to 359 */
export function roundDegrees(degrees: number): number {
    return Math.round(normalizeDegrees(degrees)) % 360;
}

/** Whole artillery mils, 0 to 6399 */
export function degreesToMils(degrees: number): number {
    return Math.round(normalizeDegrees(degrees) * MILS_PER_CIRCLE / 360) % MILS_PER_CIRCLE;
}

/** "146°" */
export function formatDegrees(degrees: number): string {
    if (!Number.isFinite(degrees)) return '–';
    return `${roundDegrees(degrees)}°`;
}

/** "2596 A‰" */
export function formatMils(degrees: number): string {
    if (!Number.isFinite(degrees)) return '–';
    return `${degreesToMils(degrees)} ${MILS_UNIT}`;
}

/**
 * Middle of a segment as the map draws it: a straight line in Web Mercator,
 * so the latitude is halved in Mercator, not in degrees
 */
export function screenMidpoint(from: LngLat, to: LngLat): LngLat {
    const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * RAD / 2));
    const y = (mercator(from[1]) + mercator(to[1])) / 2;
    const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;

    return [(from[0] + to[0]) / 2, lat];
}

/** Letter of a point: A, B, ... Z, then 27, 28, ... */
export function pointName(index: number): string {
    return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * The measurement as map data: the path as a line, every point (`kind`
 * vertex, with its `index`) and a length label at the middle of every segment
 */
export function measureGeoJSON(
    points: ReadonlyArray<{ coord: LngLat; snapped?: boolean }>
): FeatureCollection<LineString | Point> {
    const coords = points.map((p) => p.coord);
    const features: Array<Feature<LineString | Point>> = [];

    if (coords.length >= 2) {
        features.push({
            type: 'Feature',
            properties: { kind: 'path' },
            geometry: { type: 'LineString', coordinates: coords },
        });
    }

    for (const seg of segments(coords)) {
        features.push({
            type: 'Feature',
            properties: { kind: 'label', label: formatDistance(seg.distance) },
            geometry: { type: 'Point', coordinates: screenMidpoint(seg.from, seg.to) },
        });
    }

    points.forEach((p, index) => {
        features.push({
            type: 'Feature',
            properties: {
                kind: 'vertex',
                index,
                name: pointName(index),
                snapped: Boolean(p.snapped),
            },
            geometry: { type: 'Point', coordinates: p.coord },
        });
    });

    return { type: 'FeatureCollection', features };
}
