<template>
    <div v-if='hits.length || linked'>
        <PropertyFactRow
            v-for='hit of hits'
            :key='hit.grid.id'
            label='Fire Grid'
            class='py-1'
        >
            <button
                type='button'
                class='btn btn-link p-0 text-reset text-start text-decoration-none d-block w-100'
                :title='`Show ${hit.designation} in ${hit.grid.name}`'
                @click='show(hit)'
            >
                <span
                    class='fw-bold'
                    v-text='hit.designation'
                />
                <span
                    class='text-secondary ms-2'
                    v-text='hit.spoken'
                />
                <span
                    v-if='showGridName'
                    class='d-block text-secondary small text-truncate'
                    v-text='hit.grid.name'
                />
            </button>
        </PropertyFactRow>

        <div
            v-if='linked'
            class='d-flex align-items-center gap-2 px-2 py-1'
            data-test='fire-grid-adopt'
        >
            <IconGrid3x3
                :size='20'
                stroke='1'
            />
            <span
                v-if='existing'
                class='text-secondary small flex-grow-1'
                v-text='adoptedText'
            />
            <template v-else>
                <span
                    class='text-secondary small flex-grow-1'
                    v-text='summary'
                />
                <button
                    type='button'
                    class='btn btn-sm btn-outline-primary'
                    :disabled='adopting'
                    @click='adopt'
                >
                    Adopt as Fire Grid
                </button>
            </template>
        </div>
        <div
            v-if='adoptError'
            class='text-danger small px-2'
            v-text='adoptError'
        />
    </div>
</template>

<script setup lang='ts'>
/**
 * PropertyFireGrid - the Einheitsfeuerplan cell (D2/6) of a position, for each shown fire grid.
 * An object carrying an Einheitsfeuerplan grid in its remarks (the frame of an imported
 * Einheitsfeuerplan data package) can be adopted as a fire grid of this device.
 */
import { computed, onMounted, ref } from 'vue';
import { IconGrid3x3 } from '@tabler/icons-vue';
import PropertyFactRow from '../util/PropertyFactRow.vue';
import FireGrids, { type FireGridHit } from '../../../base/fire-grids.ts';
import { fireGridFromText } from '../../../utils/efp-package.ts';
import { tr } from '../../../i18n/index.ts';
import { useMapStore } from '../../../stores/map.ts';

const props = defineProps<{
    /** GeoJSON position [lng, lat] */
    coordinates: number[];
    /** Remarks of the object, may hold an Einheitsfeuerplan grid (`e0=..&n0=..&z=..&c=..&r=..`) */
    remarks?: string;
    /** Name for an adopted grid */
    name?: string;
}>();

const mapStore = useMapStore();

const adopting = ref(false);
const adoptError = ref('');

onMounted(async () => {
    await FireGrids.load();
});

const hits = computed<FireGridHit[]>(() => {
    const [lng, lat] = props.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];

    return FireGrids.locate(lng, lat);
});

const showGridName = computed(() => FireGrids.state.grids.filter((g) => g.visible).length > 1);

/** The grid named in the remarks */
const linked = computed(() => fireGridFromText(props.remarks));

/** The same grid already stored on this device */
const existing = computed(() => linked.value ? FireGrids.same(linked.value) : undefined);

const summary = computed(() => {
    const P = linked.value;
    return P ? tr('Einheitsfeuerplan grid, {cols} × {rows} cells of {size} m', { cols: P.ncols, rows: P.nrows, size: P.z }) : '';
});

const adoptedText = computed(() => existing.value ? tr('Fire grid {name} is on this device', { name: existing.value.name }) : '');

function show(hit: FireGridHit): void {
    mapStore.fireGrid.highlight(hit.grid, hit.cell);
}

async function adopt(): Promise<void> {
    if (!linked.value) return;

    adopting.value = true;
    adoptError.value = '';

    try {
        const { grid } = await FireGrids.ensure({ name: props.name?.trim() || 'Fire Grid', ...linked.value });
        mapStore.fireGrid.fitGrid(grid);
    } catch (err) {
        adoptError.value = err instanceof Error ? err.message : String(err);
    } finally {
        adopting.value = false;
    }
}
</script>
