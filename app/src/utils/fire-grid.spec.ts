import { describe, expect, it } from 'vitest';
import {
    FIRE_GRID_DEFAULTS,
    cellAt,
    cellFromLv95,
    colIndex,
    colName,
    designation,
    fireGridAround,
    fireGridCellPolygon,
    fireGridCenter,
    fireGridGeoJSON,
    fireGridHash,
    inGrid,
    parseDesignation,
    parseFireGridLink,
    spoken,
    validateFireGrid,
    zoomForLength,
} from './fire-grid.ts';
import { lv95ToWgs } from './lv95.ts';

// Reference values computed with the Einheitsfeuerplan V1.3 core (index.html)
const P = FIRE_GRID_DEFAULTS;

describe('columns', () => {
    it('letters columns without I and O, then two letters', () => {
        expect([1, 8, 9, 13, 24, 25, 48, 49, 80].map(colName)).toEqual(['A', 'H', 'J', 'N', 'Z', 'AA', 'AZ', 'BA', 'CH']);
    });

    it('reads a column name back', () => {
        for (let i = 1; i <= 80; i++) expect(colIndex(colName(i))).toEqual(i);
        expect(colIndex('I')).toEqual(-1);
        expect(colIndex('O')).toEqual(-1);
        expect(colIndex('ABC')).toEqual(-1);
    });
});

describe('designation', () => {
    it('names and speaks a fine field as the Einheitsfeuerplan does', () => {
        expect(designation({ i: 4, j: 2, k: 6 })).toEqual('D2/6');
        expect(designation({ i: 4, j: 2 })).toEqual('D2');
        expect(spoken({ i: 4, j: 2, k: 6 })).toEqual('Delta Two Six');
        expect(spoken({ i: colIndex('AB'), j: 12, k: 3 })).toEqual('Alpha Bravo One Two Three');
    });

    it('parses the forms the Einheitsfeuerplan search accepts', () => {
        expect(parseDesignation('D2/6')).toEqual({ i: 4, j: 2, k: 6 });
        expect(parseDesignation(' d 2 / 6 ')).toEqual({ i: 4, j: 2, k: 6 });
        expect(parseDesignation('D2')).toEqual({ i: 4, j: 2 });
        expect(parseDesignation('AB12/3')).toEqual({ i: 26, j: 12, k: 3 });
    });

    it('rejects what is no designation', () => {
        for (const text of ['I1', 'O2', 'D0', 'D2/0', 'D1234', 'Pz Kp 2', '']) {
            expect(parseDesignation(text)).toBeNull();
        }
    });

    it('knows whether a cell lies inside a grid', () => {
        expect(inGrid(P, { i: 20, j: 12, k: 9 })).toBe(true);
        expect(inGrid(P, { i: 21, j: 1 })).toBe(false);
        expect(inGrid(P, { i: 1, j: 13 })).toBe(false);
    });
});

describe('cells', () => {
    it('places fine field 6 east of the cell centre', () => {
        expect(fireGridCenter(P, { i: 4, j: 2, k: 6 })).toEqual([2570958.3333333335, 1255625]);
        expect(fireGridCenter(P, { i: 4, j: 2 })).toEqual([2570875, 1255625]);
    });

    it('finds the fine field of an LV95 point, null outside', () => {
        expect(cellFromLv95(P, 2570000, 1256000)).toEqual({ i: 1, j: 1, k: 1 });
        expect(cellFromLv95(P, 2574999.9, 1253000.1)).toEqual({ i: 20, j: 12, k: 9 });
        expect(cellFromLv95(P, 2575000, 1255000)).toBeNull();
        expect(cellFromLv95(P, 2570958.33, 1255625)).toEqual({ i: 4, j: 2, k: 6 });
    });

    it('finds the fine field of a map position', () => {
        expect(cellAt(P, 7.053562823310347, 47.45077000975388)).toEqual({ i: 4, j: 2, k: 6 });
        expect(cellAt(P, -0.12, 51.5)).toBeNull();
    });
});

describe('grid parameters', () => {
    it('accepts the Einheitsfeuerplan default grid', () => {
        expect(validateFireGrid(P)).toEqual([]);
    });

    it('rejects sizes that do not divide 1000 m, too many cells and an origin abroad', () => {
        expect(validateFireGrid({ ...P, z: 300 })).toHaveLength(1);
        expect(validateFireGrid({ ...P, z: 5 })).toHaveLength(1);
        expect(validateFireGrid({ ...P, ncols: 81 })).toHaveLength(1);
        expect(validateFireGrid({ ...P, nrows: 0 })).toHaveLength(1);
        expect(validateFireGrid({ ...P, e0: 3500000 })).toHaveLength(1);
        expect(validateFireGrid({ ...P, e0: Number.NaN })).toHaveLength(1);
    });

    it('reads the grid of an Einheitsfeuerplan link', () => {
        const link = 'file:///C:/Users/x/20261116_Einheitsfeuerplan_V1.3.html#e0=2571000&n0=1257000&z=125&c=30&r=20';
        expect(parseFireGridLink(link)).toEqual({ e0: 2571000, n0: 1257000, z: 125, ncols: 30, nrows: 20 });
        expect(parseFireGridLink(`#${fireGridHash(P)}`)).toEqual(P);
        expect(parseFireGridLink(fireGridHash(P))).toEqual(P);
    });

    it('rejects an incomplete or invalid link', () => {
        expect(parseFireGridLink('#e0=2571000&n0=1257000&z=125&c=30')).toBeNull();
        expect(parseFireGridLink('#e0=2571000&n0=1257000&z=300&c=30&r=20')).toBeNull();
        expect(parseFireGridLink('https://example.com/')).toBeNull();
    });

    it('centres a grid on a position with its origin on a whole kilometre', () => {
        const [lat, lng] = lv95ToWgs(2600400, 1199700);
        expect(fireGridAround(lng, lat, P)).toEqual({ e0: 2598000, n0: 1201000, z: 250, ncols: 20, nrows: 12 });
    });
});

describe('fireGridGeoJSON', () => {
    it('draws frame, lines, fine lines, cell labels and edge names', () => {
        const fc = fireGridGeoJSON(P);
        const count = (kind: string) => fc.features.filter((f) => f.properties.kind === kind).length;

        expect(count('frame')).toEqual(1);
        expect(count('line')).toEqual(19 + 11);
        expect(count('fine')).toEqual(40 + 24);
        expect(count('cell')).toEqual(240);
        expect(count('edge')).toEqual(2 * 20 + 2 * 12);

        const d2 = fc.features.find((f) => f.properties.label === 'D2');
        expect(d2?.geometry.type).toEqual('Point');
    });

    it('keeps a vertex at least every kilometre so lines follow LV95', () => {
        const fc = fireGridGeoJSON({ ...P, z: 1000, ncols: 20, nrows: 2 });
        const line = fc.features.find((f) => f.properties.kind === 'line' && f.geometry.type === 'LineString'
            && (f.geometry.coordinates as number[][]).length > 3);

        expect(line).toBeDefined();
    });

    it('outlines a fine field as a closed ring', () => {
        const ring = fireGridCellPolygon(P, { i: 4, j: 2, k: 6 }).geometry.coordinates[0];
        expect(ring).toHaveLength(5);
        expect(ring[0]).toEqual(ring[4]);
    });
});

describe('zoomForLength', () => {
    it('needs more zoom for smaller cells', () => {
        expect(zoomForLength(250, 40)).toBeGreaterThan(zoomForLength(1000, 40));
        expect(zoomForLength(250, 40)).toBeGreaterThan(13);
        expect(zoomForLength(250, 40)).toBeLessThan(15);
    });
});
