/**
 * SVG previews of tactical graphics for the picker and the editor: a sample
 * line or area is run through the same recipes as the map (derive.ts) and
 * the derived features are drawn into an SVG, sprites included
 */
import type { Position } from 'geojson';
import type { Feature } from '../../types.ts';
import { tacticalDerived, type DerivedFeature } from './derive.ts';
import { tacticalSprite, SPRITES } from './sprites.ts';
import { parseSpriteId } from './sprite-id.ts';
import { type CatalogEntry, defaultModel } from './catalog.ts';
import { tacticalProperties } from './apply.ts';
import type { TacticalModel } from './model.ts';

const ORIGIN: Position = [8, 47];
const KX = 111320 * Math.cos(47 * Math.PI / 180);
const KY = 111320;

const dataUrls = new Map<string, string>();

function spriteUrl(id: string): string | undefined {
    const cached = dataUrls.get(id);
    if (cached) return cached;
    if (typeof document === 'undefined') return undefined;

    const sprite = tacticalSprite(id);
    if (!sprite) return undefined;

    const canvas = document.createElement('canvas');
    canvas.width = sprite.image.width;
    canvas.height = sprite.image.height;
    const g = canvas.getContext('2d');
    if (!g) return undefined;
    g.putImageData(sprite.image, 0, 0);

    const url = canvas.toDataURL('image/png');
    dataUrls.set(id, url);
    return url;
}

function spriteSize(id: string): { w: number; h: number } {
    const name = parseSpriteId(id)?.name;
    const sprite = name ? SPRITES[name] : undefined;
    return sprite ? { w: sprite.w, h: sprite.h } : { w: 16, h: 16 };
}

function scaledBy(size: { w: number; h: number }, k: number): { w: number; h: number } {
    return { w: size.w * k, h: size.h * k };
}

function escapeXml(text: string): string {
    return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' }[c] as string));
}

/** Sample geometry in metres (x east, y north) for an entry, fitting a 1000 × 400 m box */
export function sampleShape(entry: CatalogEntry): { type: 'LineString' | 'Polygon'; points: Array<[number, number]> } {
    if (entry.draw === 'area') {
        return {
            type: 'Polygon',
            points: [[-470, -90], [-150, 170], [300, 150], [470, 20], [260, -170], [-280, -160], [-470, -90]],
        };
    }

    if (entry.points === 2) {
        if (entry.sample === 'arrow') return { type: 'LineString', points: [[-330, 0], [330, 0]] };
        return { type: 'LineString', points: [[0, 0], [170, 0]] };
    }
    if (entry.points === 3) {
        if (entry.sample === 'sector') return { type: 'LineString', points: [[-380, 0], [330, 170], [330, -170]] };
        return { type: 'LineString', points: [[-150, 170], [-150, -170], [200, 0]] };
    }

    return { type: 'LineString', points: [[-470, -40], [-150, 60], [170, -30], [470, 40]] };
}

function toLonLat([x, y]: [number, number]): Position {
    return [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY];
}

/** A sample Feature of an entry */
export function sampleFeature(entry: CatalogEntry, model: TacticalModel = defaultModel(entry)): Feature {
    const shape = sampleShape(entry);
    const coords = shape.points.map(toLonLat);
    return {
        id: `preview-${entry.id}`,
        type: 'Feature',
        path: '/',
        properties: { ...tacticalProperties(entry, model), id: `preview-${entry.id}` },
        geometry: shape.type === 'Polygon'
            ? { type: 'Polygon', coordinates: [coords] }
            : { type: 'LineString', coordinates: coords },
    } as Feature;
}

/**
 * The SVG markup of an entry's preview, `width` × `height` CSS pixels
 */
export function previewSvg(entry: CatalogEntry, opts: { width?: number; height?: number; model?: TacticalModel } = {}): string {
    const width = opts.width ?? 96;
    const height = opts.height ?? 44;
    const scale = Math.min((width - 8) / 1000, (height - 8) / 400);

    const project = (p: Position): [number, number] => [
        width / 2 + (p[0] - ORIGIN[0]) * KX * scale,
        height / 2 - (p[1] - ORIGIN[1]) * KY * scale,
    ];

    const derived = tacticalDerived(sampleFeature(entry, opts.model), (id) => id.length);
    // Pixel sizes (sprites, lines, labels) shrink with the preview so the sample stays readable
    const k = Math.min(1, width / 160);
    const scaled = (size: { w: number; h: number }) => scaledBy(size, k);
    const defs: string[] = [];
    const body: string[] = [];

    const ofKind = (kind: string) => derived.filter((f) => f.properties.tgk === kind);
    const lineCoords = (f: DerivedFeature): Array<[number, number]> => {
        if (f.geometry.type === 'LineString') return f.geometry.coordinates.map(project);
        if (f.geometry.type === 'Polygon') return f.geometry.coordinates[0].map(project);
        return [];
    };
    const pointOf = (f: DerivedFeature): [number, number] => project((f.geometry as { coordinates: Position }).coordinates);

    for (const f of ofKind('fill')) {
        body.push(`<polygon points="${lineCoords(f).join(' ')}" fill="${f.properties.color}" fill-opacity="${f.properties.op}"/>`);
    }

    for (const f of ofKind('fillp')) {
        const id = String(f.properties.pat);
        const url = spriteUrl(id);
        if (!url) continue;
        const size = scaled(spriteSize(id));
        const patternId = `p${defs.length}-${entry.id}`;
        defs.push(`<pattern id="${patternId}" width="${size.w}" height="${size.h}" patternUnits="userSpaceOnUse"><image href="${url}" width="${size.w}" height="${size.h}"/></pattern>`);
        body.push(`<polygon points="${lineCoords(f).join(' ')}" fill="url(#${patternId})"/>`);
    }

    for (const f of ofKind('line')) {
        const pts = lineCoords(f).join(' ');
        const w = Math.max(1, Number(f.properties.w) * k);
        const dash = f.properties.dash === 'dashed' ? `stroke-dasharray="${w * 3} ${w * 2}"` : f.properties.dash === 'dotted' ? `stroke-dasharray="0.1 ${w * 2}"` : '';
        if (f.properties.dash === 'solid') {
            body.push(`<polyline points="${pts}" fill="none" stroke="${f.properties.cas}" stroke-opacity="0.6" stroke-width="${w + 2 * k}" stroke-linejoin="round" stroke-linecap="round"/>`);
        }
        body.push(`<polyline points="${pts}" fill="none" stroke="${f.properties.color}" stroke-width="${w}" ${dash} stroke-linejoin="round" stroke-linecap="round"/>`);
    }

    for (const f of ofKind('pat')) {
        const id = String(f.properties.pat);
        const url = spriteUrl(id);
        if (!url) continue;
        const size = scaled(spriteSize(id));
        const pts = lineCoords(f);
        let carry = 0;
        for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1];
            const [bx, by] = pts[i];
            const len = Math.hypot(bx - ax, by - ay);
            const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
            let d = carry;
            for (; d < len; d += size.w) {
                const x = ax + (bx - ax) * (d / len);
                const y = ay + (by - ay) * (d / len);
                // MapLibre draws the bottom of a line pattern to the left - flip it
                body.push(`<image href="${url}" width="${size.w}" height="${size.h}" transform="translate(${x} ${y}) rotate(${angle}) scale(1 -1) translate(0 ${-size.h / 2})"/>`);
            }
            carry = d - len;
        }
    }

    for (const f of ofKind('icon')) {
        const id = String(f.properties.icon);
        const url = spriteUrl(id);
        if (!url) continue;
        const size = scaled(spriteSize(id));
        const [x, y] = pointOf(f);
        body.push(`<image href="${url}" width="${size.w}" height="${size.h}" transform="translate(${x} ${y}) rotate(${Number(f.properties.rot)}) translate(${-size.w / 2} ${-size.h / 2})"/>`);
    }

    const textAttrs = (f: DerivedFeature, size: number) => `font-family="Open Sans, sans-serif" font-weight="700" font-size="${size}" fill="${f.properties.color}" stroke="${f.properties.cas}" stroke-width="${2 * k}" paint-order="stroke"`;

    for (const f of [...ofKind('tmap'), ...ofKind('tview')]) {
        const size = Number(f.properties.size) * Math.min(0.8, k);
        const [x, y] = pointOf(f);
        const [ox, oy] = (f.properties.tof as [number, number] | undefined) ?? [0, 0];
        const anchor = String(f.properties.anchor ?? 'center');
        const textAnchor = anchor.endsWith('left') ? 'start' : anchor.endsWith('right') ? 'end' : 'middle';
        const baseline = anchor.startsWith('top') ? 'hanging' : anchor.startsWith('bottom') ? 'auto' : 'central';
        const rot = f.properties.tgk === 'tmap' ? Number(f.properties.rot) : 0;
        body.push(`<text ${textAttrs(f, size)} text-anchor="${textAnchor}" dominant-baseline="${baseline}" transform="translate(${x} ${y}) rotate(${rot}) translate(${ox * size} ${oy * size})">${escapeXml(String(f.properties.txt))}</text>`);
    }

    for (const f of ofKind('rtext')) {
        const pts = lineCoords(f);
        const size = 11 * k;
        for (let i = 1; i < pts.length; i += Math.max(1, Math.floor(pts.length / 3))) {
            const [ax, ay] = pts[i - 1];
            const [bx, by] = pts[i];
            const angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
            const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
            body.push(`<text ${textAttrs(f, size)} text-anchor="middle" dominant-baseline="central" transform="translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${upright})">${escapeXml(String(f.properties.txt))}</text>`);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}
