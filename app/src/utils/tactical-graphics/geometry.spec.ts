import { describe, it, expect } from 'vitest';
import {
    plane, along, slice, length, offset, counterClockwise, signedArea, broadArrow,
    bracket, bracketDepthPoint, zStep, sectorArc, bearing, spriteRotation, dist, type XY,
} from './geometry.ts';

describe('tactical geometry', () => {
    it('projects to metres and back', () => {
        const p = plane([7.45, 47.0]);
        const xy = p.toXY([7.46, 47.01]);
        expect(xy[0]).toBeGreaterThan(750);
        expect(xy[0]).toBeLessThan(770);
        expect(xy[1]).toBeCloseTo(1113.2, 0);
        const back = p.toLonLat(xy);
        expect(back[0]).toBeCloseTo(7.46, 9);
        expect(back[1]).toBeCloseTo(47.01, 9);
    });

    it('measures bearings clockwise from north', () => {
        expect(bearing([0, 0], [0, 10])).toBeCloseTo(0);
        expect(bearing([0, 0], [10, 0])).toBeCloseTo(90);
        expect(bearing([0, 0], [0, -10])).toBeCloseTo(180);
        // sprites point east: no rotation for an eastward line
        expect(spriteRotation([0, 0], [10, 0])).toBeCloseTo(0);
        expect(spriteRotation([0, 0], [0, 10])).toBeCloseTo(270);
    });

    it('walks along a polyline', () => {
        const line: XY[] = [[0, 0], [100, 0], [100, 100]];
        expect(length(line)).toBe(200);
        expect(along(line, 150).point).toEqual([100, 50]);
        expect(along(line, 150).dir).toEqual([0, 1]);
        expect(along(line, 500).point).toEqual([100, 100]);
        expect(slice(line, 50, 150)).toEqual([[50, 0], [100, 0], [100, 50]]);
    });

    it('offsets to the left for positive distances', () => {
        const left = offset([[0, 0], [100, 0]], 10);
        expect(left).toEqual([[0, 10], [100, 10]]);
        const corner = offset([[0, 0], [100, 0], [100, 100]], 10);
        expect(corner[1][0]).toBeCloseTo(90);
        expect(corner[1][1]).toBeCloseTo(10);
    });

    it('orients rings counter-clockwise and closes them', () => {
        const cw: XY[] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
        const ccw = counterClockwise(cw);
        expect(signedArea(ccw.slice(0, -1))).toBeGreaterThan(0);
        expect(ccw[0]).toEqual(ccw[ccw.length - 1]);
        expect(ccw).toHaveLength(5);
    });

    it('builds a broad arrow twice as wide at the head', () => {
        const arrow = broadArrow([[0, 0], [1000, 0]], 100);
        expect(arrow).toBeDefined();
        expect(arrow!.half).toBe(50);
        expect(arrow!.head[1]).toEqual([1000, 0]);
        expect(arrow!.head[0][1]).toBeCloseTo(100);
        expect(arrow!.head[2][1]).toBeCloseTo(-100);
        expect(arrow!.left[0]).toEqual([0, 50]);
        expect(arrow!.right[arrow!.right.length - 1][1]).toBeCloseTo(-50);
        expect(broadArrow([[0, 0]], 100)).toBeUndefined();
    });

    it('builds 2525C brackets: open ends p0 & p1, closed side through p2', () => {
        const b = bracket([0, 100], [0, -100], [150, 0]);
        expect(b.line).toEqual([[0, 100], [150, 100], [150, -100], [0, -100]]);
        expect(b.forward[0]).toBeCloseTo(-1);
        const p2 = bracketDepthPoint([0, 100], [0, -100]);
        expect(dist(p2, [0, 0])).toBeCloseTo(160);
    });

    it('steps a line back in its middle', () => {
        const z = zStep([[0, 0], [1000, 0]]);
        expect(z[0]).toEqual([0, 0]);
        const last = z[z.length - 1];
        expect(last[0]).toBeCloseTo(1000);
        expect(last[1]).toBeCloseTo(-100);
    });

    it('draws a sector arc through the smaller angle', () => {
        const arc = sectorArc([0, 0], [100, 10], [100, -10]);
        for (const p of arc) expect(p[0]).toBeGreaterThan(90);
    });
});
