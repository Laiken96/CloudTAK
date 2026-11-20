/**
 * Signatures built in metres from a few drawn points: corridors and zones
 * around a centre line, circles from centre and radius, sectors, the 2525C
 * brackets of breach & canalize and the boxes of clear & search
 */
import type { Recipe, RenderContext } from '../derive.ts';
import {
    add, sub, scale, unit, left, dist, offset, along, length, arc, angleOf, sectorArc,
    bracket, bracketDepthPoint, type XY,
} from '../geometry.ts';
import { groundWidth, nameAlong } from './common.ts';

function sectorPoints(c: RenderContext): [XY, XY, XY] {
    const [a, b, maybe] = c.pts;
    if (maybe) return [a, b, maybe];
    // Two points only: a sector of 60°
    const r = dist(a, b);
    const angle = angleOf(a, b) - Math.PI / 3;
    return [a, b, [a[0] + r * Math.cos(angle), a[1] + r * Math.sin(angle)]];
}

function lineHead(c: RenderContext, pts: XY[], name = 'head'): void {
    const n = pts.length;
    c.icon(pts[n - 1], name, c.rotation(unit(pts[n - 2], pts[n - 1])));
}

/** 2525C breach / canalize: bracket open at p0-p1, ticks across the open ends */
function bracketed(inward: boolean): Recipe {
    return (c) => {
        const [p0, p1, p2] = c.pts;
        const b = bracket(p0, p1, p2 ?? bracketDepthPoint(p0, p1));
        c.line(b.line, { dash: c.dash });

        const k = dist(p0, p1) * 0.14;
        for (const [end, out] of [[p0, scale(b.across, -1)], [p1, b.across]] as Array<[XY, XY]>) {
            const d = unit([0, 0], inward ? sub(b.forward, out) : add(b.forward, out));
            c.line([sub(end, scale(d, k)), add(end, scale(d, k))], { dash: c.dash });
        }

        if (c.model.t) {
            const mid: XY = scale(add(b.line[1], b.line[2]), 0.5);
            c.textAlong(mid, c.model.t, c.rotation(b.across), { oy: 1.2 });
        }
    };
}

/** Säubern / Durchsuchen: an arrow entering a square */
function boxArrow(zigzag: boolean): Recipe {
    return (c) => {
        const [a, bPoint] = c.pts;
        const L = dist(a, bPoint);
        const u = unit(a, bPoint);
        const n = left(u);
        const at = (s: number, side = 0): XY => add(add(a, scale(u, s * L)), scale(n, side * L));

        c.line([at(0.35, 0.35), at(1.05, 0.35), at(1.05, -0.35), at(0.35, -0.35), at(0.35, 0.35)], { dash: c.dash });

        const arrow = zigzag
            ? [at(0, 0.12), at(0.8, 0.12), at(0.55, -0.12), at(0.95, -0.12)]
            : [at(0, 0), at(0.95, 0)];
        c.line(arrow, { dash: c.dash });
        lineHead(c, arrow);

        if (c.model.t) c.text(at(0.7, 0), c.model.t, { anchor: 'top', oy: 1.4 });
    };
}

export const GROUND: Record<string, Recipe> = {
    // 3.3 Öffnen (reversible Hindernisse) oder Räumen (Kampfmittel) - 2525C Breach
    'breach': bracketed(true),
    // 3.3 Kanalisieren - 2525C Canalize
    'canalize': bracketed(false),
    // 3.3 Säubern, Durchsuchen
    'clear': boxArrow(false),
    'search': boxArrow(true),

    // 3.4 Streifen: two boundaries and a dashed arrow between them
    'zone': (c) => {
        const half = groundWidth(c, 0.3) / 2;
        for (const side of [1, -1]) {
            const boundary = offset(c.pts, side * half);
            c.line(boundary, { dash: c.dash });
            if (c.model.ech) {
                const mid = along(boundary, length(boundary) / 2);
                c.icon(mid.point, `ech-${c.model.ech}`, c.rotation(mid.dir));
            }
        }
        c.line(c.pts, { dash: 'dashed' });
        lineHead(c, c.pts);
        nameAlong(c, c.model.t, -0.9);
    },
    // 3.4 Luftraumkorridor: two parallels with a bow tie each
    'air-corridor': (c) => {
        const half = groundWidth(c, 0.12) / 2;
        for (const side of [1, -1]) {
            const edge = offset(c.pts, side * half);
            c.line(edge, { dash: c.dash });
            const mid = along(edge, length(edge) / 2);
            c.icon(mid.point, 'bowtie', c.rotation(mid.dir));
        }
        nameAlong(c, c.model.t, 0);
    },
    // 3.4 Isolieren: open circle, teeth inside, head - centre and radius (2525C Isolate)
    'isolate': (c) => {
        const [center, rim] = c.pts;
        const r = dist(center, rim);
        const a = angleOf(center, rim);
        // clockwise from just past the rim point round to it: the centre is to the right
        const ring = arc(center, r, a + 2 * Math.PI - 0.42, a);
        c.pattern(ring, 'teeth-r');
        lineHead(c, ring);
        if (c.model.t) c.text(center, c.model.t);
    },
    // 3.4 NBC minimale Sicherheitsdistanzzonen: three circles - centre and radius
    'nbc-zones': (c) => {
        const [center, rim] = c.pts;
        const r = dist(center, rim);
        for (const share of [1, 2 / 3, 1 / 3]) c.line(arc(center, r * share, 0, 2 * Math.PI), { dash: c.dash });
    },
    // 3.4 Wirkungsraum primär / sekundär: sector from apex, left and right edge
    'effect-primary': sector('circle-p'),
    'effect-secondary': sector('circle-s'),
    // 3.4 Beobachtungssektor: the two edges only
    'observation-sector': (c) => {
        const [a, b, d] = sectorPoints(c);
        c.line([b, a, d], { dash: c.dash });
        if (c.model.t) c.text(a, c.model.t, { anchor: 'top', oy: 0.6 });
    },

    // 4.5 Furt: two dashed parallels with a zigzag across
    'ford': (c) => {
        for (const off of [-4, 4]) c.line(c.pts, { dash: 'dashed', off, width: 2 });
        const mid = c.mid;
        c.icon(mid.point, 'fordzig', c.rotation(mid.dir));
    },
    // 4.5 Brücke: two parallels with flared ends
    'bridge': (c) => {
        for (const off of [-5, 5]) c.line(c.pts, { off, width: 2.4 });
        const start = c.start;
        const end = c.end;
        c.icon(end.point, 'flare', c.rotation(end.dir));
        c.icon(start.point, 'flare', c.rotation(scale(start.dir, -1)));
        nameAlong(c, c.model.t, -1.4);
    },
};

function sector(symbol: string): Recipe {
    return (c) => {
        const [a, b, d] = sectorPoints(c);
        const rim = sectorArc(a, b, d);
        c.line([a, ...rim, a], { dash: c.dash });
        const mid = rim[Math.floor(rim.length / 2)];
        c.icon(mid, symbol);
        if (c.model.t) c.text(a, c.model.t, { anchor: 'top', oy: 0.6 });
    };
}
