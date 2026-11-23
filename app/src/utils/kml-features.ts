/**
 * The Placemarks of a KML document as CoT GeoJSON Features, for showing a KML
 * or KMZ attached to a mission on the map (see base/mission-files.ts).
 *
 * A deliberately small reader with the browser's DOMParser, as utils/gpx.ts:
 * Placemarks with Point, LineString, LinearRing, Polygon (with holes) and
 * MultiGeometry, their name and description and the colours and widths of
 * their style (inline, shared via styleUrl, or a StyleMap's normal style).
 * Ground overlays, network links, models, tracks and icons are not read.
 *
 * The result follows node-cot's normalize_geojson (the GeoJSON import of
 * CloudTAK): points become spot markers `u-d-p`, lines and areas freehand
 * drawings `u-d-f`, name is the callsign and description the remarks. Unlike
 * there, ids do not change between reads: the Placemark's id, otherwise the
 * given prefix with the Placemark's number, so the same file always yields the
 * same objects.
 */
import type { Geometry, LineString, Point, Polygon, Position } from 'geojson';
import type { Feature } from '../types.ts';
import { parseXmlDocument } from './xml-compact.ts';

interface KmlStyle {
    stroke?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
    fill?: string;
    fillOpacity?: number;
    /** `<fill>0</fill>` */
    noFill?: boolean;
    /** `<outline>0</outline>` */
    noOutline?: boolean;
    marker?: string;
    markerOpacity?: number;
}

function children(el: Element, name: string): Element[] {
    return Array.from(el.children).filter((child) => child.localName === name);
}

function child(el: Element, name: string): Element | undefined {
    return children(el, name)[0];
}

function text(el: Element | undefined): string | undefined {
    const value = el?.textContent?.trim();
    return value ? value : undefined;
}

/** KML colours are `aabbggrr` */
function kmlColor(value: string | undefined): { color: string; opacity: number } | undefined {
    const hex = value?.trim().replace(/^#/, '');
    if (!hex || !/^[0-9a-f]{8}$/i.test(hex)) return;

    return {
        color: `#${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}`.toLowerCase(),
        opacity: Math.round(parseInt(hex.slice(0, 2), 16) / 255 * 100) / 100,
    };
}

function readStyle(el: Element): KmlStyle {
    const style: KmlStyle = {};

    const line = child(el, 'LineStyle');
    if (line) {
        const color = kmlColor(text(child(line, 'color')));
        if (color) {
            style.stroke = color.color;
            style.strokeOpacity = color.opacity;
        }

        const width = Number(text(child(line, 'width')));
        if (Number.isFinite(width) && width > 0) style.strokeWidth = width;
    }

    const poly = child(el, 'PolyStyle');
    if (poly) {
        const color = kmlColor(text(child(poly, 'color')));
        if (color) {
            style.fill = color.color;
            style.fillOpacity = color.opacity;
        }

        if (text(child(poly, 'fill')) === '0') style.noFill = true;
        if (text(child(poly, 'outline')) === '0') style.noOutline = true;
    }

    const icon = child(el, 'IconStyle');
    if (icon) {
        const color = kmlColor(text(child(icon, 'color')));
        if (color) {
            style.marker = color.color;
            style.markerOpacity = color.opacity;
        }
    }

    return style;
}

/** Shared styles by `#id`, StyleMaps resolved to their normal style */
function sharedStyles(doc: Document): Map<string, KmlStyle> {
    const styles = new Map<string, KmlStyle>();

    for (const el of Array.from(doc.getElementsByTagNameNS('*', 'Style'))) {
        const id = el.getAttribute('id');
        if (id) styles.set(`#${id}`, readStyle(el));
    }

    for (const el of Array.from(doc.getElementsByTagNameNS('*', 'StyleMap'))) {
        const id = el.getAttribute('id');
        if (!id) continue;

        for (const pair of children(el, 'Pair')) {
            if (text(child(pair, 'key')) !== 'normal') continue;

            const inline = child(pair, 'Style');
            const url = text(child(pair, 'styleUrl'));
            const style = inline ? readStyle(inline) : url ? styles.get(url.slice(url.indexOf('#'))) : undefined;

            if (style) styles.set(`#${id}`, style);
        }
    }

    return styles;
}

function coordinates(el: Element | undefined): Position[] {
    const raw = text(el ? child(el, 'coordinates') : undefined);
    if (!raw) return [];

    const positions: Position[] = [];
    for (const tuple of raw.split(/\s+/)) {
        const parts = tuple.split(',').map(Number);
        if (parts.length < 2 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) continue;

        const [lon, lat, alt] = parts;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

        positions.push(alt === undefined || !Number.isFinite(alt) ? [lon, lat] : [lon, lat, alt]);
    }

    return positions;
}

function ring(el: Element | undefined): Position[] | undefined {
    const positions = coordinates(el);
    if (positions.length < 3) return;

    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) positions.push([...first]);

    return positions.length >= 4 ? positions : undefined;
}

function geometries(el: Element): Geometry[] {
    const out: Geometry[] = [];

    for (const part of Array.from(el.children)) {
        switch (part.localName) {
            case 'Point': {
                const [position] = coordinates(part);
                if (position) out.push({ type: 'Point', coordinates: position } as Point);
                break;
            }
            case 'LineString': {
                const positions = coordinates(part);
                if (positions.length >= 2) out.push({ type: 'LineString', coordinates: positions } as LineString);
                break;
            }
            case 'LinearRing': {
                const outer = ring(part);
                if (outer) out.push({ type: 'Polygon', coordinates: [outer] } as Polygon);
                break;
            }
            case 'Polygon': {
                const outerBoundary = child(part, 'outerBoundaryIs');
                const outer = ring(outerBoundary ? child(outerBoundary, 'LinearRing') : undefined);
                if (!outer) break;

                const holes = children(part, 'innerBoundaryIs')
                    .flatMap((inner) => children(inner, 'LinearRing'))
                    .map((inner) => ring(inner))
                    .filter((inner): inner is Position[] => inner !== undefined);

                out.push({ type: 'Polygon', coordinates: [outer, ...holes] } as Polygon);
                break;
            }
            case 'MultiGeometry':
                out.push(...geometries(part));
                break;
        }
    }

    return out;
}

/** HTML descriptions (common in Google Earth exports) as plain text */
function plainText(value: string | undefined): string {
    if (!value) return '';
    if (!/<[a-z!/]/i.test(value)) return value;

    const doc = new DOMParser().parseFromString(value, 'text/html');
    return (doc.body?.textContent ?? '').trim();
}

function styleProperties(geometry: Geometry, style: KmlStyle): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    if (geometry.type === 'Point') {
        if (style.marker) {
            props['marker-color'] = style.marker;
            props['marker-opacity'] = style.markerOpacity;
        }

        return props;
    }

    if (style.stroke) {
        props.stroke = style.stroke;
        props['stroke-opacity'] = style.strokeOpacity;
    }
    if (style.strokeWidth) props['stroke-width'] = style.strokeWidth;
    if (geometry.type === 'Polygon' && style.noOutline) props['stroke-opacity'] = 0;

    if (geometry.type === 'Polygon') {
        if (style.fill) {
            props.fill = style.fill;
            props['fill-opacity'] = style.fillOpacity;
        }
        if (style.noFill) props['fill-opacity'] = 0;
    }

    return props;
}

/**
 * Read the Placemarks of a KML document. Throws when the XML is not well-formed
 * or is not KML.
 *
 * @param opts.idPrefix - Ids of Placemarks without an id start with this
 */
export function kmlToFeatures(xml: string, opts: { idPrefix: string }): Feature[] {
    const doc = parseXmlDocument(xml);
    if (doc.documentElement.localName !== 'kml') throw new Error('Not a KML document');

    const styles = sharedStyles(doc);
    const features: Feature[] = [];
    const ids = new Set<string>();

    const placemarks = Array.from(doc.getElementsByTagNameNS('*', 'Placemark'));

    placemarks.forEach((placemark, index) => {
        const parts = geometries(placemark);
        if (!parts.length) return;

        const url = text(child(placemark, 'styleUrl'));
        const inline = child(placemark, 'Style');
        const style: KmlStyle = {
            ...(url ? styles.get(url.slice(url.indexOf('#'))) : undefined),
            ...(inline ? readStyle(inline) : undefined),
        };

        const base = placemark.getAttribute('id') || `${opts.idPrefix}-${index + 1}`;
        const callsign = text(child(placemark, 'name')) ?? '';
        const remarks = plainText(text(child(placemark, 'description')));

        parts.forEach((geometry, part) => {
            let id = parts.length > 1 ? `${base}-${part + 1}` : base;
            for (let n = 2; ids.has(id); n++) id = `${base}-${part + 1}-${n}`;
            ids.add(id);

            features.push({
                id,
                type: 'Feature',
                path: '/',
                properties: {
                    id,
                    type: geometry.type === 'Point' ? 'u-d-p' : 'u-d-f',
                    how: 'h-g-i-g-o',
                    callsign,
                    remarks,
                    archived: true,
                    ...styleProperties(geometry, style),
                },
                geometry,
            } as Feature);
        });
    });

    return features;
}
