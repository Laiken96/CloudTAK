<template>
    <!-- PzBat12 prototype: planning mode, see planning.ts -->
    <template v-if='planning.path'>
        <!-- Frame around the whole map: nobody mistakes the draft for the live picture -->
        <div
            class='planning-frame'
            aria-hidden='true'
        />

        <div
            class='planning-banner-wrap'
            data-testid='planning-banner'
        >
            <div
                class='planning-banner d-flex align-items-center gap-2'
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
                        v-text='subline'
                    />
                </div>
                <button
                    type='button'
                    class='btn btn-sm planning-share'
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
                    class='btn btn-sm planning-end'
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
        </div>
    </template>

    <PlanningStart
        v-if='planning.dialog === "start"'
        @close='planning.dialog = null'
    />
    <PlanningShare
        v-else-if='planning.dialog === "share"'
        @close='planning.dialog = null'
    />
    <PlanningEnd
        v-else-if='planning.dialog === "end"'
        @close='planning.dialog = null'
    />
</template>

<script setup lang='ts'>
import { computed, onMounted, onUnmounted } from 'vue';
import { IconPencilBolt, IconShare2, IconX } from '@tabler/icons-vue';
import { tr } from '../../../i18n/index.ts';
import { useMapStore } from '../../../stores/map.ts';
import { planning, planName, loadPlanning, refreshCount } from './planning.ts';
import PlanningStart from './PlanningStart.vue';
import PlanningShare from './PlanningShare.vue';
import PlanningEnd from './PlanningEnd.vue';

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

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
    await loadPlanning();

    // Cheap enough for a prototype: the worker counts the objects of one folder
    timer = setInterval(() => {
        if (planning.path) void refreshCount();
    }, 2000);
});

onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>

<style scoped>
.planning-frame {
    position: absolute;
    inset: 0;
    border: 5px solid #f59f00;
    pointer-events: none;
    z-index: 4;
}

.planning-banner-wrap {
    position: absolute;
    top: calc(76px + var(--status-bar-height, 0px));
    left: 64px;
    right: 64px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 5;
}

.planning-banner {
    pointer-events: auto;
    width: 100%;
    max-width: 560px;
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
