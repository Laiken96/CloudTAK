<template>
    <div
        class='source-tabs d-flex align-items-center gap-1 rounded p-1'
        role='tablist'
        data-testid='signature-source'
    >
        <button
            type='button'
            role='tab'
            class='source-tab btn btn-sm flex-grow-1 d-inline-flex align-items-center justify-content-center gap-1'
            :class='{ active: modelValue === "swiss" }'
            :aria-selected='modelValue === "swiss"'
            data-testid='signature-source-swiss'
            @click='emit("update:modelValue", "swiss")'
        >
            <IconShieldHalfFilled
                :size='18'
                stroke='1.5'
            />
            <span class='text-truncate'>Swiss Formation</span>
        </button>
        <button
            type='button'
            role='tab'
            class='source-tab btn btn-sm flex-grow-1 d-inline-flex align-items-center justify-content-center gap-1'
            :class='{ active: modelValue === "all" }'
            :aria-selected='modelValue === "all"'
            data-testid='signature-source-all'
            @click='emit("update:modelValue", "all")'
        >
            <IconStars
                :size='18'
                stroke='1.5'
            />
            <span class='text-truncate'>All Signatures</span>
        </button>
    </div>
</template>

<script setup lang='ts'>
import { IconStars, IconShieldHalfFilled } from '@tabler/icons-vue';
import type { SignatureSource } from '../../../base/swiss-formation-choice.ts';

/** Switch of the signature picker between Swiss formations and every 2525 symbol / icon */
defineProps<{
    modelValue: SignatureSource;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', source: SignatureSource): void;
}>();
</script>

<style scoped>
.source-tabs {
    background: light-dark(var(--tblr-gray-100), var(--tblr-gray-900));
    border: 1px solid var(--tblr-border-color-translucent);
}

.source-tab {
    min-width: 0;
    min-height: 40px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--tblr-secondary);
}

.source-tab.active {
    color: var(--tblr-body-color);
    font-weight: 500;
    background: var(--tblr-bg-surface);
    border-color: var(--tblr-border-color);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
</style>
