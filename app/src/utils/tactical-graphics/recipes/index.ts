/**
 * All signature recipes by signature key (see catalog.ts)
 */
import type { Recipe } from '../derive.ts';
import { LINES } from './lines.ts';
import { MOVEMENT } from './movement.ts';
import { ATTACK } from './attack.ts';
import { AREAS } from './areas.ts';
import { TASKS } from './tasks.ts';

export const RECIPES: Record<string, Recipe> = {
    ...LINES,
    ...MOVEMENT,
    ...ATTACK,
    ...AREAS,
    ...TASKS,
};
