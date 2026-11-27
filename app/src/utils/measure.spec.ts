import { describe, expect, it } from 'vitest';
import {
    MILS_PER_CIRCLE,
    degreesToMils,
    formatDegrees,
    formatDistance,
    formatMils,
    initialBearing,
    measureGeoJSON,
    normalizeDegrees,
    pointName,
    removeLastPoint,
    screenMidpoint,
    segmentDistance,
    summarize,
    type LngLat,
} from './measure.ts';

// Railway stations, WGS84
const BERN: LngLat = [7.43913, 46.94884];
const THUN: LngLat = [7.62958, 46.75469];
// Geodesic on the WGS84 ellipsoid (Vincenty): 26 015.5 m, initial bearing 146.0°
const BERN_THUN = 26015.5;

describe('distance', () => {
    it('measures Bern - Thun within 0.5 %', () => {
        const d = segmentDistance(BERN, THUN);
        expect(Math.abs(d - BERN_THUN) / BERN_THUN).toBeLessThan(0.005);
    });

    it('is the same both ways and zero for one place', () => {
        expect(segmentDistance(THUN, BERN)).toBeCloseTo(segmentDistance(BERN, THUN), 6);
        expect(segmentDistance(BERN, BERN)).toBe(0);
    });

    it('adds the segments of a path', () => {
        const mid: LngLat = [7.5, 46.85];
        const summary = summarize([BERN, mid, THUN]);

        expect(summary.points).toBe(3);
        expect(summary.segments).toHaveLength(2);
        expect(summary.total).toBeCloseTo(segmentDistance(BERN, mid) + segmentDistance(mid, THUN), 6);
        expect(summary.total).toBeGreaterThan(segmentDistance(BERN, THUN));
        expect(summary.last?.from).toEqual(mid);
        expect(summary.last?.to).toEqual(THUN);
    });
});

describe('empty measurement', () => {
    it('has no segment and no length without points', () => {
        const summary = summarize([]);
        expect(summary).toEqual({ points: 0, segments: [], total: 0, last: undefined });
    });

    it('has no segment and no length with one point', () => {
        const summary = summarize([BERN]);
        expect(summary.points).toBe(1);
        expect(summary.segments).toEqual([]);
        expect(summary.total).toBe(0);
        expect(summary.last).toBeUndefined();
    });

    it('draws nothing without points and only the point with one', () => {
        expect(measureGeoJSON([]).features).toEqual([]);

        const one = measureGeoJSON([{ coord: BERN }]).features;
        expect(one).toHaveLength(1);
        expect(one[0].properties).toMatchObject({ kind: 'vertex', index: 0, name: 'A', snapped: false });
    });
});

describe('remove the last point', () => {
    it('drops the last point and leaves the input alone', () => {
        const points: LngLat[] = [BERN, [7.5, 46.85], THUN];
        const shorter = removeLastPoint(points);

        expect(shorter).toEqual([BERN, [7.5, 46.85]]);
        expect(points).toHaveLength(3);
        expect(summarize(shorter).total).toBeCloseTo(segmentDistance(BERN, [7.5, 46.85]), 6);
    });

    it('goes down to no point and stays there', () => {
        expect(removeLastPoint([BERN])).toEqual([]);
        expect(removeLastPoint([])).toEqual([]);
    });
});

describe('formatDistance', () => {
    it('shows whole metres below 1000 m', () => {
        expect(formatDistance(0)).toBe('0 m');
        expect(formatDistance(850.4)).toBe('850 m');
        expect(formatDistance(999)).toBe('999 m');
        expect(formatDistance(999.4)).toBe('999 m');
    });

    it('shows km with two decimals from 1000 m', () => {
        expect(formatDistance(1000)).toBe('1,00 km');
        // Rounds to 1000 m - shown as km, never as "1000 m"
        expect(formatDistance(999.6)).toBe('1,00 km');
        expect(formatDistance(2345)).toBe('2,35 km');
        expect(formatDistance(BERN_THUN)).toBe('26,02 km');
    });

    it('shows a dash for nonsense', () => {
        expect(formatDistance(Number.NaN)).toBe('–');
        expect(formatDistance(-1)).toBe('–');
    });
});

describe('bearing', () => {
    const ORIGIN: LngLat = [7.5, 46.9];

    it.each([
        ['north', [7.5, 46.91], 0, 0],
        ['east', [7.51, 46.9], 90, 1600],
        ['south', [7.5, 46.89], 180, 3200],
        ['west', [7.49, 46.9], 270, 4800],
    ] as Array<[string, LngLat, number, number]>)('points %s', (_name, to, degrees, mils) => {
        const bearing = initialBearing(ORIGIN, to);

        // Along a parallel the great circle starts a little off east / west
        expect(Math.abs(bearing - degrees)).toBeLessThan(0.01);
        expect(formatDegrees(bearing)).toBe(`${degrees}°`);
        expect(formatMils(bearing)).toBe(`${mils} A‰`);
    });

    it('stays within 0 to 359° and 0 to 6399 A‰', () => {
        expect(normalizeDegrees(-90)).toBe(270);
        expect(normalizeDegrees(720)).toBe(0);
        expect(formatDegrees(359.6)).toBe('0°');
        expect(formatDegrees(-0.2)).toBe('0°');
        expect(degreesToMils(359.99)).toBe(0);
        expect(degreesToMils(359.9)).toBe(6398);
        expect(degreesToMils(45)).toBe(800);
        expect(MILS_PER_CIRCLE).toBe(6400);
    });

    it('gives Bern - Thun to the south-east', () => {
        const bearing = initialBearing(BERN, THUN);
        expect(bearing).toBeGreaterThan(145.5);
        expect(bearing).toBeLessThan(146.5);
        expect(formatDegrees(bearing)).toBe('146°');
        expect(degreesToMils(bearing)).toBe(Math.round(bearing * 6400 / 360));
    });
});

describe('map data', () => {
    it('draws the path, a label per segment and every point', () => {
        const mid: LngLat = [7.5, 46.85];
        const fc = measureGeoJSON([{ coord: BERN, snapped: true }, { coord: mid }, { coord: THUN }]);
        const kinds = fc.features.map((f) => f.properties?.kind);

        expect(kinds.filter((k) => k === 'path')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'label')).toHaveLength(2);
        expect(kinds.filter((k) => k === 'vertex')).toHaveLength(3);

        const labels = fc.features.filter((f) => f.properties?.kind === 'label').map((f) => f.properties?.label);
        expect(labels).toEqual([formatDistance(segmentDistance(BERN, mid)), formatDistance(segmentDistance(mid, THUN))]);

        const vertices = fc.features.filter((f) => f.properties?.kind === 'vertex');
        expect(vertices.map((f) => f.properties?.name)).toEqual(['A', 'B', 'C']);
        expect(vertices[0].properties?.snapped).toBe(true);
    });

    it('puts the label where the map draws the middle of the line', () => {
        const [lng, lat] = screenMidpoint(BERN, THUN);
        expect(lng).toBeCloseTo((BERN[0] + THUN[0]) / 2, 9);
        // Mercator: slightly north of the middle in degrees
        expect(lat).toBeGreaterThan((BERN[1] + THUN[1]) / 2);
        expect(lat).toBeLessThan(BERN[1]);
        expect(screenMidpoint(BERN, BERN)[1]).toBeCloseTo(BERN[1], 9);
    });

    it('names points by letter', () => {
        expect(pointName(0)).toBe('A');
        expect(pointName(25)).toBe('Z');
        expect(pointName(26)).toBe('27');
    });
});
