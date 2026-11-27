/**
 * Directions (course, heading, bearing) in the unit of the profile setting
 * display::angle: degrees ("deg", "146°") or the Swiss artillery mils
 * ("mil", Artilleriepromille, 6400 to the circle, "2596 A‰").
 */
import { formatDegrees, formatMils } from './measure.ts';

/** "146°" or "2596 A‰"; a dash for values that are no direction */
export function formatDirection(degrees: number, unit: string): string {
    return unit === 'mil' ? formatMils(degrees) : formatDegrees(degrees);
}
