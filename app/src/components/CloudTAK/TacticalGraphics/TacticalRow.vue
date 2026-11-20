<template>
    <button
        type='button'
        class='tactical-row w-100 d-flex align-items-center rounded border px-2 py-2 text-start cloudtak-hover'
        title='Tactical Graphic'
        data-testid='tactical-row'
        @click='emit("click")'
    >
        <TacticalPreview
            v-if='entry && model'
            :entry='entry'
            :model='model'
            :width='72'
            :height='36'
        />

        <div
            class='flex-grow-1 mx-2'
            style='min-width: 0;'
        >
            <div
                class='text-truncate'
                v-text='entry ? entry.label : $tr("Tactical Graphic")'
            />
            <div
                class='text-secondary small text-truncate'
                v-text='subtitle'
            />
        </div>

        <IconChevronRight
            :size='18'
            stroke='1.5'
            class='flex-shrink-0'
        />
    </button>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { IconChevronRight } from '@tabler/icons-vue';
import TacticalPreview from './TacticalPreview.vue';
import { tr } from '../../../i18n/index.ts';
import { tacticalOf, echelonSign } from '../../../utils/tactical-graphics/model.ts';
import { entryOf } from '../../../utils/tactical-graphics/catalog.ts';

const props = defineProps<{
    properties: Record<string, unknown>;
}>();

const emit = defineEmits<{
    (e: 'click'): void;
}>();

const model = computed(() => tacticalOf(props.properties));
const entry = computed(() => model.value ? entryOf(model.value) : undefined);

const subtitle = computed<string>(() => {
    if (!model.value || !entry.value) return '';

    const parts: string[] = [tr('Regulation 52.003, chapter {chapter}', { chapter: entry.value.chapter })];
    const sign = echelonSign(model.value.ech);
    if (sign) parts.push(sign);
    if (model.value.t) parts.push(model.value.t);
    if (model.value.t1) parts.push(model.value.t1);
    if (model.value.planned) parts.push(tr('Planned'));

    return parts.join(' · ');
});
</script>

<style scoped>
.tactical-row {
    min-height: 56px;
    background: transparent;
    color: inherit;
}
</style>
