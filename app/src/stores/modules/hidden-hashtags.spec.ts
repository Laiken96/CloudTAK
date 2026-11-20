import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { featureFilter, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec';

const setFilter = vi.fn();
const mapStore = {
    _map: {},
    map: {
        getLayer: () => true,
        setFilter
    }
};

vi.mock('../map.ts', () => ({
    useMapStore: () => mapStore
}));

import HiddenHashtags, { HIDDEN_HASHTAGS_KEY } from './hidden-hashtags.ts';
import { FeatureVisibility } from './feature-visibility.ts';
import KV from '../../base/kv.ts';
import COT from '../../base/cot.ts';
import FireGrids from '../../base/fire-grids.ts';
import { renderMissionFeature } from '../../base/subscription-feature.ts';
import cotStyles from '../../utils/styles.ts';
import type Overlay from '../../base/overlay-class.ts';
import type { Feature } from '../../types.ts';

function feature(id: string, remarks?: string, extra: Record<string, unknown> = {}): Feature {
    return {
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            type: 'a-f-G-U-C-A',
            how: 'm-g',
            callsign: id,
            remarks,
            center: [7.5, 46.9],
            ...extra
        },
        geometry: { type: 'Point', coordinates: [7.5, 46.9] }
    } as unknown as Feature;
}

/** The overlay of the Map Features (-1) or of a mission, with the layers the app gives it */
function overlay(id: number, mission = false): Overlay {
    return {
        id,
        type: 'geojson',
        styles: cotStyles(String(id), { group: !mission, icons: true, course: true, labels: { size: 8 } })
    } as unknown as Overlay;
}

/**
 * Apply the visibility filters to an overlay and report on which of its layers
 * a rendered feature is still drawn
 */
async function drawnOn(target: Overlay, rendered: { properties: Record<string, unknown> | null }): Promise<string[]> {
    setFilter.mockClear();
    await FeatureVisibility.applyToOverlay(target);

    const drawn: string[] = [];
    for (const [layer, filter] of setFilter.mock.calls as Array<[string, FilterSpecification | undefined]>) {
        const passes = filter
            ? featureFilter(filter, 'layers[0].filter').filter({ zoom: 12 }, {
                type: 1,
                id: 1,
                properties: rendered.properties ?? {},
                geometry: []
            } as never)
            : true;

        if (passes) drawn.push(layer);
    }

    return drawn;
}

describe('HiddenHashtags', () => {
    beforeEach(async () => {
        await KV.delete(HIDDEN_HASHTAGS_KEY);
        HiddenHashtags.state.tags = [];
        FireGrids.state.grids = [];
        FireGrids.state.loaded = true;
    });

    it('stores the hidden tags on this device and reads them back after a restart', async () => {
        await HiddenHashtags.setHidden('Zug1', true);
        await HiddenHashtags.setHidden('#Reserve', true);

        expect(JSON.parse(await KV.value(HIDDEN_HASHTAGS_KEY) ?? '[]')).toEqual(['#Zug1', '#Reserve']);

        // A restart starts with an empty state
        HiddenHashtags.state.tags = [];
        await HiddenHashtags.load();

        expect(HiddenHashtags.state.tags).toEqual(['#Zug1', '#Reserve']);
    });

    it('treats tags in any case as one, like the Hashtag Manager', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        await HiddenHashtags.setHidden('#ZUG1', true);

        expect(HiddenHashtags.state.tags).toEqual(['#Zug1']);
        expect(HiddenHashtags.isHidden('#zug1')).toBe(true);

        await HiddenHashtags.setHidden('#zug1', false);

        expect(HiddenHashtags.state.tags).toEqual([]);
        expect(await KV.value(HIDDEN_HASHTAGS_KEY)).toEqual('[]');
    });

    it('drops malformed and repeated stored tags', () => {
        expect(HiddenHashtags.parse('["#Zug1", "#zug1", "", 3, "Reserve"]')).toEqual(['#Zug1', '#Reserve']);
        expect(HiddenHashtags.parse('not json')).toEqual([]);
        expect(HiddenHashtags.parse(undefined)).toEqual([]);
    });

    it('shows all tags again', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        await HiddenHashtags.setHidden('#Reserve', true);

        await HiddenHashtags.showAll();

        expect(HiddenHashtags.state.tags).toEqual([]);
        expect(HiddenHashtags.expression()).toBeNull();

        HiddenHashtags.state.tags = ['#stale'];
        await HiddenHashtags.load();
        expect(HiddenHashtags.state.tags).toEqual([]);
    });

    it('re-filters the map layers when a tag is hidden or shown', async () => {
        const apply = vi.spyOn(FeatureVisibility, 'apply').mockResolvedValue();

        await HiddenHashtags.setHidden('#Zug1', true);
        await HiddenHashtags.toggle('#Zug1');
        await HiddenHashtags.setHidden('#Zug1', false);

        // The third call changes nothing
        expect(apply).toHaveBeenCalledTimes(2);
        apply.mockRestore();
    });

    it('names the tag a Feature in a list is hidden by', async () => {
        await HiddenHashtags.setHidden('#zug1', true);

        expect(HiddenHashtags.hiddenBy('#FURY #Zug1 Pz Kp 2')).toEqual('#Zug1');
        expect(HiddenHashtags.hiddenBy('#FURY Pz Kp 2')).toBeUndefined();
    });
});

describe('HiddenHashtags on the map layers', () => {
    beforeEach(async () => {
        await KV.delete(HIDDEN_HASHTAGS_KEY);
        HiddenHashtags.state.tags = [];
        FireGrids.state.grids = [];
        FireGrids.state.loaded = true;
    });

    it('takes an own Feature off every layer of the Map Features', async () => {
        const map = overlay(-1);
        const own = COT.as_rendered(feature('own', '#Zug1 Pz Kp 2'));

        const before = await drawnOn(map, own);
        expect(before.length).toBeGreaterThan(0);

        await HiddenHashtags.setHidden('#zug1', true);

        expect(await drawnOn(map, own)).toEqual([]);
        expect(await drawnOn(map, COT.as_rendered(feature('other', '#Zug2 Pz Kp 3')))).toEqual(before);
    });

    it('hides a Feature received from another user', async () => {
        const contact = COT.as_rendered(feature('ANDROID-1', '#Reserve', {
            type: 'a-f-G-U-C',
            group: { name: 'Cyan', role: 'Team Member' }
        }));
        const before = await drawnOn(overlay(-1), contact);
        expect(before.length).toBeGreaterThan(0);

        await HiddenHashtags.setHidden('#Reserve', true);

        expect(await drawnOn(overlay(-1), contact)).toEqual([]);
    });

    it('hides a mission Feature on its mission overlay', async () => {
        const mission = overlay(7, true);
        const rendered = renderMissionFeature(feature('mission-1', 'Inf Gruppe #Zug1'));
        const before = await drawnOn(mission, rendered);
        expect(before.length).toBeGreaterThan(0);

        await HiddenHashtags.setHidden('#Zug1', true);

        expect(await drawnOn(mission, rendered)).toEqual([]);
        expect(await drawnOn(mission, renderMissionFeature(feature('mission-2', 'Inf Gruppe')))).toEqual(before);
    });

    it('hides the render-only companions of a Feature with it', async () => {
        const feat = feature('sensor', '#Zug1', {
            sensor: { azimuth: 90, fov: 45, range: 1000 }
        });
        const derived = COT.as_derived(feat);
        expect(derived.length).toBeGreaterThan(0);

        await HiddenHashtags.setHidden('#Zug1', true);

        for (const companion of derived) {
            expect(await drawnOn(overlay(-1), companion)).toEqual([]);
        }
    });

    it('keeps the per-Feature visibility of FeatureVisibility working alongside', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        FeatureVisibility.setFeatureHidden('manual', true);

        expect(await drawnOn(overlay(-1), COT.as_rendered(feature('manual', 'ohne Tag')))).toEqual([]);
        expect((await drawnOn(overlay(-1), COT.as_rendered(feature('free', 'ohne Tag')))).length).toBeGreaterThan(0);

        FeatureVisibility.setFeatureHidden('manual', false);
    });

    it('never hides the targets of a fire grid', async () => {
        FireGrids.state.grids = [{
            id: 'grid', name: 'EFP MERKUR', visible: true,
            e0: 2600000, n0: 1200000, z: 100, ncols: 4, nrows: 4,
            targets: ['EFP-Z01']
        }];

        await HiddenHashtags.setHidden('#MERKUR', true);

        expect((await drawnOn(overlay(-1), COT.as_rendered(feature('EFP-Z01', '#MERKUR Z01 Gehöft', { type: 'b-m-p-s-m' })))).length).toBeGreaterThan(0);
        expect(await drawnOn(overlay(-1), COT.as_rendered(feature('gegner', '#MERKUR Gegner')))).toEqual([]);
    });

    it('leaves the layers unfiltered once all tags are shown again', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        await HiddenHashtags.showAll();

        const rendered = COT.as_rendered(feature('own', '#Zug1'));
        expect((await drawnOn(overlay(-1), rendered)).length).toBeGreaterThan(0);
    });
});
