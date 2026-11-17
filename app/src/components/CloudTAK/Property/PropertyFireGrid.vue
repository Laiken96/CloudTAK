<template>
    <div v-if='hits.length'>
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
    </div>
</template>

<script setup lang='ts'>
/** PropertyFireGrid - the Einheitsfeuerplan cell (D2/6) of a position, for each shown fire grid */
import { computed, onMounted } from 'vue';
import PropertyFactRow from '../util/PropertyFactRow.vue';
import FireGrids, { type FireGridHit } from '../../../base/fire-grids.ts';
import { useMapStore } from '../../../stores/map.ts';

const props = defineProps<{
    /** GeoJSON position [lng, lat] */
    coordinates: number[];
}>();

const mapStore = useMapStore();

onMounted(async () => {
    await FireGrids.load();
});

const hits = computed<FireGridHit[]>(() => {
    const [lng, lat] = props.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];

    return FireGrids.locate(lng, lat);
});

const showGridName = computed(() => FireGrids.state.grids.filter((g) => g.visible).length > 1);

function show(hit: FireGridHit): void {
    mapStore.fireGrid.highlight(hit.grid, hit.cell);
}
</script>
