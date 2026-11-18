import { describe, expect, it } from 'vitest';
import {
    clipLine,
    edgeLabels,
    formatDegrees,
    fromUtm,
    graticule,
    graticuleStep,
    gridZones,
    latBand,
    lineDigits,
    metersPerPixel,
    mgrsSquareLabels,
    mgrsGrid,
    mgrsLevel,
    squareCornerLabel,
    squareId,
    squareName,
    toUtm,
    utmZone,
    type Bounds,
    type LngLat,
} from './grid-lines.ts';
import { formatCoordPair } from './coordinateFormat.ts';

const PORRENTRUY: LngLat = [7.0536, 47.4508];

/** Zone, band, square and 1 m digits as CloudTAK's coordinate display writes them */
function shown([lng, lat]: LngLat): { gzd: string; square: string; e: number; n: number } {
    const [gzd, square, e, n] = formatCoordPair(lat, lng, 'mgrs').split(' ');
    return { gzd, square, e: Number(e), n: Number(n) };
}

function within(p: LngLat, b: Bounds, eps = 1e-9): boolean {
    return p[0] >= b.west - eps && p[0] <= b.east + eps && p[1] >= b.south - eps && p[1] <= b.north + eps;
}

describe('UTM', () => {
    it('matches the textbook values on the equator', () => {
        const origin = toUtm([0, 0]);
        expect(origin.zone).toEqual(31);
        expect(origin.easting).toBeCloseTo(166021.4431, 3);
        expect(origin.northing).toBeCloseTo(0, 6);

        const centre = toUtm([3, 0]);
        expect(centre.easting).toBeCloseTo(500000, 6);
    });

    it('agrees with the MGRS coordinates CloudTAK shows', () => {
        const places: LngLat[] = [
            PORRENTRUY,
            [7.4386, 46.9511], // Bern
            [6.1432, 46.2044], // Geneva, just east of 6°
            [5.9, 47.0], // west of 6°, zone 31
            [5.32, 60.39], // Bergen, zone 32V
            [15.6, 78.2], // Longyearbyen, zone 33X
            [151.2093, -33.8688], // Sydney
            [-47.9, -0.5] // south of the equator
        ];

        for (const p of places) {
            const u = toUtm(p);
            const ref = shown(p);

            expect(`${u.zone}${latBand(p[1])}`).toEqual(ref.gzd);
            expect(squareId(u.zone, u.easting, u.northing)).toEqual(ref.square);
            expect(Math.abs(Math.floor(u.easting % 100000) - ref.e)).toBeLessThanOrEqual(1);
            expect(Math.abs(Math.floor(u.northing % 100000) - ref.n)).toBeLessThanOrEqual(1);
        }
    });

    it('converts back to the same position within a millimetre', () => {
        for (const p of [PORRENTRUY, [151.2093, -33.8688], [5.9, 47.0], [11.9, 60]] as LngLat[]) {
            const back = fromUtm(toUtm(p));
            expect(back[0]).toBeCloseTo(p[0], 7);
            expect(back[1]).toBeCloseTo(p[1], 7);
        }
    });

    it('names the square of the origin AA', () => {
        const u = toUtm([0, 0]);
        expect(squareId(u.zone, u.easting, u.northing)).toEqual('AA');
    });

    it('knows the zone exceptions of Norway and Svalbard', () => {
        expect(utmZone([5.32, 60.39])).toEqual(32);
        expect(utmZone([2.5, 60])).toEqual(31);
        expect(utmZone([15.6, 78.2])).toEqual(33);
        expect(utmZone([10, 78])).toEqual(33);
        expect(utmZone([8.9, 78])).toEqual(31);
        expect(utmZone([181, 10])).toEqual(1);
    });
});

describe('grid zones', () => {
    it('widens 32V and shrinks 31V', () => {
        expect(gridZones({ west: 0, east: 12, south: 57, north: 63 }).map((z) => [z.zone, z.band, z.west, z.east]))
            .toEqual([[31, 'V', 0, 3], [32, 'V', 3, 12]]);
    });

    it('leaves out 32X, 34X and 36X', () => {
        expect(gridZones({ west: 5, east: 25, south: 75, north: 80 }).map((z) => `${z.zone}${z.band}`))
            .toEqual(['31X', '33X', '35X']);
    });

    it('stops at 84° north and 80° south', () => {
        expect(latBand(84)).toEqual('X');
        expect(latBand(-80)).toEqual('C');
        expect(latBand(84.1)).toBeNull();
        expect(gridZones({ west: 6, east: 7, south: 83, north: 89 })[0].north).toEqual(84);
    });
});

describe('levels', () => {
    it('picks the finest level whose lines stay 40 px apart', () => {
        expect(mgrsLevel(1)).toEqual(100);
        expect(mgrsLevel(5)).toEqual(1000);
        expect(mgrsLevel(100)).toEqual(10000);
        expect(mgrsLevel(3000)).toEqual(100000);
        expect(mgrsLevel(6000)).toBeNull();
    });

    it('names the 100 km squares only once they are 80 px wide', () => {
        expect(mgrsSquareLabels(1250)).toBe(true);
        expect(mgrsSquareLabels(2430)).toBe(false);
    });

    it('writes the MGRS digits of a line', () => {
        expect(lineDigits(353000, 1000)).toEqual('53');
        expect(lineDigits(5256000, 1000)).toEqual('56');
        expect(lineDigits(353400, 100)).toEqual('534');
        expect(lineDigits(350000, 10000)).toEqual('5');
        expect(lineDigits(5200000, 1000)).toEqual('00');
        expect(lineDigits(300000, 100000)).toEqual('');
    });

    it('measures ground metres per pixel', () => {
        expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 1);
        expect(metersPerPixel(13, 47.45)).toBeCloseTo(6.461, 2);
    });
});

describe('clipLine', () => {
    it('keeps the parts inside the box', () => {
        const box = { west: 2, east: 5, south: -1, north: 1 };
        expect(clipLine([[0, 0], [10, 0]], box)).toEqual([[[2, 0], [5, 0]]]);
        expect(clipLine([[0, 0], [3, 0], [3, 5], [4, 5], [4, 0], [10, 0]], box)).toEqual([
            [[2, 0], [3, 0], [3, 1]],
            [[4, 1], [4, 0], [5, 0]]
        ]);
        expect(clipLine([[0, 5], [10, 5]], box)).toEqual([]);
    });
});

describe('mgrsGrid', () => {
    const view: Bounds = { west: 6.9, east: 7.2, south: 47.35, north: 47.55 };

    it('draws the 1 km lines around Porrentruy with their digits', () => {
        const grid = mgrsGrid(view, 10);

        const lines = grid.lines.filter((l) => l.kind === 'line');
        expect(lines.length).toBeGreaterThan(30);
        expect(grid.lines.some((l) => l.kind === 'zone')).toBe(false);

        for (const line of grid.lines) {
            for (const p of line.coords) expect(within(p, view)).toBe(true);
        }

        const ref = shown(PORRENTRUY);
        const e = String(Math.floor(ref.e / 1000)).padStart(2, '0');
        const n = String(Math.floor(ref.n / 1000)).padStart(2, '0');
        expect(lines.some((l) => l.axis === 'e' && l.label === e)).toBe(true);
        expect(lines.some((l) => l.axis === 'n' && l.label === n)).toBe(true);
    });

    it('puts every 1 km line where the MGRS digits change', () => {
        const grid = mgrsGrid(view, 10);
        const line = grid.lines.find((l) => l.kind === 'line' && l.axis === 'e' && l.label === '53');
        expect(line).toBeDefined();

        const [lng, lat] = line!.coords[0];
        const west = shown([lng - 0.00002, lat]);
        const east = shown([lng + 0.00002, lat]);
        expect(Math.floor(west.e / 1000)).toEqual(52);
        expect(Math.floor(east.e / 1000)).toEqual(53);
    });

    it('cuts the lines at the zone boundary of 6° east', () => {
        const across: Bounds = { west: 5.9, east: 6.1, south: 46.9, north: 47.0 };
        const grid = mgrsGrid(across, 10);

        const boundary = grid.lines.filter((l) => l.kind === 'zone');
        expect(boundary).toHaveLength(1);
        expect(boundary[0].coords.every(([lng]) => lng === 6)).toBe(true);

        for (const line of grid.lines.filter((l) => l.kind !== 'zone')) {
            const sides = new Set(line.coords.map(([lng]) => Math.sign(Math.round((lng - 6) * 1e9))).filter((s) => s !== 0));
            expect(sides.size).toBeLessThanOrEqual(1);
        }
    });

    it('labels the 100 km squares when they are large enough', () => {
        const swiss: Bounds = { west: 5.9, east: 10.5, south: 45.8, north: 47.8 };
        const grid = mgrsGrid(swiss, 1000);

        const ref = shown(PORRENTRUY);
        const texts = grid.labels.filter((l) => l.kind === 'square').map((l) => l.text);
        expect(texts).toContain(`${ref.gzd} ${ref.square}`);
        expect(grid.lines.some((l) => l.kind === 'line')).toBe(false);
        expect(grid.lines.some((l) => l.kind === 'zone')).toBe(true);

        for (const label of grid.labels.filter((l) => l.kind === 'square')) {
            const [gzd, square] = label.text.split(' ');
            const at = shown(label.at);
            expect(`${at.gzd} ${at.square}`).toEqual(`${gzd} ${square}`);
        }
    });

    it('shows only zones and their names far out', () => {
        const europe: Bounds = { west: -10, east: 30, south: 35, north: 60 };
        const grid = mgrsGrid(europe, 10000);

        expect(grid.lines.every((l) => l.kind === 'zone')).toBe(true);
        expect(grid.labels.map((l) => l.text)).toContain('32T');
    });

    it('draws nothing beyond 84° north', () => {
        expect(mgrsGrid({ west: 0, east: 10, south: 85, north: 89 }, 10)).toEqual({ lines: [], labels: [] });
    });
});

describe('graticule', () => {
    it('chooses round steps in degrees or in minutes and seconds', () => {
        expect(graticuleStep('Decimal Degrees', 10, 47)).toEqual(0.01);
        expect(graticuleStep('Degrees, Minutes, Seconds', 10, 47)).toBeCloseTo(20 / 3600, 12);
        expect(graticuleStep('Decimal Degrees', 50000, 47)).toEqual(30);
    });

    it('writes degrees at the precision of the step', () => {
        expect(formatDegrees(47.45, 'lat', 'Decimal Degrees', 0.01)).toEqual('47.45°N');
        expect(formatDegrees(7.05, 'lng', 'Decimal Degrees', 0.01)).toEqual('7.05°E');
        expect(formatDegrees(-0.5, 'lng', 'Decimal Degrees', 0.5)).toEqual('0.5°W');
        expect(formatDegrees(0, 'lat', 'Decimal Degrees', 1)).toEqual('0°');
        expect(formatDegrees(47.5, 'lat', 'Degrees, Minutes, Seconds', 0.5)).toEqual("47°30'N");
        expect(formatDegrees(7 + 210 / 3600, 'lng', 'Degrees, Minutes, Seconds', 10 / 3600)).toEqual('7°03\'30"E');
        expect(formatDegrees(-34, 'lat', 'Degrees, Minutes, Seconds', 1)).toEqual('34°S');
    });

    it('draws labelled meridians and parallels inside the view', () => {
        const view: Bounds = { west: 7.001, east: 7.039, south: 47.441, north: 47.459 };
        const grid = graticule(view, 'Decimal Degrees', 0.01);

        expect(grid.lines.filter((l) => l.axis === 'e').map((l) => l.label)).toEqual(['7.01°E', '7.02°E', '7.03°E']);
        expect(grid.lines.filter((l) => l.axis === 'n').map((l) => l.label)).toEqual(['47.45°N']);
        for (const line of grid.lines) {
            for (const p of line.coords) expect(within(p, view)).toBe(true);
        }
    });
});

describe('edgeLabels', () => {
    // A north up map 300 x 200 px over the view, 1000 px per degree
    const view: Bounds = { west: 6.9, east: 7.2, south: 47.35, north: 47.55 };
    const project = ([lng, lat]: LngLat): [number, number] => [(lng - view.west) * 1000, (view.north - lat) * 1000];
    const unproject = ([x, y]: [number, number]): LngLat => [view.west + x / 1000, view.north - y / 1000];

    it('puts easting digits on the top edge and northing digits on the left edge', () => {
        const grid = mgrsGrid(view, 10);
        const labels = edgeLabels(grid.lines, project, unproject, 300, 200);

        const top = labels.filter((l) => l.anchor === 'top');
        const left = labels.filter((l) => l.anchor === 'left');
        expect(top.length).toBeGreaterThan(10);
        expect(left.length).toBeGreaterThan(10);

        for (const l of top) expect(l.at[1]).toBeCloseTo(view.north - 0.003, 9);
        for (const l of left) expect(l.at[0]).toBeCloseTo(view.west + 0.003, 9);

        expect(top.map((l) => l.text)).toContain('53');
        expect(left.map((l) => l.text)).toContain('56');
    });

    it('keeps the top left and lower left corners free', () => {
        const grid = mgrsGrid(view, 10);
        for (const l of edgeLabels(grid.lines, project, unproject, 300, 200)) {
            const [x, y] = project(l.at);
            expect(l.anchor === 'top' ? x : y).toBeGreaterThanOrEqual(28);
            if (l.anchor === 'left') expect(y).toBeLessThanOrEqual(200 - 28);
        }
    });
});

describe('squareCornerLabel', () => {
    const view: Bounds = { west: 6.9, east: 7.2, south: 47.35, north: 47.55 };
    const project = ([lng, lat]: LngLat): [number, number] => [(lng - view.west) * 1000, (view.north - lat) * 1000];
    const unproject = ([x, y]: [number, number]): LngLat => [view.west + x / 1000, view.north - y / 1000];

    it('names the square of a position', () => {
        const ref = shown(PORRENTRUY);
        expect(squareName(PORRENTRUY)).toEqual(`${ref.gzd} ${ref.square}`);
        expect(squareName([7, 85])).toBeNull();
    });

    it('names the square in the lower left corner when its own label is out of sight', () => {
        const grid = mgrsGrid(view, 10);
        const label = squareCornerLabel(grid.labels, project, unproject, 300, 200);

        expect(label).not.toBeNull();
        expect(label!.anchor).toEqual('bottom-left');
        expect(label!.text).toEqual(squareName(unproject([6, 194])));
    });

    it('stays away when the square label is on screen', () => {
        const at = unproject([50, 150]);
        const labels = [{ at, text: squareName(unproject([6, 194]))!, kind: 'square' as const }];
        expect(squareCornerLabel(labels, project, unproject, 300, 200)).toBeNull();
    });
});
