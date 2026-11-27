/**
 * Distances written the Swiss way: whole metres below 1000 m ("850 m"),
 * from there kilometres with a decimal comma ("1,2 km").
 *
 * The distance setting "meter" (display::distance) stands for this automatic
 * switch; "kilometer" always shows kilometres.
 */

/** "1.25" -> "1,25" */
export function decimalComma(value: number | string): string {
    return String(value).replace('.', ',');
}

/** "850 m" below 1000 m, "1,2 km" from there; decimals are the places after the comma */
export function formatMetric(metres: number, decimals = 1): string {
    if (!Number.isFinite(metres) || metres < 0) return '–';

    // Rounds to 1000 m: shown as km, never as "1000 m"
    const rounded = Math.round(metres);
    if (rounded < 1000) return `${rounded} m`;

    return `${decimalComma((metres / 1000).toFixed(decimals))} km`;
}

/** The unit a distance is shown in: the "meter" setting switches to km from 1000 m */
export function metricUnit(unit: string, kilometers: number): string {
    if (unit !== 'meter') return unit;
    return Math.round(Math.abs(kilometers) * 1000) >= 1000 ? 'kilometer' : 'meter';
}
