/**
 * Areas of regulation 3.1 & 3.4
 */
import type { Recipe } from '../derive.ts';
import { PREFIXES } from '../model.ts';
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
        c.pattern(ring(c), 'ticks-r', 16);
        areaLabel(c);
    },
};
