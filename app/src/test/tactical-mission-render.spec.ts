import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { featureFilter, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Feature as GeoJSONFeature } from 'geojson';
import { renderMissionFeature, renderMissionDerived } from '../base/subscription-feature.ts';
import cotStyles from '../utils/styles.ts';
import { CATALOG, defaultModel, type CatalogEntry } from '../utils/tactical-graphics/catalog.ts';
import { tacticalProperties } from '../utils/tactical-graphics/apply.ts';
import type { Feature } from '../types.ts';

/** The layers of a Mission overlay, as the app gives them (base/overlay-class.ts) */
const MISSION_LAYERS = cotStyles('12', { group: false, icons: true, course: true, labels: { size: 8 } });

const GEOMETRY_TYPE: Record<string, number> = { Point: 1, LineString: 2, Polygon: 3 };

/** Ids of the layers that draw a feature at zoom 14 */
function drawnOn(feature: GeoJSONFeature): string[] {
    return MISSION_LAYERS.filter((layer) => {
        const filter = (layer as { filter?: FilterSpecification }).filter;
        if (!filter) return true;

        return featureFilter(filter, 'layers[0].filter').filter({ zoom: 14 }, {
            type: GEOMETRY_TYPE[feature.geometry.type],
            id: 1,
            properties: feature.properties ?? {},
            geometry: [],
        } as never);
    }).map((layer) => layer.id);
}

function tactical(entry: CatalogEntry): Feature {
    const geometry = entry.draw === 'area'
        ? { type: 'Polygon', coordinates: [[[7.40, 46.9], [7.46, 46.9], [7.46, 46.906], [7.40, 46.906], [7.40, 46.9]]] }
        : { type: 'LineString', coordinates: [[7.40, 46.9], [7.43, 46.903], [7.46, 46.9]] };

    return {
        id: `tg-${entry.id}`,
        type: 'Feature',
        path: '/',
        properties: {
            id: `tg-${entry.id}`,
            type: 'u-d-f',
            how: 'h-e',
            archived: true,
            callsign: 'New Feature',
            center: [7.43, 46.9],
            ...JSON.parse(JSON.stringify(tacticalProperties(entry, defaultModel(entry)))),
        },
        geometry,
    } as unknown as Feature;
}

describe('Tactical graphics in a Mission', () => {
    it('hides the drawn line and draws every signature from its derived features', () => {
        for (const entry of CATALOG) {
            const feat = tactical(entry);

            // The Mission layers leave the drawn line to the tactical layers ...
            const line = drawnOn(renderMissionFeature(feat) as unknown as GeoJSONFeature);
            expect(line.filter((id) => !id.includes('-text-')), entry.id).toEqual([]);

            // ... so the derived features must be there and drawn
            const derived = renderMissionDerived([feat]);
            expect(derived.length, entry.id).toBeGreaterThan(0);
            for (const part of derived) {
                expect(drawnOn(part).some((id) => id.startsWith('12-tg-')), entry.id).toBe(true);
            }
        }
    });

    it('draws a signature as it arrives from the TAK Server, attributes as strings', () => {
        const feat = tactical(CATALOG.find((entry) => entry.id === 'main-attack')!);
        feat.properties.chsig = { _attributes: { sig: 'main-attack', t: 'Haupt Ag', aff: 'f', width: '7' } };

        const derived = renderMissionDerived([renderMissionFeature(feat)]);
        expect(derived.length).toBeGreaterThan(0);
        expect(derived.every((part) => part.properties?.id === feat.id)).toBe(true);
    });

    it('adds nothing for a plain line', () => {
        const feat = tactical(CATALOG[0]);
        delete feat.properties.chsig;

        expect(renderMissionDerived([feat])).toEqual([]);
    });
});
