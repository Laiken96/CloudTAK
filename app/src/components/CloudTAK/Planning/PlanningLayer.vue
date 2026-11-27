<template>
    <!-- PzBat12 prototype: planning mode, see planning.ts -->
    <template v-if='planning.path'>
        <!-- Frame around the whole map: nobody mistakes the draft for the live picture -->
        <div
            class='planning-frame'
            aria-hidden='true'
        />

        <!-- On a phone the top bar is one panel - the banner goes below it.
             On a larger screen it sits in the top bar next to the mission (TopBar.vue) -->
        <div
            v-if='appStore.isMobileDetected'
            class='planning-banner-wrap'
        >
            <PlanningBanner variant='floating' />
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
import { onMounted, onUnmounted } from 'vue';
import { useAppStore } from '../../../stores/app.ts';
import { planning, loadPlanning, refreshCount } from './planning.ts';
import PlanningBanner from './PlanningBanner.vue';
import PlanningStart from './PlanningStart.vue';
import PlanningShare from './PlanningShare.vue';
import PlanningEnd from './PlanningEnd.vue';

const appStore = useAppStore();

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
</style>
