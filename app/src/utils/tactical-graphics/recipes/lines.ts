/**
 * Lines of regulation 3.1 & 3.3: boundaries, front lines, control lines and
 * lines drawn with a repeating pattern
 */
import type { Recipe } from '../derive.ts';
import { PREFIXES } from '../model.ts';
import { endLabels, nameAlong } from './common.ts';

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
        c.pattern(c.pts, 'arc');
    },
    'flet': (c) => {
        c.pattern(c.pts, 'arc2');
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
        c.pattern(c.pts, 'xrow');
    },
    // 3.3 Sperre, Flankenschutz, Brückenkopf - ticks to the left
    'barrier': (c) => {
        c.pattern(c.pts, 'sticks-l');
        nameAlong(c, c.model.t, 1.4);
    },
    // 3.3 Binden - dense ticks to the left (inside the arc)
    'fix': (c) => {
        c.pattern(c.pts, 'ticks-l');
    },
    // 3.3 Befestigte Linie - square wave
    'fortified-line': (c) => {
        c.pattern(c.pts, 'fort');
    },
    // 3.4.1 Rutschgebiet - ticks to the right (downhill)
    'landslide': (c) => {
        c.pattern(c.pts, 'ticks-r');
        nameAlong(c, c.model.t, -1.4);
    },
    // 4.5 Eisenbahn
    'railway': (c) => {
        c.pattern(c.pts, 'rail');
    },
};
