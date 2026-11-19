import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n/index.ts';
import { COORD_MODES, formatCoordPair, parseCoordPair, plainCoordPair, shownCoordMode, validateCoordPair } from './coordinateFormat.ts';

const THIN = '\u2009';

describe('coordinateFormat', () => {
    const lat = 39.739236;
    const lng = -104.990251;

    it('supports all configured coordinate modes', () => {
        expect(COORD_MODES.map((mode) => mode.value)).toEqual(['dd', 'dm', 'dms', 'mgrs', 'utm', 'lv95']);
    });

    it.each(COORD_MODES.map((mode) => mode.value))('round-trips %s coordinates', (mode) => {
        const formatted = formatCoordPair(lat, lng, mode);
        const parsed = parseCoordPair(formatted, mode);

        // LV95 falls back to MGRS this far from Switzerland
        const digits = mode === 'mgrs' || mode === 'lv95' ? 3 : 4;
        expect(parsed[0]).toBeCloseTo(lat, digits);
        expect(parsed[1]).toBeCloseTo(lng, digits);
        expect(validateCoordPair(formatted, mode)).toBe('');
    });

    it('parses signed decimal coordinate pairs', () => {
        expect(parseCoordPair('39.135606, -110.0', 'dd')).toEqual([39.135606, -110]);
        expect(validateCoordPair('39.135606, -110.0', 'dd')).toBe('');
    });
});

describe('coordinateFormat LV95', () => {
    // LV95 projection centre in Bern, near the Bundeshaus: E 2 600 000 / N 1 200 000
    const bern = { lat: 46.95108111111111, lng: 7.438637222222222 };
    // Fine field D2/6 of the Einheitsfeuerplan default grid (fire-grid.spec.ts)
    const d26 = { lat: 47.45077000975388, lng: 7.053562823310347 };

    it('shows whole metres in groups of three as the Swiss Army writes them', () => {
        expect(formatCoordPair(bern.lat, bern.lng, 'lv95')).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);
        expect(formatCoordPair(d26.lat, d26.lng, 'lv95')).toBe(`2${THIN}570${THIN}958 / 1${THIN}255${THIN}625`);
        expect(shownCoordMode(bern.lat, bern.lng, 'lv95')).toBe('lv95');
    });

    it('copies plain metres, other formats as shown', () => {
        expect(plainCoordPair(bern.lat, bern.lng, 'lv95')).toBe('2600000 1200000');
        expect(plainCoordPair(d26.lat, d26.lng, 'lv95')).toBe('2570958 1255625');
        expect(plainCoordPair(bern.lat, bern.lng, 'mgrs')).toBe(formatCoordPair(bern.lat, bern.lng, 'mgrs'));
        expect(plainCoordPair(bern.lat, bern.lng, 'dd', 5)).toBe(formatCoordPair(bern.lat, bern.lng, 'dd', 5));
    });

    it('falls back to MGRS outside Switzerland', () => {
        for (const [lat, lng] of [[48.8566, 2.3522], [39.739236, -104.990251], [-33.86, 151.21]]) {
            expect(shownCoordMode(lat, lng, 'lv95')).toBe('mgrs');
            expect(formatCoordPair(lat, lng, 'lv95')).toBe(formatCoordPair(lat, lng, 'mgrs'));
            expect(plainCoordPair(lat, lng, 'lv95')).toBe(formatCoordPair(lat, lng, 'mgrs'));
        }

        expect(shownCoordMode(48.8566, 2.3522, 'dd')).toBe('dd');
    });

    it('round-trips LV95 text to the same metres', () => {
        for (const p of [bern, d26, { lat: 46.0441, lng: 8.7305 }, { lat: 47.1410, lng: 9.5209 }]) {
            const shown = formatCoordPair(p.lat, p.lng, 'lv95');
            const [lat, lng] = parseCoordPair(shown, 'lv95');
            expect(formatCoordPair(lat, lng, 'lv95')).toBe(shown);

            const plain = plainCoordPair(p.lat, p.lng, 'lv95');
            expect(plainCoordPair(...parseCoordPair(plain, 'lv95'), 'lv95')).toBe(plain);
        }
    });

    it('reads both LV95 notations and LV03 in every mode', () => {
        const inputs = [
            '2600000 1200000',
            "2'600'000 / 1'200'000",
            `2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`,
            '2 600 000 / 1 200 000',
            'E 2600000 N 1200000',
            '600000 200000',
            "600'000 / 200'000",
        ];

        for (const mode of [undefined, ...COORD_MODES.map((m) => m.value)]) {
            for (const text of inputs) {
                const [lat, lng] = parseCoordPair(text, mode);
                expect(lat).toBeCloseTo(bern.lat, 9);
                expect(lng).toBeCloseTo(bern.lng, 9);
                expect(validateCoordPair(text, mode)).toBe('');
            }
        }
    });

    it('reads other formats in LV95 mode, shown outside Switzerland', () => {
        const mgrs = formatCoordPair(48.8566, 2.3522, 'lv95');
        const [lat, lng] = parseCoordPair(mgrs, 'lv95');
        expect(lat).toBeCloseTo(48.8566, 3);
        expect(lng).toBeCloseTo(2.3522, 3);

        expect(parseCoordPair('46.95, 7.44', 'lv95')).toEqual([46.95, 7.44]);
    });

    it('explains LV95 input it cannot place', () => {
        expect(validateCoordPair('2999999 1999999', 'lv95')).toBe('Swiss coordinates outside Switzerland');
        expect(validateCoordPair('899999 999999')).toBe('Swiss coordinates outside Switzerland');
        expect(validateCoordPair('1200000 2600000', 'lv95')).toBe('Expected LV95 coordinates like "2600000 1200000"');
        expect(validateCoordPair('Bern', 'lv95')).toBe('Expected LV95 coordinates like "2600000 1200000"');
        expect(validateCoordPair('', 'lv95')).toBe('Coordinates are required');
    });

    describe('in German', () => {
        afterEach(() => setLocale('en', { reload: false }));

        it('explains in the language of the app', () => {
            setLocale('de', { reload: false });

            expect(validateCoordPair('2999999 1999999', 'lv95')).toBe('Landeskoordinaten ausserhalb der Schweiz');
            expect(validateCoordPair('Bern', 'lv95')).toBe('LV95-Koordinaten erwartet, z. B. «2600000 1200000»');
            expect(validateCoordPair('95, 7', 'dd')).toBe('Breitengrad muss zwischen -90° und 90° liegen');
        });
    });
});
