/**
 * Lines of regulation 3.1 & 3.3: boundaries, front lines, control lines and
 * lines drawn with a repeating pattern
 */
import type { Recipe } from '../derive.ts';
import { PREFIXES } from '../model.ts';
import { endLabels } from './common.ts';

/** Height of the front line arc sprites, see sprites.ts */
const ARC_WIDTH = 20;

export const LINES: Record<string, Recipe> = {
    // 3.1 / 3.3 Abschnittsgrenze, Führungslinie: hierarchy sign in the middle,
    // unit designations on either side
    'boundary': (c) => {
        c.outline();
        const mid = c.mid;
        const rot = c.rotation(mid.dir);
        if (c.model.ech) c.icon(mid.point, `ech-${c.model.ech}`, rot);
        if (c.model.t) c.textAlong(mid.point, c.model.t, rot, { oy: -1.35 });
        if (c.model.t1) c.textAlong(mid.point, c.model.t1, rot, { oy: 1.35 });
    },
    // 3.3 Vordere Linie eigener / gegnerischer Truppen - the arcs face the
    // left of the drawing direction, as in 2525C (FLOT)
    'flot': (c) => {
        c.pattern(c.pts, 'arc', ARC_WIDTH);
    },
    'flet': (c) => {
        c.pattern(c.pts, 'arc2', ARC_WIDTH);
    },
    'phase-line': (c) => {
        c.outline();
        endLabels(c, PREFIXES.phaseLine);
    },
    'line-of-departure': (c) => {
        c.outline();
        endLabels(c, PREFIXES.lineOfDeparture);
    },
    'fire-coordination-line': (c) => {
        c.outline();
        endLabels(c, PREFIXES.fireCoordinationLine);
    },
    // 3.3 Hindernis; härten, absperren - a row of crosses, no line
    'obstacle': (c) => {
        c.pattern(c.pts, 'xrow', 14);
    },
};
