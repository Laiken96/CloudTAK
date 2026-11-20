/**
 * Building blocks shared by the signature recipes
 */
import type { RenderContext, Dash } from '../derive.ts';
import { labelText } from '../model.ts';
import { add, scale, left, broadArrow, counterClockwise, type XY, type BroadArrow } from '../geometry.ts';

/** Prefix + designation below both ends of a line (PhL, AL, FKL) */
export function endLabels(c: RenderContext, prefix?: string): void {
    const txt = labelText(prefix, c.model);
    if (!txt) return;

    const start = c.start;
    const end = c.end;
    c.text(start.point, txt, { anchor: start.dir[0] >= 0 ? 'top-left' : 'top-right', oy: 0.4 });
    c.text(end.point, txt, { anchor: end.dir[0] >= 0 ? 'top-right' : 'top-left', oy: 0.4 });
}

/** The designation left of (above) the middle of a line */
export function nameAlong(c: RenderContext, txt = c.model.t, oy = -1.2): void {
    if (!txt) return;
    const mid = c.mid;
    c.textAlong(mid.point, txt, c.rotation(mid.dir), { oy });
}

/** Prefix + designation inside an area */
export function areaLabel(c: RenderContext, prefix?: string): void {
    const txt = labelText(prefix, c.model);
    if (txt) c.text(c.inside(), txt);
}

/** A sprite at the end (or start, pointing backwards) of the line */
export function head(c: RenderContext, name = 'head', at: 'end' | 'start' | 'both' = 'end'): void {
    if (at === 'end' || at === 'both') {
        const end = c.end;
        c.icon(end.point, name, c.rotation(end.dir));
    }
    if (at === 'start' || at === 'both') {
        const start = c.start;
        c.icon(start.point, name, c.rotation(scale(start.dir, -1)));
    }
}

/** A sprite at the middle of the line, turned with it */
export function midIcon(c: RenderContext, name: string, at = 0.5): void {
    const p = c.at(c.total * at);
    c.icon(p.point, name, c.rotation(p.dir));
}

/** The outer ring of the drawn area, counter-clockwise: outside is to the right */
export function ring(c: RenderContext): XY[] {
    return counterClockwise(c.pts);
}

/** Width of broad arrows, corridors & zones: stored, or relative to the drawn length */
export function groundWidth(c: RenderContext, share = 0.14): number {
    if (c.model.width && c.model.width > 0) return c.model.width;
    return Math.min(Math.max(c.total * share, 60), 6000);
}

export type BroadStyle = 'main' | 'supporting' | 'axis' | 'feint' | 'aborted' | 'position' | 'air' | 'airborne';

/** Point in arrow coordinates: `a` along from the head base, `b` across (left positive) */
function at(arrow: BroadArrow, a: number, b: number): XY {
    return add(add(arrow.base, scale(arrow.dir, a)), scale(left(arrow.dir), b));
}

/**
 * Broad arrows of regulation 3.3 (main, supporting & feint attack, axis of
 * attack, air attack …) - outline built in metres around the drawn centre line
 */
export function broad(c: RenderContext, style: BroadStyle): void {
    const arrow = broadArrow(c.pts, groundWidth(c));
    if (!arrow) {
        c.outline();
        return;
    }

    const dash: Dash = style === 'axis' ? 'dotted' : c.dash;
    const h = arrow.half;
    const headLength = Math.hypot(arrow.head[1][0] - arrow.base[0], arrow.head[1][1] - arrow.base[1]);

    let leftLine = arrow.left;
    let rightLine = arrow.right;

    if (style === 'air' || style === 'airborne') {
        // The side lines cross over before the head
        [leftLine, rightLine] = crossOver(arrow, h);
    }

    c.line(leftLine, { dash });
    c.line(rightLine, { dash });

    const bodyLeft = at(arrow, 0, h);
    const bodyRight = at(arrow, 0, -h);

    if (style === 'aborted' || style === 'position') {
        // The head ends in a zigzag instead of a point
        const L = headLength;
        c.line([bodyLeft, arrow.head[0], at(arrow, L * 0.75, h * 1.33), at(arrow, L * 0.3, h * 0.67), at(arrow, L * 0.75, 0),
            at(arrow, L * 0.3, -h * 0.67), at(arrow, L * 0.75, -h * 1.33), arrow.head[2], bodyRight], { dash });

        if (style === 'position') {
            const front = L * 1.05;
            c.line([at(arrow, front - h * 0.5, h * 2.3), at(arrow, front, h * 2.3), at(arrow, front, -h * 2.3), at(arrow, front - h * 0.5, -h * 2.3)], { dash });
        }
    } else {
        const headDash: Dash = style === 'feint' ? 'dashed' : dash;
        c.line([bodyLeft, arrow.head[0], arrow.head[1], arrow.head[2], bodyRight], { dash: headDash });

        if (style === 'main' || style === 'feint') {
            // Second head line inside the first
            c.line(innerHead(arrow, headLength, h), { dash: headDash });
        }
    }

    if (style === 'airborne') {
        const start = c.start;
        c.icon(start.point, 'boxx', c.rotation(start.dir));
    }

    if (c.model.t) {
        c.textAlong(c.mid.point, c.model.t, c.rotation(c.mid.dir), { oy: 0 });
    }
}

/** A chevron parallel to the head outline, a third of the body width inside */
function innerHead(arrow: BroadArrow, L: number, h: number): XY[] {
    const D = Math.hypot(L, 2 * h);
    const delta = h * 0.45;
    // Inner edge: (sL - 2h·δ/D, 2h(1 - s) - L·δ/D)
    const point = (s: number, side: number): XY => at(arrow, s * L - 2 * h * delta / D, side * (2 * h * (1 - s) - L * delta / D));
    const tipS = 1 - L * delta / (2 * h * D);
    const endS = 1 - (1.25 * h + L * delta / D) / (2 * h);
    return [point(endS, 1), point(tipS, 0), point(endS, -1)];
}

function crossOver(arrow: BroadArrow, h: number): [XY[], XY[]] {
    const crossStart = -h * 2.6;

    const cut = (line: XY[]): XY[] => {
        // Keep the part of the side line behind the crossing
        const out: XY[] = [];
        for (const p of line) {
            const a = (p[0] - arrow.base[0]) * arrow.dir[0] + (p[1] - arrow.base[1]) * arrow.dir[1];
            if (a < crossStart) out.push(p);
        }
        return out;
    };

    const leftLine = [...cut(arrow.left), at(arrow, crossStart, h), at(arrow, 0, -h)];
    const rightLine = [...cut(arrow.right), at(arrow, crossStart, -h), at(arrow, 0, h)];
    return [leftLine, rightLine];
}
