<template>
    <button
        type='button'
        class='medevac-row w-100 d-flex align-items-center rounded border px-2 py-2 text-start cloudtak-hover'
        title='MEDEVAC 9-Line'
        @click='emit("click")'
    >
        <IconMedicalCross
            :size='32'
            stroke='1.5'
            class='text-red flex-shrink-0'
        />

        <div
            class='flex-grow-1 mx-2'
            style='min-width: 0;'
        >
            <div class='text-truncate'>
                MEDEVAC 9-Line
            </div>
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
import { IconChevronRight, IconMedicalCross } from '@tabler/icons-vue';
import { tr } from '../../../i18n/index.ts';
import { formFromDetail, lineThree, medevacDetail, totalPatients } from '../../../utils/medevac.ts';

const props = defineProps<{
    properties: Record<string, unknown>;
}>();

const emit = defineEmits<{
    (e: 'click'): void;
}>();

const subtitle = computed<string>(() => {
    const detail = medevacDetail(props.properties);
    if (!detail) return tr('Not filled in yet');

    const form = formFromDetail(detail);
    const total = totalPatients(form);
    if (!total) return tr('No patients entered');

    const patients = total === 1 ? tr('1 patient') : tr('{n} patients', { n: total });
    return `${patients} · ${lineThree(form)}`;
});
</script>

<style scoped>
.medevac-row {
    min-height: 56px;
    background: transparent;
    color: inherit;
}
</style>
