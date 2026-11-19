/**
 * Read the ATAK data package exported by the Einheitsfeuerplan of Pz Bat 12
 * (`s3-einheitsfeuerplan`, "Datenpaket (ATAK)"). The binding description of the
 * format is `docs/DATENPAKET-FORMAT.md` in that repository; this reader only
 * relies on the parts listed there:
 *
 * - The manifest (`MANIFEST/manifest.xml`) names the package; its `uid` is the
 *   package UID `EFP-<action>-<unit>-v<YYMMDDhhmm>`. Packages from other tools
 *   are refused, they belong in the normal data package import.
 * - Targets are spot markers (`b-m-p-s-m`) with the UID `<package UID>-Z<nr>`.
 * - Since V1.5 the grid is drawn as well: the frame has the UID
 *   `<package UID>-Raster` and its remarks end with the grid as the link
 *   fragment of the Einheitsfeuerplan, `e0=..&n0=..&z=..&c=..&r=..`. The other
 *   drawn grid objects (cell and fine lines, column and row names) have UIDs
 *   starting with `<package UID>-Raster-` and are skipped: CloudTAK draws the
 *   grid itself from the parameters, with cell lookup.
 *
 * Reading only uses the browser (fflate for the ZIP, DOMParser for the XML),
 * so a file chosen on an iPhone never leaves the device before the import.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { Point } from 'geojson';
import { parseFireGridLink, type FireGridParams } from './fire-grid.ts';

export interface EfpGrid extends FireGridParams {
    /** UID of the drawn frame */
    uid: string;
    /** `EFP MERKUR Inf Kp 10/1` */
    name: string;
}

export interface EfpTarget {
    uid: string;
    /** `Z03 D2/6` */
    callsign: string;
    remarks: string;
    lng: number;
    lat: number;
    /** `#RRGGBB` */
    color: string;
    opacity: number;
    time: string;
    start: string;
    stale: string;
}

export interface EfpPackage {
    /** Package name from the manifest, `atak_paket_Inf-Kp-10-1_MERKUR_2026-11-19` */
    name: string;
    uid: string;
    /** Null for packages before V1.5, which hold the targets only */
    grid: EfpGrid | null;
    targets: EfpTarget[];
}

/** A file that cannot be imported; the message is shown to the user */
export class EfpPackageError extends Error {}

export interface EfpTargetFeature {
    id: string;
    type: 'Feature';
    path: string;
    properties: {
        id: string;
        type: string;
        how: string;
        archived: boolean;
        callsign: string;
        remarks: string;
        time: string;
        start: string;
        stale: string;
        center: [number, number];
        [key: string]: unknown;
    };
    geometry: Point;
}

/** Colour of a target in the Einheitsfeuerplan */
const TARGET_COLOR = '#FFD60A';

/**
 * The grid of an Einheitsfeuerplan link fragment in a text, such as the remarks
 * of the drawn frame (`… · Raster-Link e0=2570000&n0=1256000&z=250&c=20&r=12`)
 * or a pasted link. Null if the text holds no complete, valid grid.
 */
export function fireGridFromText(text: string | undefined | null): FireGridParams | null {
    if (!text) return null;

    const m = text.match(/\be0=\S+/);
    return m ? parseFireGridLink(m[0]) : null;
}

function xml(text: string): Document {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML');
    return doc;
}

/** CoT time (`2026-11-19T08:30:00.00Z`) as ISO string, or the fallback */
function isoTime(value: string | null, fallback: string): string {
    const t = value ? new Date(value) : null;
    return t && !Number.isNaN(t.getTime()) ? t.toISOString() : fallback;
}

/** ATAK ARGB (signed 32 bit) -> `#RRGGBB` and opacity 0..1 */
function argbColor(value: string | null): { color: string; opacity: number } {
    const n = Number(value);
    if (value === null || value.trim() === '' || !Number.isInteger(n)) return { color: TARGET_COLOR, opacity: 1 };

    const u = n >>> 0;
    return {
        color: '#' + (u & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'),
        opacity: ((u >>> 24) & 0xFF) / 255
    };
}

interface CotEvent {
    uid: string;
    type: string;
    doc: Element;
}

function child(el: Element, name: string): Element | null {
    return el.getElementsByTagName(name)[0] ?? null;
}

/**
 * Read an Einheitsfeuerplan data package. Throws an EfpPackageError with a
 * message for the user if the file is no such package.
 */
export function readEfpPackage(data: Uint8Array): EfpPackage {
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(data);
    } catch {
        throw new EfpPackageError('The file is not a ZIP file or it is damaged');
    }

    // ATAK only loads `MANIFEST/manifest.xml`; accept the other spelling WinTAK reads too
    const manifestPath = Object.keys(files).find((p) => p.toLowerCase() === 'manifest/manifest.xml');
    if (!manifestPath) throw new EfpPackageError('The file is not a data package: MANIFEST/manifest.xml is missing');

    let manifest: Document;
    try {
        manifest = xml(strFromU8(files[manifestPath]));
    } catch {
        throw new EfpPackageError('The manifest of the data package cannot be read');
    }

    const config: Record<string, string> = {};
    const configuration = child(manifest.documentElement, 'Configuration');
    for (const param of Array.from(configuration?.getElementsByTagName('Parameter') ?? [])) {
        const name = param.getAttribute('name');
        if (name) config[name] = param.getAttribute('value') ?? '';
    }

    const uid = config.uid ?? '';
    if (!/^EFP-\S+-v\d{10}$/.test(uid)) {
        throw new EfpPackageError('The data package does not come from the Einheitsfeuerplan. Import it as a data package instead.');
    }

    // The CoT events the manifest lists, as ATAK reads them
    const events: CotEvent[] = [];
    for (const content of Array.from(manifest.getElementsByTagName('Content'))) {
        const entry = content.getAttribute('zipEntry') ?? '';
        if (!entry.toLowerCase().endsWith('.cot') || content.getAttribute('ignore') === 'true') continue;
        if (!files[entry]) continue;

        try {
            const event = xml(strFromU8(files[entry])).documentElement;
            if (event.nodeName !== 'event') continue;
            events.push({ uid: event.getAttribute('uid') ?? '', type: event.getAttribute('type') ?? '', doc: event });
        } catch {
            continue;
        }
    }

    const remarksOf = (el: Element): string => child(el, 'remarks')?.textContent ?? '';
    const callsignOf = (el: Element): string => child(el, 'contact')?.getAttribute('callsign') ?? '';

    let grid: EfpGrid | null = null;
    const frame = events.find((e) => e.uid === `${uid}-Raster`);
    if (frame) {
        const params = fireGridFromText(remarksOf(frame.doc));
        if (params) grid = { uid: frame.uid, name: callsignOf(frame.doc).trim() || 'Fire Grid', ...params };
    }

    const now = new Date().toISOString();
    const targets: EfpTarget[] = [];
    const target = new RegExp(`^${uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-Z\\d+$`);
    for (const e of events) {
        if (!target.test(e.uid)) continue;

        const point = child(e.doc, 'point');
        const lat = Number(point?.getAttribute('lat'));
        const lng = Number(point?.getAttribute('lon'));
        if (!point || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

        const time = isoTime(e.doc.getAttribute('time'), now);
        targets.push({
            uid: e.uid,
            callsign: callsignOf(e.doc) || e.uid,
            remarks: remarksOf(e.doc),
            lng,
            lat,
            ...argbColor(child(e.doc, 'color')?.getAttribute('argb') ?? null),
            time,
            start: isoTime(e.doc.getAttribute('start'), time),
            stale: isoTime(e.doc.getAttribute('stale'), time)
        });
    }

    if (!grid && !targets.length) {
        throw new EfpPackageError('The data package holds neither a grid nor targets');
    }

    return { name: config.name || uid, uid, grid, targets };
}

/**
 * A target as a map feature, the way the data package import of the server
 * stores it: kept (archived), in a folder named after the package, with the
 * UID of the Einheitsfeuerplan so a second import updates instead of doubling.
 */
export function efpTargetFeature(pkg: Pick<EfpPackage, 'name'>, t: EfpTarget): EfpTargetFeature {
    return {
        id: t.uid,
        type: 'Feature',
        path: `/${pkg.name.replace(/\//g, '')}/`,
        properties: {
            id: t.uid,
            type: 'b-m-p-s-m',
            how: 'h-g-i-g-o',
            archived: true,
            callsign: t.callsign,
            remarks: t.remarks,
            'marker-color': t.color,
            'marker-opacity': t.opacity,
            time: t.time,
            start: t.start,
            stale: t.stale,
            center: [t.lng, t.lat]
        },
        geometry: { type: 'Point', coordinates: [t.lng, t.lat] }
    };
}
