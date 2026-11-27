import { describe, expect, it } from 'vitest';
import { formatDirection } from './direction.ts';

describe('formatDirection', () => {
    it('writes whole degrees, 0 to 359', () => {
        expect(formatDirection(90.4, 'deg')).toBe('90°');
        expect(formatDirection(359.6, 'deg')).toBe('0°');
        expect(formatDirection(-90, 'deg')).toBe('270°');
    });

    it('writes artillery mils, 6400 to the circle', () => {
        expect(formatDirection(90, 'mil')).toBe('1600 A‰');
        expect(formatDirection(180, 'mil')).toBe('3200 A‰');
        expect(formatDirection(359.99, 'mil')).toBe('0 A‰');
    });

    it('falls back to degrees for an unknown unit', () => {
        expect(formatDirection(45, 'unknown')).toBe('45°');
    });

    it('shows a dash for values that are no direction', () => {
        expect(formatDirection(NaN, 'deg')).toBe('–');
        expect(formatDirection(NaN, 'mil')).toBe('–');
    });
});
