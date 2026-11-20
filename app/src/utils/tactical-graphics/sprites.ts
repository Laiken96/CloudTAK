/**
 * Sprites of the tactical graphics, drawn on a canvas in the requested colour
 * when the map first asks for them (`tg-<name>-<rrggbb>`, see sprite-id.ts).
 * All drawings are our own vector drawings after regulation 52.003.
 *
 * Conventions (sizes in CSS pixels):
 * - Icons point along +x, the direction of travel; the left of the direction
 *   of travel is up (-y). The anchor is the centre.
 * - Line patterns (`line-pattern`) repeat along +x and are as high as the
 *   line is wide. MapLibre draws the bottom of the image (+y) to the left of
 *   the direction of travel - `LEFT` below is +1.
 * - Fill patterns (`fill-pattern`) are square tiles.
 */
import { parseSpriteId, casingColor } from './sprite-id.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Sprite {
    w: number;
    h: number;
    draw(g: Ctx, color: string, casing: string): void;
}

/** +1: the left of the direction of travel in a line pattern image */
const LEFT = 1;
const RIGHT = -1;

/** Stroke a path twice: a casing for contrast, then the colour */
function stroke(g: Ctx, path: () => void, color: string, casing: string, width = 2): void {
    g.lineCap = 'round';
    g.lineJoin = 'round';

    g.beginPath();
    path();
    g.globalAlpha = 0.7;
    g.strokeStyle = casing;
    g.lineWidth = width + 2;
    g.stroke();

    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
}

/** Fill a path with a casing outline */
function fill(g: Ctx, path: () => void, color: string, casing: string): void {
    g.beginPath();
    path();
    g.globalAlpha = 0.7;
    g.strokeStyle = casing;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = color;
    g.fill();
}

function circle(g: Ctx, x: number, y: number, r: number): void {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
}

/** Ticks on one side of a base line, `side` LEFT or RIGHT */
function ticks(side: number, spacing: number, tick: number): Sprite {
    const h = 2 * tick + 4;
    return {
        w: spacing,
        h,
        draw(g, color, casing) {
            const y = h / 2;
            stroke(g, () => {
                g.moveTo(0, y);
                g.lineTo(spacing, y);
                g.moveTo(spacing / 2, y);
                g.lineTo(spacing / 2, y + side * tick);
            }, color, casing);
        },
    };
}

/** Glyphs of a hierarchy sign (X, I, ●) across the line */
function echelon(sign: string): Sprite {
    const glyphs = [...sign];
    const gw = 7;
    const gap = 2.5;
    const w = glyphs.length * gw + (glyphs.length - 1) * gap + 6;
    const h = 16;
    return {
        w,
        h,
        draw(g, color, casing) {
            let x = 3;
            for (const glyph of glyphs) {
                const cx = x + gw / 2;
                if (glyph === 'X') {
                    stroke(g, () => {
                        g.moveTo(x, 3); g.lineTo(x + gw, h - 3);
                        g.moveTo(x + gw, 3); g.lineTo(x, h - 3);
                    }, color, casing, 2);
                } else if (glyph === 'I') {
                    stroke(g, () => { g.moveTo(cx, 2); g.lineTo(cx, h - 2); }, color, casing, 2.2);
                } else {
                    fill(g, () => circle(g, cx, h / 2, 2.6), color, casing);
                }
                x += gw + gap;
            }
        },
    };
}

export const SPRITES: Record<string, Sprite> = {
    // --- line patterns ------------------------------------------------------
    // Scallops of the own front line, bulging to the left
    'arc': {
        w: 16,
        h: 20,
        draw(g, color, casing) {
            stroke(g, () => g.arc(8, 10, 7.6, 0, Math.PI, LEFT < 0), color, casing);
        },
    },
    // Enemy front line: double scallops
    'arc2': {
        w: 16,
        h: 20,
        draw(g, color, casing) {
            stroke(g, () => {
                g.arc(8, 10, 7.6, 0, Math.PI, LEFT < 0);
                g.moveTo(8 + 3.8, 10);
                g.arc(8, 10, 3.8, 0, Math.PI, LEFT < 0);
            }, color, casing, 1.7);
        },
    },
    // Row of crosses, no base line
    'xrow': {
        w: 14,
        h: 14,
        draw(g, color, casing) {
            stroke(g, () => {
                g.moveTo(3, 3); g.lineTo(11, 11);
                g.moveTo(11, 3); g.lineTo(3, 11);
            }, color, casing, 1.8);
        },
    },
    'ticks-l': ticks(LEFT, 10, 6),
    'ticks-r': ticks(RIGHT, 10, 6),

    // --- icons --------------------------------------------------------------
    // Open arrow head, tip at the centre
    'head': {
        w: 24,
        h: 24,
        draw(g, color, casing) {
            stroke(g, () => {
                g.moveTo(3, 5); g.lineTo(12, 12); g.lineTo(3, 19);
            }, color, casing, 2.2);
        },
    },
    // Motorised: two wheels below the line
    'mot': {
        w: 28,
        h: 32,
        draw(g, color, casing) {
            stroke(g, () => {
                circle(g, 10, 23, 3.3);
                circle(g, 18, 23, 3.3);
            }, color, casing, 1.7);
        },
    },
    // Mechanised: track below the line
    'mech': {
        w: 30,
        h: 32,
        draw(g, color, casing) {
            stroke(g, () => g.roundRect(4, 20, 22, 7, 3.5), color, casing, 1.8);
        },
    },

    // --- fill patterns ------------------------------------------------------
    // Indirect fire: circles with a cross
    'fp-fire': {
        w: 28,
        h: 28,
        draw(g, color, casing) {
            for (const [x, y] of [[7, 7], [21, 21]]) {
                stroke(g, () => {
                    circle(g, x, y, 5);
                    g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3);
                    g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3);
                }, color, casing, 1.3);
            }
        },
    },
};

for (const sign of [['D', '●●●'], ['E', 'I'], ['F', 'II'], ['G', 'III'], ['H', 'X'], ['I', 'XX'], ['J', 'XXX'], ['K', 'XXXX']]) {
    SPRITES[`ech-${sign[0]}`] = echelon(sign[1]);
}

/** Sprite names the map can request */
export function spriteNames(): string[] {
    return Object.keys(SPRITES);
}

function pixelRatio(): number {
    const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 2;
    return Math.min(3, Math.max(2, Math.round(dpr)));
}

/**
 * Draw the sprite a `tg-…` image id asks for. Undefined for an unknown id
 */
export function tacticalSprite(id: string): { image: ImageData; pixelRatio: number } | undefined {
    const parsed = parseSpriteId(id);
    if (!parsed) return undefined;

    const sprite = SPRITES[parsed.name];
    if (!sprite) return undefined;

    const ratio = pixelRatio();
    const width = Math.ceil(sprite.w * ratio);
    const height = Math.ceil(sprite.h * ratio);

    const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });

    const g = canvas.getContext('2d', { willReadFrequently: true }) as Ctx | null;
    if (!g) return undefined;

    g.scale(ratio, ratio);
    sprite.draw(g, parsed.color, casingColor(parsed.color));

    return { image: g.getImageData(0, 0, width, height), pixelRatio: ratio };
}
