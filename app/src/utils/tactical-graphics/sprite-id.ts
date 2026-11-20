/**
 * Style image ids of tactical graphic sprites: `tg-<name>-<rrggbb>`. The map
 * worker only names them; the main thread draws a sprite in the requested
 * colour on demand (see sprites.ts, resolved by the Icon Manager).
 */
export const SPRITE_PREFIX = 'tg-';

/** Normalised 6-digit lower-case hex colour, or undefined */
export function hexColor(color: unknown): string | undefined {
    if (typeof color !== 'string') return undefined;
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
    if (!match) return undefined;

    const hex = match[1].toLowerCase();
    return hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
}

export function spriteId(name: string, color: string): string {
    return `${SPRITE_PREFIX}${name}-${hexColor(color) ?? '000000'}`;
}

export function isSpriteId(id: string): boolean {
    return id.startsWith(SPRITE_PREFIX) && /-[0-9a-f]{6}$/.test(id);
}

export function parseSpriteId(id: string): { name: string; color: string } | undefined {
    if (!isSpriteId(id)) return undefined;
    const sep = id.lastIndexOf('-');
    return { name: id.slice(SPRITE_PREFIX.length, sep), color: `#${id.slice(sep + 1)}` };
}

/**
 * Contrast colour drawn around a sprite, line or label so light colours stay
 * legible on a light map and dark ones on an aerial image
 */
export function casingColor(color: string): string {
    const hex = hexColor(color);
    if (!hex) return '#000000';

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.45 ? '#1a1a1a' : '#ffffff';
}
