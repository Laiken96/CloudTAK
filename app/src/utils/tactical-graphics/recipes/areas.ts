/**
 * Areas of regulation 3.1 & 3.4
 */
import type { Recipe } from '../derive.ts';
import { PREFIXES } from '../model.ts';
import type { XY } from '../geometry.ts';
import { areaLabel, ring } from './common.ts';

function namedArea(prefix?: string): Recipe {
    return (c) => {
        c.outline();
        areaLabel(c, prefix);
    };
}

export const AREAS: Record<string, Recipe> = {
    // 3.1 Zugewiesener Raum: always dashed, with the responsible unit
    'assigned-area': (c) => {
        c.outline('dashed');
        areaLabel(c);
    },
    // 3.4 Bereitschafts-, Bereitstellungsraum, Angriffsgrundstellung, Zwischen- oder Angriffsziel
    'readiness-area': namedArea(PREFIXES.readinessArea),
    'assembly-area': namedArea(PREFIXES.assemblyArea),
    'attack-position': namedArea(PREFIXES.attackPosition),
    'intermediate-objective': namedArea(PREFIXES.intermediateObjective),
    'objective': namedArea(PREFIXES.objective),
    // 3.4 Geschossenes / geplantes Bogenfeuer
    'indirect-fire': (c) => {
        c.fillPattern(c.pts, 'fp-fire');
        c.outline();
        areaLabel(c);
    },
    // 3.4 Stützpunkt, halten: ticks pointing out
    'strong-point': (c) => {
        c.pattern(ring(c), 'ticks-r');
        areaLabel(c);
    },
    // 3.4 Schlüsselgelände: circle with arrows on the north-east corner
    'key-terrain': (c) => {
        c.outline();
        const corner = c.pts.reduce((best: XY, p: XY) => (p[0] + p[1] > best[0] + best[1] ? p : best), c.pts[0]);
        c.icon(corner, 'key');
        areaLabel(c);
    },
    // 3.4 Bewachen: spaced ticks pointing out
    'guard': (c) => {
        c.pattern(ring(c), 'sticks-r');
        areaLabel(c);
    },
    // 3.4 Sichern (eines Raums): triangles pointing out
    'secure': (c) => {
        c.pattern(ring(c), 'tri-r');
        areaLabel(c);
    },
    // 3.4 Verstrahltes bzw. kontaminiertes Gebiet (N, B, C)
    'contaminated-n': contaminated('nbc-n'),
    'contaminated-b': contaminated('nbc-b'),
    'contaminated-c': contaminated('nbc-c'),

    // 3.4.1 Zerstörungen, Schadenlagen
    'destroyed-zone': (c) => {
        c.fillPattern(c.pts, 'fp-destroyed');
        c.outline();
        areaLabel(c);
    },
    'damage-area': filled(0.5),
    'area-fire': (c) => {
        c.fillPattern(c.pts, 'fp-diag');
        c.outline();
        areaLabel(c);
    },
    'debris': (c) => {
        c.fill(c.pts, { color: '#262626', opacity: 0.3 });
        c.outline();
        areaLabel(c);
    },
    'flooded': filled(0.5),

    // 3.4.2 Minen und Ladungen: letters along the outline
    'mined-area': mined(PREFIXES.minedArea),
    'mined-area-ap': mined(PREFIXES.minedArea, 'fp-ap'),
    'mined-area-at': mined(PREFIXES.minedArea, 'fp-at'),
    'explosive-ordnance': mined(PREFIXES.explosiveOrdnance),

    // 4.5 Topographie
    'standing-water': hatched('fp-h'),
    'swamp': hatched('fp-hd', 'dashed'),
    'forest': hatched('fp-diag'),
    'built-up-area': hatched('fp-v'),
};

function contaminated(symbol: string): Recipe {
    return (c) => {
        c.fillPattern(c.pts, 'fp-diag');
        c.outline();
        c.icon(c.inside(), symbol);
    };
}

function filled(opacity: number): Recipe {
    return (c) => {
        c.fill(c.pts, { opacity });
        c.outline();
        areaLabel(c);
    };
}

function mined(letters: string, pattern?: string): Recipe {
    return (c) => {
        if (pattern) c.fillPattern(c.pts, pattern);
        c.outline();
        c.repeatText(c.pts, letters);
        areaLabel(c);
    };
}

function hatched(pattern: string, dash?: 'dashed'): Recipe {
    return (c) => {
        c.fillPattern(c.pts, pattern);
        c.outline(dash ?? c.dash);
        areaLabel(c);
    };
}
