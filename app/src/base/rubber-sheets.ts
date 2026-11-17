import { reactive } from 'vue';
import { v4 as randomUUID } from 'uuid';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { db, type DBRubberSheet } from '../database.ts';
import {
    groundOverlayKml,
    isQuad,
    parseGroundOverlays,
    type LngLat,
    type Quad,
} from '../utils/rubbersheet.ts';

/**
 * Rubber sheets kept on this device (Dexie table `rubber_sheet`): images such as
 * situation sketches laid on the map by their corners. Shared as an ATAK
 * compatible KMZ (GroundOverlay with gx:LatLonQuad).
 */

export type RubberSheet = Omit<DBRubberSheet, 'image'>;

/** Longest image side kept; larger images are scaled down to stay within GPU texture limits */
export const MAX_IMAGE_SIDE = 4096;

const state = reactive<{ loaded: boolean; sheets: RubberSheet[] }>({
    loaded: false,
    sheets: []
});

const urls = new Map<string, string>();
let loading: Promise<RubberSheet[]> | null = null;

function meta(row: DBRubberSheet): RubberSheet {
    return {
        id: row.id,
        name: row.name,
        visible: row.visible,
        opacity: row.opacity,
        corners: row.corners,
        width: row.width,
        height: row.height,
        created: row.created
    };
}

/** Plain arrays: IndexedDB cannot store the reactive proxies the state hands out */
function plainQuad(q: Quad): Quad {
    return q.map(([lng, lat]) => [lng, lat]) as Quad;
}

function extension(type: string): string {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
}

function mimeOf(name: string): string {
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/jpeg';
}

/** A file name without path and characters other systems trip over */
export function safeFileName(name: string): string {
    const base = name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'rubber-sheet';
}

export interface PreparedImage {
    image: Blob;
    width: number;
    height: number;
}

/** Decode an image, scaling it down if its longer side exceeds MAX_IMAGE_SIDE */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));

    if (scale === 1 && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        bitmap.close();
        return { image: file, width, height };
    }

    const w = Math.round(width * scale), h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the image')), type, 0.9);
    });

    return { image, width: w, height: h };
}

export default class RubberSheets {
    /** Reactive list without the images, filled by load() */
    static readonly state = state;

    static async load(): Promise<RubberSheet[]> {
        if (state.loaded) return state.sheets;

        if (!loading) {
            loading = (async () => {
                try {
                    const rows = await db.rubber_sheet.toArray();
                    state.sheets = rows
                        .filter((row) => isQuad(row.corners))
                        .sort((a, b) => a.created.localeCompare(b.created))
                        .map(meta);
                } catch (err) {
                    console.error('Failed to load rubber sheets', err);
                    state.sheets = [];
                }

                state.loaded = true;
                return state.sheets;
            })().finally(() => {
                loading = null;
            });
        }

        return await loading;
    }

    static get(id: string): RubberSheet | undefined {
        return state.sheets.find((s) => s.id === id);
    }

    static async add(sheet: { name: string; image: Blob; width: number; height: number; corners: Quad; opacity?: number }): Promise<RubberSheet> {
        await this.load();

        if (!isQuad(sheet.corners)) throw new Error('Rubber sheet needs four corners');

        const row: DBRubberSheet = {
            id: randomUUID(),
            name: sheet.name.trim() || 'Rubber Sheet',
            visible: true,
            opacity: sheet.opacity ?? 0.8,
            corners: plainQuad(sheet.corners),
            width: sheet.width,
            height: sheet.height,
            image: sheet.image,
            created: new Date().toISOString()
        };

        await db.rubber_sheet.put(row);
        state.sheets = [...state.sheets, meta(row)];

        return meta(row);
    }

    static async update(id: string, patch: Partial<Pick<RubberSheet, 'name' | 'visible' | 'opacity' | 'corners'>>): Promise<RubberSheet> {
        await this.load();

        const current = this.get(id);
        if (!current) throw new Error('Rubber sheet not found');
        if (patch.corners && !isQuad(patch.corners)) throw new Error('Rubber sheet needs four corners');

        const next: RubberSheet = { ...current, ...patch, id, corners: plainQuad(patch.corners ?? current.corners) };
        if (patch.name !== undefined) next.name = patch.name.trim() || 'Rubber Sheet';
        if (patch.opacity !== undefined) next.opacity = Math.min(1, Math.max(0.05, patch.opacity));

        state.sheets = state.sheets.map((s) => s.id === id ? next : s);
        await db.rubber_sheet.update(id, {
            name: next.name,
            visible: next.visible,
            opacity: next.opacity,
            corners: next.corners
        });

        return next;
    }

    static async remove(id: string): Promise<void> {
        await this.load();

        state.sheets = state.sheets.filter((s) => s.id !== id);
        await db.rubber_sheet.delete(id);

        const url = urls.get(id);
        if (url) URL.revokeObjectURL(url);
        urls.delete(id);
    }

    static async image(id: string): Promise<Blob | undefined> {
        return (await db.rubber_sheet.get(id))?.image;
    }

    /** Object URL of the image, created once per sheet */
    static async imageUrl(id: string): Promise<string | undefined> {
        const cached = urls.get(id);
        if (cached) return cached;

        const image = await this.image(id);
        if (!image) return undefined;

        const url = URL.createObjectURL(image);
        urls.set(id, url);
        return url;
    }

    /** ATAK compatible KMZ: `doc.kml` with a GroundOverlay next to the image */
    static async exportKmz(id: string): Promise<{ name: string; kmz: Blob }> {
        const sheet = this.get(id);
        const image = await this.image(id);
        if (!sheet || !image) throw new Error('Rubber sheet not found');

        const base = safeFileName(sheet.name);
        const href = `${base}.${extension(image.type)}`;

        const zip = zipSync({
            'doc.kml': strToU8(groundOverlayKml(sheet.name, href, sheet.corners)),
            [href]: [new Uint8Array(await image.arrayBuffer()), { level: 0 }]
        });

        return { name: `${base}.kmz`, kmz: new Blob([zip as BlobPart], { type: 'application/vnd.google-earth.kmz' }) };
    }

    /** Add every ground overlay of a KMZ (as ATAK or Google Earth write them) */
    static async importKmz(file: Blob): Promise<RubberSheet[]> {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const names = Object.keys(files);

        const kmlName = names.find((n) => n.toLowerCase() === 'doc.kml') ?? names.find((n) => n.toLowerCase().endsWith('.kml'));
        if (!kmlName) throw new Error('No KML document in this KMZ');

        const kmlDir = kmlName.includes('/') ? kmlName.slice(0, kmlName.lastIndexOf('/') + 1) : '';
        const overlays = parseGroundOverlays(strFromU8(files[kmlName]));
        if (!overlays.length) throw new Error('No ground overlay with an image in this KMZ');

        const added: RubberSheet[] = [];
        for (const overlay of overlays) {
            const href = decodeURIComponent(overlay.href.replace(/^\.\//, ''));
            const entry = files[kmlDir + href] ?? files[href];
            if (!entry) continue;

            const prepared = await prepareImage(new Blob([entry as BlobPart], { type: mimeOf(href) }));
            added.push(await this.add({ name: overlay.name, ...prepared, corners: overlay.quad }));
        }

        if (!added.length) throw new Error('The images of this KMZ are missing');
        return added;
    }

    /** Add an image file as a new sheet at the given corners */
    static async importImage(file: File, place: (width: number, height: number) => Quad): Promise<RubberSheet> {
        const prepared = await prepareImage(file);
        return await this.add({
            name: file.name.replace(/\.[^.]+$/, ''),
            ...prepared,
            corners: place(prepared.width, prepared.height)
        });
    }
}

export type { LngLat, Quad };
