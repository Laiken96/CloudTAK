import { describe, expect, it } from 'vitest';
import {
    POINT_TARGET_COLOR,
    POINT_TARGET_TYPE,
    lv95Readout,
    nextTargetName,
    pointTargetFeature,
    targetName,
    targetNumber,
} from './point-target.ts';
import { lv95ToLngLat } from './lv95.ts';

const THIN = ' ';

describe('targetNumber', () => {
    it('reads Z and the number at the start of a callsign', () => {
        expect(targetNumber('Z01')).toBe(1);
        expect(targetNumber('Z3')).toBe(3);
        expect(targetNumber('Z12')).toBe(12);
        expect(targetNumber('  Z07')).toBe(7);
        expect(targetNumber('z05')).toBe(5);
    });

    it('reads the targets of the Einheitsfeuerplan', () => {
        expect(targetNumber('Z03 D2/6')).toBe(3);
        expect(targetNumber('Z14 A1/2')).toBe(14);
        expect(targetNumber('Z03A')).toBe(3);
    });

    it('takes no other name for a target', () => {
        expect(targetNumber('Zug 3')).toBeNull();
        expect(targetNumber('Z 3')).toBeNull();
        expect(targetNumber('Ziel 4')).toBeNull();
        expect(targetNumber('AZ01')).toBeNull();
        expect(targetNumber('Z0')).toBeNull();
        expect(targetNumber('Z00')).toBeNull();
        expect(targetNumber('Z12345')).toBeNull();
        expect(targetNumber('New Feature')).toBeNull();
        expect(targetNumber('')).toBeNull();
        expect(targetNumber(undefined)).toBeNull();
        expect(targetNumber(7)).toBeNull();
    });
});

describe('nextTargetName', () => {
    it('starts with Z01', () => {
        expect(nextTargetName([])).toBe('Z01');
        expect(nextTargetName(['New Feature', 'Zug 3', undefined])).toBe('Z01');
    });

    it('takes the number after the highest', () => {
        expect(nextTargetName(['Z01', 'Z02'])).toBe('Z03');
        expect(nextTargetName(['Z02', 'Z01'])).toBe('Z03');
    });

    it('does not fill a gap', () => {
        expect(nextTargetName(['Z01', 'Z03'])).toBe('Z04');
        expect(nextTargetName(['Z05'])).toBe('Z06');
    });

    it('does not double a target of the Einheitsfeuerplan', () => {
        expect(nextTargetName(['Z03 D2/6', 'Z07 D2/6', 'EFP Raster'])).toBe('Z08');
        expect(nextTargetName(['Z01', 'Z09 B1/1'])).toBe('Z10');
    });

    it('counts the same number twice only once', () => {
        expect(nextTargetName(['Z02', 'Z02', 'z2'])).toBe('Z03');
    });

    it('goes past Z99', () => {
        expect(nextTargetName(['Z99'])).toBe('Z100');
        expect(targetName(7)).toBe('Z07');
        expect(targetName(123)).toBe('Z123');
    });

    it('reads any iterable', () => {
        expect(nextTargetName(new Set(['Z01', 'Z04 D2/6']))).toBe('Z05');
    });
});

describe('pointTargetFeature', () => {
    it('is a kept spot marker in the colour of the Einheitsfeuerplan targets', () => {
        const now = new Date('2026-11-24T10:00:00Z');
        const feat = pointTargetFeature('Z04', [7.5, 46.9], { id: 'target-1', now });

        expect(feat.id).toBe('target-1');
        expect(feat.path).toBe('/');
        expect(feat.geometry).toEqual({ type: 'Point', coordinates: [7.5, 46.9] });
        expect(feat.properties).toEqual({
            id: 'target-1',
            type: POINT_TARGET_TYPE,
            how: 'h-g-i-g-o',
            archived: true,
            callsign: 'Z04',
            time: '2026-11-24T10:00:00.000Z',
            start: '2026-11-24T10:00:00.000Z',
            stale: '2026-11-24T12:00:00.000Z',
            center: [7.5, 46.9],
            'marker-color': POINT_TARGET_COLOR,
            'marker-opacity': 1,
        });
        expect(POINT_TARGET_TYPE).toBe('b-m-p-s-m');
        expect(POINT_TARGET_COLOR).toBe('#FFD60A');
    });

    it('gets a fresh id', () => {
        const a = pointTargetFeature('Z01', [7.5, 46.9]);
        const b = pointTargetFeature('Z02', [7.5, 46.9]);

        expect(a.id).toBeTruthy();
        expect(a.id).toBe(a.properties.id);
        expect(a.id).not.toBe(b.id);
    });
});

describe('lv95Readout', () => {
    it('writes LV95 as the GPS panel: groups of three, slash between', () => {
        const readout = lv95Readout(lv95ToLngLat(2564579, 1252022));

        expect(readout.inArea).toBe(true);
        if (!readout.inArea) return;
        expect(readout.text).toBe(`2${THIN}564${THIN}579 / 1${THIN}252${THIN}022`);
        expect(Math.round(readout.E)).toBe(2564579);
        expect(Math.round(readout.N)).toBe(1252022);
    });

    it('gives whole metres', () => {
        const readout = lv95Readout(lv95ToLngLat(2600000.4, 1199999.6));

        expect(readout.inArea && readout.text).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);
    });

    it('covers the corners of Switzerland', () => {
        // Chancy (GE) and Samnaun (GR)
        expect(lv95Readout([5.97, 46.15]).inArea).toBe(true);
        expect(lv95Readout([10.36, 46.94]).inArea).toBe(true);
    });

    it('gives no numbers outside Switzerland', () => {
        expect(lv95Readout([2.35, 48.85])).toEqual({ inArea: false });   // Paris
        expect(lv95Readout([16.37, 48.21])).toEqual({ inArea: false });  // Vienna
        expect(lv95Readout([-74.0, 40.7])).toEqual({ inArea: false });   // New York
        expect(lv95Readout([7.5, Number.NaN])).toEqual({ inArea: false });
    });
});
