<template>
    <PropertyMeasureRow
        label='Length'
        :model-value='inMode'
        :display='typeof inMode === "number" ? decimalComma(inMode) : undefined'
        :unit='mode'
        :units='UNITS'
        @update:unit='mode = $event'
    />
</template>

<script setup lang='ts'>
import { ref, computed, watch } from 'vue';
import { length } from '@turf/length';
import PropertyMeasureRow from './PropertyMeasureRow.vue';
import type { UnitOption } from './UnitSwitcher.vue';
import type { Geometry } from 'geojson';
import { decimalComma, metricUnit } from '../../../utils/metric-distance.ts';

const UNITS: Array<UnitOption> = [
    { value: 'feet', label: 'ft', title: 'Feet' },
    { value: 'yard', label: 'yd', title: 'Yards' },
    { value: 'meter', label: 'm', title: 'Meters' },
    { value: 'kilometer', label: 'km', title: 'Kilometers' },
    { value: 'mile', label: 'mi', title: 'Miles' },
];

const props = withDefaults(defineProps<{
    geometry: Geometry;
    unit?: string;
}>(), {
    unit: 'meter'
});

const lineKm = computed(() => {
    if (props.geometry.type !== 'LineString') return 0;
    return length({ type: 'Feature', properties: {}, geometry: props.geometry });
});

const mode = ref(metricUnit(props.unit === 'kilometer' ? 'kilometer' : props.unit === 'meter' ? 'meter' : 'mile', lineKm.value));

watch(() => props.unit, (newUnit) => {
    mode.value = metricUnit(newUnit === 'kilometer' ? 'kilometer' : newUnit === 'meter' ? 'meter' : 'mile', lineKm.value);
});

const inMode = computed(() => {
    if (props.geometry.type !== 'LineString') return 'Not a Line!';

    const cotLength = lineKm.value;

    if (mode.value === 'meter') {
        return Math.round(cotLength * 1000);
    } else if (mode.value === 'feet') {
        return Number((cotLength * 3280.84).toFixed(2));
    } else if (mode.value === 'yard') {
        return Number((cotLength * 1093.61).toFixed(2));
    } else if (mode.value === 'kilometer') {
        return Number(cotLength.toFixed(2));
    } else if (mode.value === 'mile') {
        return Number((cotLength * 0.621371).toFixed(2));
    } else {
        return 'UNKNOWN';
    }
})
</script>
