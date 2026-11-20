<template>
    <img
        :src='src'
        :width='width'
        :height='height'
        alt=''
        class='tactical-preview flex-shrink-0'
        draggable='false'
    >
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import type { CatalogEntry } from '../../../utils/tactical-graphics/catalog.ts';
import type { TacticalModel } from '../../../utils/tactical-graphics/model.ts';
import { previewSvg } from '../../../utils/tactical-graphics/preview.ts';

const props = withDefaults(defineProps<{
    entry: CatalogEntry;
    model?: TacticalModel;
    width?: number;
    height?: number;
}>(), {
    model: undefined,
    width: 96,
    height: 44,
});

const src = computed<string>(() => {
    try {
        const svg = previewSvg(props.entry, { width: props.width, height: props.height, model: props.model });
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
        return '';
    }
});
</script>

<style scoped>
.tactical-preview {
    border-radius: 6px;
    background: #eef0e6;
}
</style>
