/**
 * Task arrows and lines of regulation 3.3 (intervene, delay, withdraw,
 * reconnoitre, electronic warfare …) and further arrows of 3.4.1 & 4.5
 */
import type { Recipe, RenderContext } from '../derive.ts';
import { PREFIXES } from '../model.ts';
import { zStep, unit, type XY } from '../geometry.ts';
import { head, midIcon, nameAlong } from './common.ts';

function startIcon(c: RenderContext, name: string): void {
    const start = c.start;
    c.icon(start.point, name, c.rotation(start.dir));
}

function endIcon(c: RenderContext, name: string): void {
    const end = c.end;
    c.icon(end.point, name, c.rotation(end.dir));
}

/**
 * The drawn line with a Z-shaped step in its middle, with open heads at the
 * end (and start). Returns the stepped line
 */
function stepped(c: RenderContext, heads: 'end' | 'both'): XY[] {
    const pts = zStep(c.pts);
    c.line(pts, { dash: c.dash });

    const n = pts.length;
    c.icon(pts[n - 1], 'head', c.rotation(unit(pts[n - 2], pts[n - 1])));
    if (heads === 'both') c.icon(pts[0], 'head', c.rotation(unit(pts[1], pts[0])));

    return pts;
}

export const TASKS: Record<string, Recipe> = {
    // Intervenieren: double filled head
    'intervene': (c) => {
        c.outline();
        endIcon(c, 'head-ff');
        nameAlong(c);
    },
    // Schussrichtung: line with a dot
    'fire-direction': (c) => {
        c.outline();
        endIcon(c, 'dot');
        nameAlong(c);
    },
    // Bekämpfen, abnützen: bracket at the start, dot at the end
    'engage': (c) => {
        c.outline();
        startIcon(c, 'brkt');
        endIcon(c, 'dot');
        nameAlong(c);
    },
    // Verzögern: hook at the start, two ticks, open head
    'delay': (c) => {
        c.outline();
        startIcon(c, 'hook');
        midIcon(c, 'dticks', 0.6);
        head(c);
        nameAlong(c);
    },
    // Rückzug: hook at the start, open head
    'withdraw': (c) => {
        c.outline();
        startIcon(c, 'hook');
        head(c);
        nameAlong(c);
    },
    // Evakuieren: like withdrawal, EVAC near the head
    'evacuate': (c) => {
        c.outline();
        startIcon(c, 'hook');
        head(c);
        const p = c.at(c.total * 0.78);
        c.textAlong(p.point, PREFIXES.evacuate, c.rotation(p.dir), { oy: -0.9, size: 12 });
    },
    // Aufklären, erkunden: Z step, open head
    'reconnaissance': (c) => {
        stepped(c, 'end');
        nameAlong(c, c.model.t, -1.6);
    },
    // Elektronische Kriegführung: Z step, heads at both ends
    'ew': (c) => {
        stepped(c, 'both');
    },
    'ew-sensors': (c) => {
        // comb above the line near the end
        const pts = stepped(c, 'both');
        const end = pts[pts.length - 1];
        const dir = unit(pts[pts.length - 2], end);
        c.icon([end[0] - dir[0] * c.total * 0.18, end[1] - dir[1] * c.total * 0.18], 'comb-l', c.rotation(dir));
    },
    'ew-effectors': (c) => {
        // comb below the line near the start
        stepped(c, 'both');
        const p = c.at(c.total * 0.18);
        c.icon(p.point, 'comb-r', c.rotation(p.dir));
    },
    // Infiltrieren oder exfiltrieren: wavy line, filled head
    'infiltrate': (c) => {
        c.pattern(c.pts, 'wave');
        head(c, 'head-f');
    },
    // Überwachen: zigzag, filled heads at both ends
    'surveil': (c) => {
        c.pattern(c.pts, 'zigzag');
        head(c, 'head-f', 'both');
    },
    // Offenhalten: slanted ticks at both ends
    'keep-open': (c) => {
        c.outline();
        startIcon(c, 'slant-s');
        endIcon(c, 'slant-e');
        nameAlong(c);
    },
    // Patientensammellinie: bars at the ends, Pat SaL in the middle
    'patient-collecting-line': (c) => {
        c.outline();
        startIcon(c, 'bar');
        endIcon(c, 'bar');
        const mid = c.mid;
        c.textAlong(mid.point, [PREFIXES.patientCollectingLine, c.model.t].filter(Boolean).join(' '), c.rotation(mid.dir));
    },
    // 3.4.1 Hinweis auf Abfluss- / Abrutschrichtung
    'flow-direction': (c) => {
        c.outline();
        head(c, 'head-f');
    },
    // 4.5 Fluss mit Fliessrichtung: head in the middle of the line
    'river': (c) => {
        c.outline();
        midIcon(c, 'head');
        nameAlong(c);
    },
};
