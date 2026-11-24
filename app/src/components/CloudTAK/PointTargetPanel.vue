<template>
    <GenericBottomPane>
        <div
            class='card cloudtak-panel user-select-none'
            data-testid='point-target-panel'
        >
            <div class='card-header d-flex align-items-center gap-2 py-2'>
                <IconViewfinder
                    :size='24'
                    stroke='1.5'
                    class='flex-shrink-0'
                />
                <span class='fw-bold'>Point Target</span>
            </div>

            <div
                class='card-body py-2'
                role='status'
                aria-live='polite'
            >
                <template v-if='target'>
                    <div
                        class='point-target-name text-truncate'
                        data-testid='point-target-name'
                        v-text='target.callsign'
                    />
                    <div
                        v-if='pointTargetState.gone'
                        class='point-target-note'
                        data-testid='point-target-gone'
                    >
                        The target was deleted.
                    </div>
                    <template v-else-if='readout.inArea'>
                        <div class='small text-secondary'>
                            LV95
                        </div>
                        <div
                            class='point-target-coordinates'
                            data-testid='point-target-lv95'
                            v-text='readout.text'
                        />
                    </template>
                    <div
                        v-else
                        class='point-target-note'
                        data-testid='point-target-outside'
                    >
                        Outside Switzerland: no LV95 coordinates for this target.
                    </div>
                </template>
                <template v-else>
                    <div
                        class='point-target-hint'
                        data-testid='point-target-hint'
                        v-text='hint'
                    />
                    <div
                        v-if='pointTargetState.error'
                        class='small text-danger mt-1'
                        data-testid='point-target-error'
                        v-text='pointTargetState.error'
                    />
                </template>
            </div>

            <div class='card-footer d-flex gap-2 p-2'>
                <button
                    v-if='target'
                    type='button'
                    class='btn point-target-button'
                    title='Close Point Target'
                    data-testid='point-target-close'
                    @click='stopPointTarget()'
                >
                    <IconX
                        :size='22'
                        stroke='1.5'
                    />
                    <span>Close</span>
                </button>
                <button
                    v-else
                    type='button'
                    class='btn point-target-button'
                    title='Cancel Point Target'
                    data-testid='point-target-cancel'
                    :disabled='pointTargetState.phase === "saving"'
                    @click='stopPointTarget()'
                >
                    <IconX
                        :size='22'
                        stroke='1.5'
                    />
                    <span>Cancel</span>
                </button>
            </div>
        </div>
    </GenericBottomPane>
</template>

<script setup lang='ts'>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { IconViewfinder, IconX } from '@tabler/icons-vue';
import GenericBottomPane from './GenericBottomPane.vue';
import { useMapStore } from '../../stores/map.ts';
import { DrawToolMode } from '../../stores/modules/draw.ts';
import { disarmSignature } from '../../base/signature-placement.ts';
import { measureState } from '../../base/measure-tool.ts';
import { featureDragStatus } from '../../base/feature-drag-map.ts';
import {
    attachPointTargetTool,
    pointTargetState,
    refreshPlacedTarget,
    stopPointTarget,
    type TargetLookup,
} from '../../base/point-target-tool.ts';
import { lv95Readout, type LngLat } from '../../utils/point-target.ts';
import { tr } from '../../i18n/index.ts';

/**
 * Point Target: hint, then name and LV95 coordinates of the target set with
 * the tool, which is attached to the map while this is mounted (see
 * base/point-target-tool.ts).
 */

/** How often (ms) the shown target is compared with the stored one */
const FOLLOW_INTERVAL = 1000;

const mapStore = useMapStore();

const target = computed(() => pointTargetState.target);

const readout = computed(() => target.value ? lv95Readout(target.value.coord) : { inArea: false as const });

const hint = computed<string>(() => {
    if (pointTargetState.phase === 'saving') return tr('Setting the target…');
    return tr('Tap the map where the target is.');
});

const lookup: TargetLookup = {
    lookup: async (id: string) => {
        const cot = await mapStore.worker.db.get(id, { mission: true });
        if (!cot || cot.geometry.type !== 'Point') return undefined;

        const [lng, lat] = cot.geometry.coordinates;
        return { callsign: String(cot.properties.callsign ?? ''), coord: [lng, lat] as LngLat };
    },
};

function follow(): void {
    void refreshPlacedTarget(lookup);
}

// Starting a drawing tool or Measure Distance ends the tool
watch(() => mapStore.draw.mode, (mode) => {
    if (mode !== DrawToolMode.STATIC) stopPointTarget();
});

watch(() => measureState.active, (active) => {
    if (active) stopPointTarget();
});

// A move by long press shows at once, other changes within FOLLOW_INTERVAL
watch(() => featureDragStatus.phase, follow);

let detach: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let unmounted = false;

onMounted(async () => {
    // Nothing else may answer the tap on the map
    disarmSignature();
    mapStore.radial.mode = undefined;
    mapStore.radial.cot = undefined;
    mapStore.select.feats = [];

    if (mapStore.draw.mode !== DrawToolMode.STATIC) {
        try {
            await mapStore.draw.stop();
        } catch (err) {
            console.error('Point Target: cannot stop the drawing tool', err);
        }
    }

    if (unmounted || pointTargetState.phase === 'idle' || !mapStore._map) return;

    detach = attachPointTargetTool(mapStore.map, {
        callsigns: async () => {
            // Every object whose callsign holds a Z, own and in Data Syncs
            const cots = await mapStore.worker.db.search('z', { mission: true });
            return Array.from(cots, (cot) => cot.properties.callsign);
        },
        // As a drawn point (stores/modules/draw.ts): own object or Active Mission
        save: async (feature) => {
            await mapStore.worker.db.add(feature, {
                authored: true,
                created: true,
                // Newly placed - its fresh id cannot already be in a Mission
                skipMissionLookup: true
            });
            await mapStore.refresh();
        },
    });

    timer = setInterval(follow, FOLLOW_INTERVAL);
});

onUnmounted(() => {
    unmounted = true;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (detach) detach();
    detach = undefined;

    // Gone from the map (e.g. another view): no tool waits for a tap
    if (pointTargetState.phase === 'placing') stopPointTarget();
});
</script>

<style scoped>
.point-target-hint,
.point-target-note {
    line-height: 1.35;
}

.point-target-name {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
}

.point-target-coordinates {
    /* Smaller on the narrowest phones, so the pair stays on one line */
    font-size: min(1.75rem, 7.5vw);
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.point-target-button {
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
/* Taps go through DOM markers (own position) to the point target tool */
.cloudtak-placing-target .maplibregl-marker {
    pointer-events: none !important;
}
</style>
