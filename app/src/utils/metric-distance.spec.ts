import { describe, expect, it } from 'vitest';
import { decimalComma, formatMetric, metricUnit } from './metric-distance.ts';

describe('formatMetric', () => {
    it('shows whole metres below 1000 m', () => {
        expect(formatMetric(0)).toBe('0 m');
        expect(formatMetric(850.4)).toBe('850 m');
        expect(formatMetric(999.4)).toBe('999 m');
    });

    it('shows km with a decimal comma from 1000 m', () => {
        expect(formatMetric(1000)).toBe('1,0 km');
        expect(formatMetric(1234)).toBe('1,2 km');
        expect(formatMetric(12_345)).toBe('12,3 km');
        // Rounds to 1000 m - shown as km, never as "1000 m"
        expect(formatMetric(999.6)).toBe('1,0 km');
    });

    it('takes the places after the comma', () => {
        expect(formatMetric(2345, 2)).toBe('2,35 km');
        expect(formatMetric(850, 2)).toBe('850 m');
    });

    it('shows a dash for values that are no distance', () => {
        expect(formatMetric(NaN)).toBe('–');
        expect(formatMetric(-1)).toBe('–');
    });
});

describe('metricUnit', () => {
    it('switches the meter setting to km from 1000 m', () => {
        expect(metricUnit('meter', 0.85)).toBe('meter');
        expect(metricUnit('meter', 0.9996)).toBe('kilometer');
        expect(metricUnit('meter', 1.2)).toBe('kilometer');
    });

    it('leaves every other setting as it is', () => {
        expect(metricUnit('kilometer', 0.1)).toBe('kilometer');
        expect(metricUnit('mile', 5)).toBe('mile');
    });
});

describe('decimalComma', () => {
    it('writes the decimal point as a comma', () => {
        expect(decimalComma(1.25)).toBe('1,25');
        expect(decimalComma('850')).toBe('850');
    });
});
