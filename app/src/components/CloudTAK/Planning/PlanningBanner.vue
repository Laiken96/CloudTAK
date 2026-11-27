<template>
    <!-- PzBat12 prototype: planning mode, see planning.ts -->
    <div
        v-if='planning.path'
        class='planning-banner d-flex align-items-center gap-2'
        :class='`planning-banner--${variant}`'
        data-testid='planning-banner'
        role='status'
    >
        <IconPencilBolt
            :size='28'
            stroke='1.5'
            class='flex-shrink-0'
        />
        <div
            class='flex-grow-1'
            style='min-width: 0;'
        >
            <div class='text-truncate'>
                <span class='planning-tag'>PLANNING</span>
                <span
                    class='fw-bold ms-1'
                    data-testid='planning-name'
                    v-text='name'
                />
            </div>
            <div
                class='planning-sub text-truncate'
                :title='subline'
                v-text='subline'
            />
        </div>
        <button
            type='button'
            class='btn btn-sm planning-share flex-shrink-0'
            data-testid='planning-share'
            @click='planning.dialog = "share"'
        >
            <IconShare2
                :size='18'
                stroke='2'
                class='me-1'
            />
            Share
        </button>
        <button
            type='button'
            class='btn btn-sm planning-end flex-shrink-0'
            title='Finish planning'
            data-testid='planning-end'
            @click='planning.dialog = "end"'
        >
            <IconX
                :size='18'
                stroke='2'
            />
        </button>
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { IconPencilBolt, IconShare2, IconX } from '@tabler/icons-vue';
import { tr } from '../../../i18n/index.ts';
import { useMapStore } from '../../../stores/map.ts';
import { planning, planName } from './planning.ts';

withDefaults(defineProps<{
    /** topbar: in the top bar next to the mission (desktop); floating: below the top bar (phone) */
    variant?: 'topbar' | 'floating';
}>(), {
    variant: 'floating',
});

const mapStore = useMapStore();

const name = computed(() => planning.path ? planName(planning.path) : '');

const subline = computed(() => {
    const parts = [
        tr('Draft, only visible to you'),
        tr('Objects: {count}', { count: planning.count }),
    ];

    if (mapStore.mission) parts.push(tr('Mission {name} stays untouched', { name: mapStore.mission.meta.name }));

    return parts.join(' · ');
});
</script>

<style scoped>
.planning-banner {
    pointer-events: auto;
    min-width: 0;
    padding: 6px 8px 6px 12px;
    border-radius: 10px;
    color: #1d1d1d;
    background: repeating-linear-gradient(
        -45deg,
        #fab005,
        #fab005 14px,
        #f59f00 14px,
        #f59f00 28px
    );
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

/* Same height as the two panels of the top bar, between them */
.planning-banner--topbar {
    flex: 0 1 560px;
    height: 60px;
    margin: 0 8px;
}

.planning-banner--floating {
    width: 100%;
    max-width: 560px;
}

.planning-tag {
    font-weight: 800;
    letter-spacing: 0.08em;
}

.planning-sub {
    font-size: 0.8rem;
}

.planning-share {
    background: #1d1d1d;
    color: #fff;
    border: 0;
    min-height: 36px;
}

.planning-end {
    background: rgba(255, 255, 255, 0.7);
    color: #1d1d1d;
    border: 0;
    min-height: 36px;
    min-width: 36px;
}
</style>
