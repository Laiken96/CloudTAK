import { DrawToolMode } from '../../../stores/modules/draw.ts';
import type { useMapStore } from '../../../stores/map.ts';
import { MEDEVAC_TYPE } from '../../../utils/medevac.ts';

/**
 * Drawing Tool "MEDEVAC": the normal Draw Point flow with the MEDEVAC type
 * preset. The new Point opens in its details, where the 9-Line is one tap away
 */
export async function startMedevac(mapStore: ReturnType<typeof useMapStore>): Promise<void> {
    await mapStore.draw.start(DrawToolMode.POINT);

    // start() resets the type to the user's default point type
    mapStore.draw.point.type = MEDEVAC_TYPE;
}
