import { describe, expect, it } from 'vitest';
import {
    bankersRound,
    formatLv95,
    formatLv95Plain,
    inSwitzerland,
    lv95InArea,
    lv95ToLngLat,
    lv95ToWgs,
    parseLv03,
    parseLv95,
    parseSwissGrid,
    wgsToLv95,
} from './lv95.ts';

const THIN = '\u2009';

describe('LV95', () => {
    it('converts with the swisstopo approximation', () => {
        // Projection centre in Bern (near the Bundeshaus)
        expect(lv95ToWgs(2600000, 1200000)).toEqual([46.95108111111111, 7.438637222222222]);
        // Reference values of the Einheitsfeuerplan V1.3 core (fire grid D2/6)
        expect(lv95ToWgs(2570958.3333333335, 1255625)).toEqual([47.45077000975388, 7.053562823310347]);
        expect(lv95ToLngLat(2600000, 1200000)).toEqual([7.438637222222222, 46.95108111111111]);
    });

    it('inverts exactly to the drawn grid', () => {
        const [E, N] = wgsToLv95(47.45077000975388, 7.053562823310347);
        expect(E).toBeCloseTo(2570958.3333, 3);
        expect(N).toBeCloseTo(1255625, 3);
    });

    it('matches the worked example of swisstopo within a metre', () => {
        // swisstopo, approximate formulas CH1903 <-> WGS84: 46° 02' 38.87" N, 8° 43' 49.79" E
        const [E, N] = wgsToLv95(46 + 2 / 60 + 38.87 / 3600, 8 + 43 / 60 + 49.79 / 3600);
        expect(Math.abs(E - 2699999.76)).toBeLessThan(1);
        expect(Math.abs(N - 1099999.97)).toBeLessThan(1);
    });

    it('knows the area around Switzerland and Liechtenstein', () => {
        expect(inSwitzerland(46.95, 7.44)).toBe(true);
        expect(inSwitzerland(47.14, 9.52)).toBe(true); // Vaduz
        expect(inSwitzerland(48.86, 2.35)).toBe(false); // Paris
        expect(inSwitzerland(39.74, -104.99)).toBe(false);
        expect(inSwitzerland(NaN, 7.44)).toBe(false);

        expect(lv95InArea(2600000, 1200000)).toBe(true);
        expect(lv95InArea(2999999, 1999999)).toBe(false);
    });

    it('rounds halves to even like the Einheitsfeuerplan', () => {
        expect([12.5, 13.5, 2570012.5, 958.33, 958.5001].map(bankersRound)).toEqual([12, 14, 2570012, 958, 959]);
    });
});

describe('formatLv95', () => {
    it('writes whole metres in groups of three, easting first', () => {
        expect(formatLv95(2600000, 1200000)).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);
        expect(formatLv95(2570958.3333, 1255625.5)).toBe(`2${THIN}570${THIN}958 / 1${THIN}255${THIN}626`);
    });

    it('writes plain metres to copy', () => {
        expect(formatLv95Plain(2600000.4, 1199999.6)).toBe('2600000 1200000');
    });
});

describe('parseLv95', () => {
    it('reads LV95 pairs as written on Swiss maps and lists', () => {
        for (const text of [
            '2570958 1255625',
            '2570958/1255625',
            "2'570'958, 1'255'625",
            '2’570’958 / 1’255’625',
            '2 570 958 / 1 255 625',
            '2 570 958 1 255 625',
            `2${THIN}570${THIN}958 / 1${THIN}255${THIN}625`,
            'E 2570958 N 1255625',
        ]) {
            expect(parseLv95(text)).toEqual([2570958, 1255625]);
        }
        expect(parseLv95('2570958.4 1255625.6')).toEqual([2570958.4, 1255625.6]);
    });

    it('rejects other coordinates', () => {
        for (const text of ['570958 255625', '32TLT5327257094', '47.45, 7.05', '1255625 2570958']) {
            expect(parseLv95(text)).toBeNull();
        }
    });
});

describe('parseLv03', () => {
    it('reads LV03 pairs and returns them in LV95', () => {
        for (const text of ['600000 200000', "600'000 / 200'000", '600 000 / 200 000', '600000, 200000']) {
            expect(parseLv03(text)).toEqual([2600000, 1200000]);
        }
        // Five digit northing in southern Ticino
        expect(parseLv03('722000 77000')).toEqual([2722000, 1077000]);
    });

    it('rejects LV95 and other coordinates', () => {
        for (const text of ['2600000 1200000', '47.45, 7.05', '32T 381879 5200552', '300000 200000', '600000']) {
            expect(parseLv03(text)).toBeNull();
        }
    });
});

describe('parseSwissGrid', () => {
    it('tells LV95 from LV03 input', () => {
        expect(parseSwissGrid("2'600'000 / 1'200'000")).toEqual({ frame: 'lv95', E: 2600000, N: 1200000 });
        expect(parseSwissGrid('600000 200000')).toEqual({ frame: 'lv03', E: 2600000, N: 1200000 });
        expect(parseSwissGrid('Bern')).toBeNull();
        expect(parseSwissGrid('46.95, 7.44')).toBeNull();
    });
});
