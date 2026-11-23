/**
 * Read the objects of a file attached to a mission (Data Sync) so they can be
 * drawn with the mission - see base/mission-files.ts.
 *
 * Supported, by file name or MIME type (utils/mission-file-kind.ts):
 * - `.cot` / `.xml`: one CoT `<event>` or several in `<events>`, e.g. a
 *   drawing saved by WinTAK or ATAK
 * - `.zip`: a data package - every CoT event in its `.cot` / `.xml` entries,
 *   except entries the manifest marks `ignore="true"`; other content (photos,
 *   documents, overlays) is ignored
 * - `.kml`, `.kmz`: the Placemarks (utils/kml-features.ts); a KMZ is a zip with
 *   `doc.kml` or else its first `.kml`
 *
 * CoT events become GeoJSON exactly as the mission's own objects: the server
 * converts those with node-cot's CoTParser.to_geojson, here the same
 * to_geojson runs on the same xml-js tree (utils/xml-compact.ts). Chat
 * messages are skipped as the mission's object list skips them.
 *
 * Objects without a UID get the given prefix with their number, so reading the
 * same file twice always gives the same ids.
 *
 * Runs on the main thread (DOMParser).
 */
import { unzipSync, type UnzipFileInfo } from 'fflate';
import CoT from '@tak-ps/node-cot/cot';
import { to_geojson } from '@tak-ps/node-cot/to_geojson';
import type { Feature } from '../types.ts';
import {
    elementToCompact,
    normalizeBooleanAttributes,
    parseXmlDocument,
    type CompactElement,
} from './xml-compact.ts';
import { kmlToFeatures } from './kml-features.ts';
import {
    MISSION_FILE_MAX_BYTES,
    MISSION_FILE_MAX_UNZIPPED_BYTES,
    MissionFileError,
    type MissionFileKind,
} from './mission-file-kind.ts';

function decode(bytes: Uint8Array): string {
    return new TextDecoder('utf-8').decode(bytes);
}

function isZip(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

type CoTEvent = CompactElement & {
    _attributes?: Record<string, string | boolean | undefined>;
    point?: CompactElement;
    detail?: Record<string, unknown>;
};

function validEvent(event: CoTEvent): boolean {
    const attrs = event._attributes;
    if (!attrs || typeof attrs.type !== 'string' || !attrs.type) return false;

    const point = event.point && !Array.isArray(event.point) ? event.point._attributes : undefined;
    if (!point) return false;

    const lat = Number(point.lat);
    const lon = Number(point.lon);

    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * node-cot's CoT for an xml-js tree, without its constructor: that reads
 * process.env, which a browser does not have. to_geojson only needs the tree
 * and the methods of the class.
 */
function cotFromEvent(event: CoTEvent): CoT {
    if (!event.detail) event.detail = {};

    const cot = Object.create(CoT.prototype) as CoT;
    cot.raw = { event } as unknown as CoT['raw'];
    cot.metadata = {};
    cot.path = '/';

    return cot;
}

export interface CoTReadResult {
    features: Feature[];
    /** Events that could not be converted */
    invalid: number;
}

/**
 * The CoT events of a document whose root is `<event>` or `<events>`.
 * Returns null when the root is something else (not CoT).
 * Throws when the XML is not well-formed.
 */
export async function cotXmlToFeatures(
    xml: string,
    opts: { idPrefix: string }
): Promise<CoTReadResult | null> {
    const root = parseXmlDocument(xml).documentElement;

    let events: Element[];
    if (root.nodeName === 'event') {
        events = [root];
    } else if (root.nodeName === 'events') {
        events = Array.from(root.children).filter((el) => el.nodeName === 'event');
    } else {
        return null;
    }

    const result: CoTReadResult = { features: [], invalid: 0 };

    for (const [index, el] of events.entries()) {
        const event = elementToCompact(el) as CoTEvent;
        normalizeBooleanAttributes(event);

        if (!validEvent(event)) {
            result.invalid++;
            continue;
        }

        const attrs = event._attributes!;
        if (typeof attrs.uid !== 'string' || !attrs.uid) attrs.uid = `${opts.idPrefix}-${index + 1}`;

        // Chat messages are not drawn, as in the mission's own object list
        if (String(attrs.type).startsWith('b-t-f')) continue;

        try {
            const feature = await to_geojson(cotFromEvent(event));
            result.features.push(JSON.parse(JSON.stringify(feature)) as Feature);
        } catch (err) {
            console.warn(`Mission file: CoT ${attrs.uid} could not be converted`, err);
            result.invalid++;
        }
    }

    return result;
}

function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, Uint8Array> {
    let total = 0;

    try {
        return unzipSync(bytes, {
            filter: (file: UnzipFileInfo) => {
                if (file.name.endsWith('/') || !wanted(file.name)) return false;

                total += file.originalSize;
                if (total > MISSION_FILE_MAX_UNZIPPED_BYTES) {
                    throw new MissionFileError('too-large', 'Unzipped content is too large');
                }

                return true;
            }
        });
    } catch (err) {
        if (err instanceof MissionFileError) throw err;
        throw new MissionFileError('invalid', `Not a readable zip: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const MANIFEST = /(^|\/)manifest\.xml$/i;

/** Zip entries the data package manifest marks as not to be imported */
function ignoredEntries(manifest: Uint8Array | undefined): Set<string> {
    const ignored = new Set<string>();
    if (!manifest) return ignored;

    try {
        const doc = parseXmlDocument(decode(manifest));
        for (const content of Array.from(doc.getElementsByTagName('Content'))) {
            const entry = content.getAttribute('zipEntry');
            if (entry && content.getAttribute('ignore')?.toLowerCase() === 'true') ignored.add(entry);
        }
    } catch (err) {
        // A broken manifest does not make the CoTs unreadable
        console.warn('Mission file: data package manifest is not readable', err);
    }

    return ignored;
}

async function packageToFeatures(bytes: Uint8Array, opts: { idPrefix: string }): Promise<Feature[]> {
    const entries = unzip(bytes, (name) => /\.(cot|xml)$/i.test(name));

    const manifestName = Object.keys(entries).find((name) => MANIFEST.test(name));
    const ignored = ignoredEntries(manifestName ? entries[manifestName] : undefined);

    const names = Object.keys(entries)
        .filter((name) => name !== manifestName && !ignored.has(name))
        .sort();

    const features: Feature[] = [];
    let invalid = 0;

    for (const [index, name] of names.entries()) {
        try {
            const result = await cotXmlToFeatures(decode(entries[name]), {
                idPrefix: `${opts.idPrefix}-${index + 1}`
            });

            // Not CoT (eg. a style or a configuration) - ignored
            if (!result) continue;

            features.push(...result.features);
            invalid += result.invalid;
        } catch (err) {
            console.warn(`Mission file: data package entry ${name} is not readable`, err);
            invalid++;
        }
    }

    if (!features.length && invalid) {
        throw new MissionFileError('invalid', 'The data package holds no readable CoT');
    }

    return features;
}

function kmzToFeatures(bytes: Uint8Array, opts: { idPrefix: string }): Feature[] {
    const entries = unzip(bytes, (name) => /\.kml$/i.test(name));
    const names = Object.keys(entries).sort();

    const doc = names.find((name) => name.toLowerCase() === 'doc.kml') ?? names[0];
    if (!doc) throw new MissionFileError('invalid', 'The KMZ holds no KML');

    return kmlFeatures(decode(entries[doc]), opts);
}

function kmlFeatures(xml: string, opts: { idPrefix: string }): Feature[] {
    try {
        return kmlToFeatures(xml, opts);
    } catch (err) {
        throw new MissionFileError('invalid', err instanceof Error ? err.message : String(err));
    }
}

/**
 * Objects of the file as CoT GeoJSON (not yet styled, see COT.style), in file
 * order; a UID that occurs again is skipped.
 *
 * @throws MissionFileError when the file is too large or not readable
 */
export async function parseMissionFile(
    kind: MissionFileKind,
    bytes: Uint8Array,
    opts: { idPrefix: string }
): Promise<Feature[]> {
    if (bytes.byteLength > MISSION_FILE_MAX_BYTES) throw new MissionFileError('too-large');

    let features: Feature[];

    if (kind === 'package' || (kind === 'cot' && isZip(bytes))) {
        features = await packageToFeatures(bytes, opts);
    } else if (kind === 'kmz' || (kind === 'kml' && isZip(bytes))) {
        features = kmzToFeatures(bytes, opts);
    } else if (kind === 'kml') {
        features = kmlFeatures(decode(bytes), opts);
    } else {
        let result: CoTReadResult | null;
        try {
            result = await cotXmlToFeatures(decode(bytes), opts);
        } catch (err) {
            throw new MissionFileError('invalid', err instanceof Error ? err.message : String(err));
        }

        if (!result) throw new MissionFileError('invalid', 'Not a CoT document');
        if (!result.features.length && result.invalid) {
            throw new MissionFileError('invalid', 'The file holds no readable CoT');
        }

        features = result.features;
    }

    const seen = new Set<string>();
    return features.filter((feature) => {
        const id = String(feature.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}
