import { DrawToolMode } from '../../../stores/modules/draw.ts';
import type { useMapStore } from '../../../stores/map.ts';
import { type CatalogEntry, defaultModel } from '../../../utils/tactical-graphics/catalog.ts';
import { tacticalProperties } from '../../../utils/tactical-graphics/apply.ts';

/**
 * Draw a tactical graphic: the normal line or polygon tool with the
 * signature's properties as template. Once drawn, its editor opens
 */
export async function startTactical(mapStore: ReturnType<typeof useMapStore>, entry: CatalogEntry): Promise<void> {
    await mapStore.draw.start(entry.draw === 'area' ? DrawToolMode.POLYGON : DrawToolMode.LINESTRING);

    mapStore.draw.template = {
        label: entry.label,
        hint: entry.hint,
        properties: tacticalProperties(entry, defaultModel(entry)),
        route: '/cot/:id/tactical',
    };
}
