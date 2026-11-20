<template>
    <div
        v-if='template'
        class='card-body py-2 small'
        data-testid='tactical-draw-hint'
    >
        <div
            class='fw-bold'
            v-text='template.label'
        />
        <div
            v-if='template.hint'
            class='text-secondary'
            v-text='template.hint'
        />
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { useMapStore } from '../../../stores/map.ts';

const mapStore = useMapStore();

/** The tactical graphic being drawn - the line or polygon tool with a template */
const template = computed(() => mapStore.draw.template);
</script>
