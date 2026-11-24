<template>
    <GenericBottomPane>
        <div
            class='card cloudtak-panel user-select-none'
            data-testid='measure-panel'
        >
            <div class='card-header d-flex align-items-center gap-2 py-2'>
                <IconRuler2
                    :size='24'
                    stroke='1.5'
                    class='flex-shrink-0'
                />
                <span class='fw-bold'>Measure Distance</span>
                <span
                    v-if='summary.segments.length > 1'
                    class='ms-auto small text-secondary'
                    data-testid='measure-segments'
                    v-text='segmentCount'
                />
            </div>

            <div
                class='card-body py-2'
                role='status'
                aria-live='polite'
            >
                <div
                    v-if='!summary.last'
                    class='measure-hint'
                    data-testid='measure-hint'
                    v-text='hint'
                />
                <div
                    v-else
                    class='d-flex flex-wrap align-items-end column-gap-4 row-gap-1'
                >
                    <div>
                        <div
                            class='small text-secondary'
                            v-text='totalLabel'
                        />
                        <div
                            class='measure-value'
                            data-testid='measure-total'
                            v-text='formatDistance(summary.total)'
                        />
                    </div>
                    <div>
                        <div class='small text-secondary'>
                            Bearing
                        </div>
                        <div
                            class='measure-value'
                            data-testid='measure-bearing'
                        >
                            <span v-text='formatDegrees(summary.last.bearing)' />
                            <span class='text-secondary mx-1'>·</span>
                            <span v-text='formatMils(summary.last.bearing)' />
                        </div>
                    </div>
                </div>

                <div
                    v-if='summary.segments.length > 1 && summary.last'
                    class='small text-secondary mt-1'
                    data-testid='measure-last-segment'
                    v-text='lastSegment'
                />
                <div
                    v-if='snapText'
                    class='small mt-1 measure-snap'
                    data-testid='measure-snap'
                    v-text='snapText'
                />
            </div>

            <div class='card-footer d-flex gap-2 p-2'>
                <button
                    type='button'
                    class='btn measure-button'
                    title='Remove Last Point'
                    data-testid='measure-undo'
                    :disabled='!points.length'
                    @click='undoMeasurePoint()'
                >
                    <IconArrowBackUp
                        :size='22'
                        stroke='1.5'
                    />
                    <span>Remove Last Point</span>
                </button>
                <button
                    type='button'
                    class='btn measure-button'
                    title='New Measurement'
                    data-testid='measure-new'
                    :disabled='!points.length'
                    @click='clearMeasure()'
                >
                    <IconRefresh
                        :size='22'
                        stroke='1.5'
                    />
                    <span>New</span>
                </button>
                <button
                    type='button'
                    class='btn measure-button'
                    title='Close Measure Distance'
                    data-testid='measure-close'
                    @click='stopMeasure()'
                >
                    <IconX
                        :size='22'
                        stroke='1.5'
                    />
                    <span>Close</span>
                </button>
            </div>
        </div>
    </GenericBottomPane>
</template>

<script setup lang='ts'>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import {
    IconArrowBackUp,
    IconRefresh,
    IconRuler2,
    IconX,
} from '@tabler/icons-vue';
import GenericBottomPane from './GenericBottomPane.vue';
import { useMapStore } from '../../stores/map.ts';
import { DrawToolMode } from '../../stores/modules/draw.ts';
import OverlayManager from '../../base/overlay.ts';
import { disarmSignature } from '../../base/signature-placement.ts';
import { LocationState } from '../../utils/events.ts';
import {
    attachMeasureTool,
    clearMeasure,
    measureState,
    stopMeasure,
    undoMeasurePoint,
} from '../../base/measure-tool.ts';
import {
    formatDegrees,
    formatDistance,
    formatMils,
    pointName,
    summarize,
    type LngLat,
} from '../../utils/measure.ts';
import { tr } from '../../i18n/index.ts';

/**
 * Measure Distance: readout and buttons of the measure tool, which is on
 * while this is mounted (see base/measure-tool.ts).
 */

const mapStore = useMapStore();

const points = computed(() => measureState.points);
const summary = computed(() => summarize(measureState.points.map((p) => p.coord)));

const hint = computed<string>(() => {
    if (!points.value.length) return tr('Tap the map to set point A. Near an object or your own position the point snaps to it.');
    return tr('Tap the map to set point {name}.', { name: pointName(points.value.length) });
});

const totalLabel = computed<string>(() => summary.value.segments.length > 1 ? tr('Total') : tr('Distance'));

const segmentCount = computed<string>(() => tr('{count} segments', { count: summary.value.segments.length }));

const lastSegment = computed<string>(() => {
    if (!summary.value.last) return '';
    return tr('Last segment {distance}', { distance: formatDistance(summary.value.last.distance) });
});

/** Where the last point snapped, so a lock onto the target can be checked */
const snapText = computed<string>(() => {
    const last = points.value[points.value.length - 1];
    if (!last?.snap) return '';

    const name = pointName(points.value.length - 1);
    if (last.snap.kind === 'own') return tr('Point {name} snapped to your own position', { name });
    if (last.snap.label) return tr('Point {name} snapped to {object}', { name, object: last.snap.label });
    return tr('Point {name} snapped to an object', { name });
});

// Starting a drawing tool ends the measurement
watch(() => mapStore.draw.mode, (mode) => {
    if (mode !== DrawToolMode.STATIC) stopMeasure();
});

let detach: (() => void) | undefined;
let unmounted = false;

onMounted(async () => {
    // Nothing else may answer the taps on the map
    disarmSignature();
    mapStore.radial.mode = undefined;
    mapStore.radial.cot = undefined;
    mapStore.select.feats = [];

    if (mapStore.draw.mode !== DrawToolMode.STATIC) {
        try {
            await mapStore.draw.stop();
        } catch (err) {
            console.error('Measure: cannot stop the drawing tool', err);
        }
    }

    if (unmounted || !measureState.active || !mapStore._map) return;

    detach = attachMeasureTool(mapStore.map, {
        snapLayers: () => [...OverlayManager.clickableLayerMap().values()],
        ownPosition: (): LngLat | undefined => {
            if (mapStore.location === LocationState.Disabled || !mapStore.gpsCoordinates) return undefined;
            return [mapStore.gpsCoordinates.lng, mapStore.gpsCoordinates.lat];
        },
        resolve: async (id: string): Promise<LngLat | undefined> => {
            const cot = await mapStore.worker.db.get(id, { mission: true });
            if (!cot || cot.geometry.type !== 'Point') return undefined;

            const [lng, lat] = cot.geometry.coordinates;
            return [lng, lat];
        },
    });
});

onUnmounted(() => {
    unmounted = true;
    if (detach) detach();
    detach = undefined;
});
</script>

<style scoped>
.measure-hint {
    line-height: 1.35;
}

.measure-value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.measure-snap {
    color: #1E90FF;
}

.measure-button {
    flex: 1 1 0;
    min-width: 0;
    min-height: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 6px;
    font-size: 0.8rem;
    line-height: 1.1;
    white-space: normal;
    text-align: center;
    touch-action: manipulation;
}
</style>

<style>
/* Taps go through DOM markers (own position) to the measure tool */
.cloudtak-measuring .maplibregl-marker {
    pointer-events: none !important;
}
</style>
