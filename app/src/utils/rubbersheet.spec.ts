import { describe, expect, it } from 'vitest';
import {
    fromMercator,
    groundOverlayKml,
    moveQuad,
    parseGroundOverlays,
    pixelToLngLat,
    placeImage,
    quadCenter,
    quadFromControlPoints,
    quadRotation,
    quadSize,
    rotateQuad,
    scaleQuad,
    toMercator,
    type LngLat,
    type Quad,
} from './rubbersheet.ts';

const CENTER: LngLat = [7.0536, 47.4508];

function expectQuad(actual: Quad, expected: Quad, digits = 9): void {
    actual.forEach((corner, i) => {
        expect(corner[0]).toBeCloseTo(expected[i][0], digits);
        expect(corner[1]).toBeCloseTo(expected[i][1], digits);
    });
}

describe('Mercator', () => {
    it('round trips a position', () => {
        const [lng, lat] = fromMercator(toMercator(CENTER));
        expect(lng).toBeCloseTo(CENTER[0], 12);
        expect(lat).toBeCloseTo(CENTER[1], 12);
    });
});

describe('placeImage', () => {
    it('lays an image north up around a centre with its longer side the given ground length', () => {
        const q = placeImage(1600, 900, CENTER, 2000);

        const size = quadSize(q);
        expect(size.width).toBeCloseTo(2000, 0);
        expect(size.height).toBeCloseTo(1125, 0);
        expect(quadRotation(q)).toEqual(0);

        const [lng, lat] = quadCenter(q);
        expect(lng).toBeCloseTo(CENTER[0], 9);
        expect(lat).toBeCloseTo(CENTER[1], 9);

        // Top left is north west of bottom right
        expect(q[0][0]).toBeLessThan(q[2][0]);
        expect(q[0][1]).toBeGreaterThan(q[2][1]);
    });

    it('uses the height for portrait images', () => {
        const size = quadSize(placeImage(900, 1600, CENTER, 2000));
        expect(size.height).toBeCloseTo(2000, 0);
        expect(size.width).toBeCloseTo(1125, 0);
    });
});

describe('transforms', () => {
    const q = placeImage(1000, 500, CENTER, 1000);

    it('rotates clockwise about the centre', () => {
        const r = rotateQuad(q, 90);
        expect(quadRotation(r)).toEqual(90);
        expect(quadRotation(rotateQuad(q, -30))).toEqual(-30);

        const [lng, lat] = quadCenter(r);
        expect(lng).toBeCloseTo(CENTER[0], 9);
        expect(lat).toBeCloseTo(CENTER[1], 9);

        expectQuad(rotateQuad(r, -90), q);
    });

    it('scales about the centre', () => {
        const s = scaleQuad(q, 2);
        expect(quadSize(s).width).toBeCloseTo(2000, 0);
        expectQuad(scaleQuad(s, 0.5), q);
    });

    it('moves the sheet by the offset of two positions', () => {
        const to: LngLat = [7.06, 47.46];
        const [lng, lat] = quadCenter(moveQuad(q, quadCenter(q), to));
        expect(lng).toBeCloseTo(to[0], 9);
        expect(lat).toBeCloseTo(to[1], 9);
    });
});

describe('quadFromControlPoints', () => {
    it('recovers a placed, rotated and scaled sheet from two points', () => {
        const original = scaleQuad(rotateQuad(placeImage(1200, 800, CENTER, 1500), 23), 1.3);
        const p1: [number, number] = [150, 620], p2: [number, number] = [1010, 90];

        const q = quadFromControlPoints(1200, 800, p1, p2,
            pixelToLngLat(original, 1200, 800, p1),
            pixelToLngLat(original, 1200, 800, p2));

        expect(q).not.toBeNull();
        expectQuad(q as Quad, original, 8);
    });

    it('refuses points that coincide', () => {
        expect(quadFromControlPoints(100, 100, [10, 10], [10, 10], CENTER, [7.06, 47.46])).toBeNull();
        expect(quadFromControlPoints(100, 100, [10, 10], [50, 50], CENTER, CENTER)).toBeNull();
        expect(quadFromControlPoints(100, 100, [Number.NaN, 10], [50, 50], CENTER, [7.06, 47.46])).toBeNull();
    });
});

describe('KML', () => {
    const q = rotateQuad(placeImage(1000, 700, CENTER, 800), 12);

    it('writes the GroundOverlay as ATAK exports it and reads it back', () => {
        const kml = groundOverlayKml('Lageskizze FURY <1>', 'Lageskizze-FURY-1.png', q);

        expect(kml).toContain('<gx:LatLonQuad>');
        expect(kml).toContain('<name>Lageskizze FURY &lt;1&gt;</name>');

        // Counter clockwise from the lower left corner
        const coords = kml.match(/<coordinates>([^<]+)<\/coordinates>/)?.[1].split(' ');
        expect(coords?.[0]).toEqual(`${q[3][0]},${q[3][1]},0`);
        expect(coords?.[3]).toEqual(`${q[0][0]},${q[0][1]},0`);

        expect(parseGroundOverlays(kml)).toEqual([{ name: 'Lageskizze FURY <1>', href: 'Lageskizze-FURY-1.png', quad: q }]);
    });

    it('reads a LatLonBox with its counter clockwise rotation', () => {
        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><GroundOverlay>
  <name>Scan</name>
  <Icon><href>files/scan.jpg</href></Icon>
  <LatLonBox><north>47.46</north><south>47.44</south><east>7.07</east><west>7.04</west><rotation>15</rotation></LatLonBox>
</GroundOverlay></Document></kml>`;

        const [overlay] = parseGroundOverlays(kml);
        expect(overlay.name).toEqual('Scan');
        expect(overlay.href).toEqual('files/scan.jpg');
        expect(quadRotation(overlay.quad)).toEqual(-15);

        const [lng, lat] = quadCenter(overlay.quad);
        expect(lng).toBeCloseTo(7.055, 6);
        expect(lat).toBeCloseTo(47.45, 3);
    });

    it('skips overlays without an image or position, and broken documents', () => {
        expect(parseGroundOverlays('<kml><GroundOverlay><name>x</name></GroundOverlay></kml>')).toEqual([]);
        expect(parseGroundOverlays('not xml <')).toEqual([]);
    });
});
