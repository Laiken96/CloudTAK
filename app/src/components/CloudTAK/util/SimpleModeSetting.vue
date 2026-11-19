<template>
    <StandardItem
        :hover='false'
        class='position-relative'
    >
        <label
            class='d-flex align-items-center gap-3 px-3 py-2 m-0 cursor-pointer user-select-none'
            :for='inputId'
        >
            <div
                class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25 flex-shrink-0'
                style='width: 40px; height: 40px;'
            >
                <IconEyeglass
                    :size='24'
                    stroke='1.5'
                />
            </div>
            <div
                class='flex-grow-1'
                style='min-width: 0;'
            >
                <div class='fw-bold'>
                    Simple View
                </div>
                <div class='small text-secondary'>
                    Only map, layers, signatures and own position
                </div>
            </div>
            <span class='form-check form-switch m-0 flex-shrink-0'>
                <input
                    :id='inputId'
                    type='checkbox'
                    role='switch'
                    class='form-check-input simple-mode-switch'
                    :checked='simpleMode'
                    data-testid='simple-mode-switch'
                    @change='setSimpleMode(($event.target as HTMLInputElement).checked)'
                >
            </span>
        </label>
    </StandardItem>
</template>

<script setup lang='ts'>
import { useId } from 'vue';
import { IconEyeglass } from '@tabler/icons-vue';
import StandardItem from './StandardItem.vue';
import { simpleMode, setSimpleMode } from '../../../stores/modules/simple-mode.ts';

/** Switch between the full and the simple view, stored on this device */
const inputId = useId();
</script>

<style scoped>
.simple-mode-switch {
    width: 3rem;
    height: 1.5rem;
    cursor: pointer;
}
</style>
