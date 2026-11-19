<template>
    <div
        class='d-flex align-items-center gap-2 px-1'
        style='min-width: 0;'
        :class='{ "flex-grow-1": compact }'
        data-testid='simple-mode-indicator'
    >
        <IconEyeglass
            :size='28'
            stroke='1.5'
            class='flex-shrink-0'
        />
        <span class='fw-bold text-truncate flex-grow-1'>Simple View</span>
        <button
            type='button'
            class='btn btn-outline-secondary flex-shrink-0 simple-mode-exit'
            title='Switch to the full view with all menus and tools'
            data-testid='simple-mode-exit'
            @click='setSimpleMode(false)'
        >
            <IconLayoutDashboard
                :size='20'
                stroke='1.5'
                class='me-1'
            />
            Full View
        </button>
    </div>
</template>

<script setup lang='ts'>
import { IconEyeglass, IconLayoutDashboard } from '@tabler/icons-vue';
import { setSimpleMode } from '../../../stores/modules/simple-mode.ts';

withDefaults(defineProps<{
    compact?: boolean;
}>(), {
    compact: false,
});
</script>

<style scoped>
.simple-mode-exit {
    min-height: 44px;
}
</style>
