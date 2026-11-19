import { describe, expect, it } from 'vitest';
import { iconDisplayName, signatureFrom, signatureKey, signatureProperties } from './signature.ts';
import { applyAppearance, draftFrom } from './appearance.ts';
import type { Feature } from '../types.ts';

const SIDC = '10061000001211000000';

describe('signatureFrom', () => {
    it('takes only the type of a military symbol', () => {
        expect(signatureFrom({ type: SIDC, 'marker-color': '#FFFFFF' })).toEqual({ type: SIDC });
        expect(signatureFrom({ type: 'a-h-G-U-C-I' })).toEqual({ type: 'a-h-G-U-C-I' });
    });

    it('takes the icon and its colour of an Iconset icon', () => {
        expect(signatureFrom({ type: 'u-d-p', icon: 'uid:Swiss/Panzer', 'marker-color': '#ff0000' }))
            .toEqual({ type: 'u-d-p', icon: 'uid:Swiss/Panzer', color: '#FF0000' });

        // The icon wins over the symbol of a typed point
        expect(signatureFrom({ type: SIDC, icon: 'uid:Swiss/Panzer' }))
            .toEqual({ type: SIDC, icon: 'uid:Swiss/Panzer', color: '#FFFFFF' });
    });

    it('takes the colour of a spot', () => {
        expect(signatureFrom({ type: 'u-d-p', 'marker-color': '#00ff00' })).toEqual({ type: 'u-d-p', color: '#00FF00' });
        expect(signatureFrom({ type: 'b-m-p-s-m' })).toEqual({ type: 'b-m-p-s-m', color: '#FFFFFF' });
        expect(signatureFrom({} as Feature['properties'])).toEqual({ type: 'u-d-p', color: '#FFFFFF' });
    });

    it('ignores a 2525 milicon key as an Iconset icon', () => {
        expect(signatureFrom({ type: SIDC, icon: '2525D:10061000001211000000' })).toEqual({ type: SIDC });
    });
});

describe('signatureKey', () => {
    it('is the same for the same look and differs otherwise', () => {
        expect(signatureKey({ type: SIDC })).toBe(signatureKey({ type: SIDC, color: '#123456' }));
        expect(signatureKey({ type: 'u-d-p', icon: 'uid:a', color: '#ff0000' }))
            .toBe(signatureKey({ type: 'u-d-p', icon: 'uid:a', color: '#FF0000' }));
        expect(signatureKey({ type: 'u-d-p', icon: 'uid:a', color: '#FF0000' }))
            .not.toBe(signatureKey({ type: 'u-d-p', icon: 'uid:a', color: '#0000FF' }));
        expect(signatureKey({ type: 'u-d-p', icon: 'uid:a' })).not.toBe(signatureKey({ type: SIDC, icon: 'uid:a' }));
        expect(signatureKey({ type: 'u-d-p', color: '#FF0000' })).not.toBe(signatureKey({ type: 'u-d-p', color: '#00FF00' }));
    });
});

describe('signatureProperties', () => {
    it('round trips with the Appearance editor', () => {
        const cases: Array<Partial<Feature['properties']>> = [
            { type: SIDC, 'marker-color': '#FFFFFF', 'marker-opacity': 1 },
            { type: 'u-d-p', icon: 'uid:Swiss/Panzer', 'marker-color': '#FF0000', 'marker-opacity': 1 },
            { type: 'u-d-p', 'marker-color': '#00FF00', 'marker-opacity': 1 },
        ];

        for (const properties of cases) {
            const sig = signatureFrom(properties as Feature['properties']);
            const placed = signatureProperties(sig);

            expect(placed).toEqual(properties);

            // What the Appearance editor would persist for the same point
            const edited = applyAppearance(placed as Feature['properties'], draftFrom(placed as Feature['properties']));
            expect(signatureFrom(edited)).toEqual(sig);
        }
    });

    it('tints a military symbol white so the affiliation colour shows', () => {
        expect(signatureProperties({ type: SIDC, color: '#FF0000' })).toEqual({ type: SIDC, 'marker-color': '#FFFFFF', 'marker-opacity': 1 });
    });
});

describe('iconDisplayName', () => {
    it('is the file name with underscores as spaces, for any Iconset', () => {
        expect(iconDisplayName('11111111-2222-3333-4444-555555555555:Taktische Punkte/Endpunkt_EP')).toBe('Endpunkt EP');
        expect(iconDisplayName('11111111-2222-3333-4444-555555555555/Waffen/Panzer__abwehr_kanone.png')).toBe('Panzer abwehr kanone');
        expect(iconDisplayName('uid:Incident/Fire')).toBe('Fire');
        expect(iconDisplayName('Fire.png')).toBe('Fire');
    });
});
