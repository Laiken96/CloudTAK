/**
 * Broad arrows of regulation 3.3, drawn to scale around the centre line
 */
import type { Recipe } from '../derive.ts';
import { broad } from './common.ts';

export const ATTACK: Record<string, Recipe> = {
    'main-attack': (c) => broad(c, 'main'),
    'supporting-attack': (c) => broad(c, 'supporting'),
    // Angriffsachse: dotted, between intermediate objectives (ZZ) and the objective (AZ)
    'axis-of-attack': (c) => broad(c, 'axis'),
    'feint': (c) => broad(c, 'feint'),
    // Abgebrochener Angriff … und in Stellung: zigzag head (and bracket)
    'aborted-attack': (c) => broad(c, 'aborted'),
    'aborted-in-position': (c) => broad(c, 'position'),
    'air-attack': (c) => broad(c, 'air'),
    'airborne': (c) => broad(c, 'airborne'),
};
