/**
 * Movement arrows of regulation 3.3: a line with an open head and the means
 * of transport as a symbol in the middle
 */
import type { Recipe, RenderContext } from '../derive.ts';
import { head, midIcon, nameAlong } from './common.ts';

function movement(symbol?: string): Recipe {
    return (c: RenderContext) => {
        c.outline();
        head(c);
        if (symbol) midIcon(c, symbol);
        nameAlong(c);
    };
}

export const MOVEMENT: Record<string, Recipe> = {
    'movement': movement(),
    'movement-motorised': movement('mot'),
    'movement-mechanised': movement('mech'),
};
