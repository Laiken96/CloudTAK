/**
 * Plane geometry for tactical graphics. Lines are worked on in a local plane
 * in metres (an equirectangular projection around the first point), which
 * keeps angles equal to those on the Web Mercator map at tactical scales.
 *
 * Angles: `bearing` is clockwise from north in degrees (MapLibre
 * `icon-rotate` with map alignment); math angles are radians counter-
 * clockwise from east.
 */
import type { Position } from 'geojson';

export type XY = [number, number];

const METRES_PER_DEGREE = 111320;

export interface Plane {
    toXY(p: Position): XY;
    toLonLat(p: XY): Position;
}

export function plane(origin: Position): Plane {
    const kx = METRES_PER_DEGREE * Math.cos(origin[1] * Math.PI / 180);
    const ky = METRES_PER_DEGREE;

    return {
        toXY: (p) => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
        toLonLat: (p) => [origin[0] + p[0] / kx, origin[1] + p[1] / ky],
    };
}

export function add(a: XY, b: XY): XY { return [a[0] + b[0], a[1] + b[1]]; }
export function sub(a: XY, b: XY): XY { return [a[0] - b[0], a[1] - b[1]]; }
export function scale(a: XY, k: number): XY { return [a[0] * k, a[1] * k]; }
export function dist(a: XY, b: XY): number { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

export function unit(a: XY, b: XY): XY {
    const d = dist(a, b);
    return d > 0 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [1, 0];
}

/** Left-hand normal of a direction */
export function left(u: XY): XY { return [-u[1], u[0]]; }

/** Bearing from a to b, clockwise from north in degrees */
export function bearing(a: XY, b: XY): number {
    const deg = Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
    return (deg + 360) % 360;
}

/**
 * Rotation for a sprite drawn along +x (pointing east, its left side up) so
 * it follows the direction a → b on the map
 */
export function spriteRotation(a: XY, b: XY): number {
    return (bearing(a, b) - 90 + 360) % 360;
}

/** Drop consecutive duplicates - terra-draw may emit them on a double tap */
export function dedupe(points: XY[]): XY[] {
    const out: XY[] = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || dist(last, p) > 1e-6) out.push(p);
    }
    return out;
}

export function length(points: XY[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
    return total;
}

export interface Along {
    point: XY;
    /** Direction of the segment the point lies on */
    dir: XY;
    /** Index of the segment's start vertex */
    index: number;
}

/** The point at distance d along a polyline, clamped to its ends */
export function along(points: XY[], d: number): Along {
    if (points.length < 2) return { point: points[0] ?? [0, 0], dir: [1, 0], index: 0 };

    let rest = Math.max(0, d);
    for (let i = 1; i < points.length; i++) {
        const seg = dist(points[i - 1], points[i]);
        if (rest <= seg || i === points.length - 1) {
            const f = seg > 0 ? Math.min(rest / seg, 1) : 0;
            const dir = unit(points[i - 1], points[i]);
            return {
                point: [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f],
                dir,
                index: i - 1,
            };
        }
        rest -= seg;
    }

    return { point: points[points.length - 1], dir: unit(points[points.length - 2], points[points.length - 1]), index: points.length - 2 };
}

/** The part of a polyline between the distances d0 and d1 */
export function slice(points: XY[], d0: number, d1: number): XY[] {
    const total = length(points);
    const from = Math.max(0, Math.min(d0, total));
    const to = Math.max(from, Math.min(d1, total));

    const start = along(points, from);
    const end = along(points, to);

    const out: XY[] = [start.point];
    for (let i = start.index + 1; i <= end.index; i++) out.push(points[i]);
    out.push(end.point);

    return dedupe(out);
}

/**
 * Parallel of a polyline at distance d, positive to the left. Joins are
 * mitred, with the mitre limited to 3 × d on sharp turns
 */
export function offset(points: XY[], d: number): XY[] {
    const pts = dedupe(points);
    if (pts.length < 2) return pts;

    const out: XY[] = [];
    for (let i = 0; i < pts.length; i++) {
        const inDir = i > 0 ? unit(pts[i - 1], pts[i]) : undefined;
        const outDir = i < pts.length - 1 ? unit(pts[i], pts[i + 1]) : undefined;

        if (!inDir || !outDir) {
            const n = left((inDir ?? outDir) as XY);
            out.push(add(pts[i], scale(n, d)));
            continue;
        }

        const n1 = left(inDir);
        const n2 = left(outDir);
        const bisector: XY = [n1[0] + n2[0], n1[1] + n2[1]];
        const len = Math.hypot(bisector[0], bisector[1]);

        if (len < 1e-9) {
            out.push(add(pts[i], scale(n1, d)));
            continue;
        }

        const b = scale(bisector, 1 / len);
        const cos = b[0] * n1[0] + b[1] * n1[1];
        const miter = Math.min(1 / Math.max(cos, 1e-9), 3);
        out.push(add(pts[i], scale(b, d * miter)));
    }

    return out;
}

/** Twice the signed area of a ring - positive when counter-clockwise */
export function signedArea(ring: XY[]): number {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        sum += a[0] * b[1] - b[0] * a[1];
    }
    return sum;
}

/**
 * A closed ring (first point repeated last) running counter-clockwise, so
 * its inside lies to the left of the direction of travel
 */
export function counterClockwise(ring: XY[]): XY[] {
    const open = dedupe(ring);
    if (open.length > 1 && dist(open[0], open[open.length - 1]) < 1e-6) open.pop();
    if (signedArea(open) < 0) open.reverse();
    if (open.length) open.push(open[0]);
    return open;
}

/** Points of a circular arc, math angles in radians, from a0 to a1 */
export function arc(center: XY, radius: number, a0: number, a1: number, step = Math.PI / 36): XY[] {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step) + 1);
    const out: XY[] = [];
    for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * (i / (n - 1));
        out.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
    }
    return out;
}

export function angleOf(center: XY, p: XY): number {
    return Math.atan2(p[1] - center[1], p[0] - center[0]);
}

export interface BroadArrow {
    /** Body side lines, tail to head base */
    left: XY[];
    right: XY[];
    /** Head outline: outer left, tip, outer right */
    head: [XY, XY, XY];
    /** Head base on the centre line and the direction there */
    base: XY;
    dir: XY;
    /** Half width of the body */
    half: number;
}

/**
 * A broad arrow (axis of advance, main/supporting attack) around a centre
 * line drawn from tail to tip. The head is twice the body width wide
 */
export function broadArrow(points: XY[], width: number): BroadArrow | undefined {
    const pts = dedupe(points);
    if (pts.length < 2) return undefined;

    const total = length(pts);
    const half = Math.min(width / 2, total / 3);
    const headLength = Math.min(half * 2.2, total * 0.6);

    const body = slice(pts, 0, total - headLength);
    const end = along(pts, total);
    const baseAt = along(pts, total - headLength);
    const dir = unit(baseAt.point, end.point);
    const n = left(dir);

    const leftLine = offset(body, half);
    const rightLine = offset(body, -half);

    // The body's last vertices meet the head base square to the head
    leftLine[leftLine.length - 1] = add(baseAt.point, scale(n, half));
    rightLine[rightLine.length - 1] = add(baseAt.point, scale(n, -half));

    return {
        left: leftLine,
        right: rightLine,
        head: [add(baseAt.point, scale(n, half * 2)), end.point, add(baseAt.point, scale(n, -half * 2))],
        base: baseAt.point,
        dir,
        half,
    };
}

/**
 * Bracket of the 2525C task graphics Breach & Canalize: p0 & p1 are the open
 * ends, the closed side runs parallel to them through p2
 */
export function bracket(p0: XY, p1: XY, p2: XY): { line: XY[]; forward: XY; across: XY } {
    const across = unit(p0, p1);
    const n = left(across);
    const depth = (p2[0] - p0[0]) * n[0] + (p2[1] - p0[1]) * n[1];
    const back = scale(n, depth);

    return {
        line: [p0, add(p0, back), add(p1, back), p1],
        // Away from the closed side, through the opening
        forward: depth >= 0 ? scale(n, -1) : n,
        across,
    };
}

/** Default third point of a bracket drawn with two points only */
export function bracketDepthPoint(p0: XY, p1: XY): XY {
    const mid: XY = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    return add(mid, scale(left(unit(p0, p1)), dist(p0, p1) * 0.8));
}

/**
 * A polyline with a Z-shaped step in its middle (reconnaissance, electronic
 * warfare): the line runs on, steps back diagonally to the right and carries
 * on parallel. Size relative to the line's length
 */
export function zStep(points: XY[], at = 0.5): XY[] {
    const pts = dedupe(points);
    const total = length(pts);
    if (pts.length < 2 || total <= 0) return pts;

    const half = total * 0.07;
    const drop = total * 0.1;
    const mid = total * at;

    const head = slice(pts, 0, mid + half);
    const tail = offset(slice(pts, mid - half, total), -drop);

    return [...head, ...tail];
}

/** Arc between b and c around the apex a (the smaller angle), radius = mean of |ab| and |ac| */
export function sectorArc(a: XY, b: XY, c: XY): XY[] {
    const r = (dist(a, b) + dist(a, c)) / 2;
    const ab = angleOf(a, b);
    let ac = angleOf(a, c);
    let delta = ac - ab;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    ac = ab + delta;
    return arc(a, r, ab, ac);
}
