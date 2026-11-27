<template>
    <Share
        v-if='mode === "users"'
        :feats='feats'
        @close='emit("close")'
    />
    <ShareToPackage
        v-else-if='mode === "package"'
        :name='name'
        :feats='feats'
        @close='emit("close")'
    />
    <TablerModal
        v-else
        size='md'
    >
        <div class='modal-status bg-orange' />
        <button
            type='button'
            class='btn-close'
            aria-label='Close'
            @click='emit("close")'
        />
        <div class='modal-header'>
            <IconShare2
                :size='28'
                stroke='1.5'
            />
            <span
                class='modal-title mx-2 text-truncate'
                v-text='$tr("Share plan {name}", { name })'
            />
        </div>
        <div
            class='modal-body d-flex flex-column gap-3'
            data-testid='planning-share-dialog'
        >
            <TablerLoading v-if='loading' />
            <template v-else-if='!feats.length'>
                <div data-testid='planning-share-empty'>
                    The plan has no objects yet. Draw something first.
                </div>
            </template>
            <template v-else-if='mode === "mission"'>
                <div>
                    The objects move into the Data Sync. Everyone in it sees them, ATAK included. Planning ends.
                </div>

                <EmptyInfo
                    v-if='!missions.length'
                    type='Missions'
                />
                <button
                    v-for='mission of missions'
                    :key='mission.guid'
                    type='button'
                    class='btn w-100 d-flex align-items-center gap-2 text-start'
                    :class='{ "btn-primary": selected === mission.guid }'
                    :data-testid='`planning-mission-${mission.guid}`'
                    @click='selected = mission.guid'
                >
                    <IconCloudPin
                        :size='20'
                        stroke='1.5'
                    />
                    <span
                        class='flex-grow-1 text-truncate'
                        v-text='mission.name'
                    />
                    <span
                        v-if='mission.guid === mapStore.mission?.meta.guid'
                        class='badge bg-blue-lt'
                    >Active</span>
                </button>

                <div class='d-flex gap-2'>
                    <button
                        type='button'
                        class='btn'
                        @click='mode = "choose"'
                    >
                        Back
                    </button>
                    <button
                        type='button'
                        class='btn btn-primary flex-grow-1'
                        data-testid='planning-publish'
                        :disabled='!selected || busy'
                        @click='publish'
                        v-text='$tr("Publish {count} objects", { count: feats.length })'
                    />
                </div>
            </template>
            <template v-else>
                <div
                    class='text-secondary'
                    v-text='$tr("Objects: {count}", { count: feats.length })'
                />

                <button
                    type='button'
                    class='btn w-100 planning-option'
                    data-testid='planning-share-mission'
                    @click='mode = "mission"'
                >
                    <IconCloudPin
                        :size='28'
                        stroke='1.5'
                        class='flex-shrink-0'
                    />
                    <span class='text-start'>
                        <span class='d-block fw-bold'>Into a Data Sync</span>
                        <span class='d-block small text-secondary'>Everyone in the Data Sync sees the plan, ATAK included. Planning ends.</span>
                    </span>
                </button>

                <button
                    type='button'
                    class='btn w-100 planning-option'
                    data-testid='planning-share-users'
                    @click='mode = "users"'
                >
                    <IconUsers
                        :size='28'
                        stroke='1.5'
                        class='flex-shrink-0'
                    />
                    <span class='text-start'>
                        <span class='d-block fw-bold'>To people or groups</span>
                        <span class='d-block small text-secondary'>Sends a copy. You keep planning.</span>
                    </span>
                </button>

                <button
                    type='button'
                    class='btn w-100 planning-option'
                    data-testid='planning-share-package'
                    @click='mode = "package"'
                >
                    <IconPackageExport
                        :size='28'
                        stroke='1.5'
                        class='flex-shrink-0'
                    />
                    <span class='text-start'>
                        <span class='d-block fw-bold'>As data package</span>
                        <span class='d-block small text-secondary'>A file for ATAK or for later. You keep planning.</span>
                    </span>
                </button>
            </template>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import { TablerModal, TablerLoading } from '@tak-ps/vue-tabler';
import { IconShare2, IconCloudPin, IconUsers, IconPackageExport } from '@tabler/icons-vue';
import Share from '../util/Share.vue';
import ShareToPackage from '../util/ShareToPackage.vue';
import EmptyInfo from '../util/EmptyInfo.vue';
import Subscription from '../../../base/subscription.ts';
import { useMapStore } from '../../../stores/map.ts';
import type { Feature } from '../../../types.ts';
import { planning, planName, planFeatures, publishToMission } from './planning.ts';

const emit = defineEmits<{ close: [] }>();

const mapStore = useMapStore();

const mode = ref<'choose' | 'mission' | 'users' | 'package'>('choose');
const loading = ref(true);
const busy = ref(false);
const feats = ref<Feature[]>([]);
const missions = ref<Array<{ guid: string; name: string }>>([]);
const selected = ref<string | undefined>();

const name = computed(() => planning.path ? planName(planning.path) : '');

onMounted(async () => {
    try {
        feats.value = await planFeatures();

        // Missions this user may write to, the Active Mission first and preselected
        const active = mapStore.mission?.meta.guid;
        missions.value = Array.from(await Subscription.localList({ role: 'MISSION_SUBSCRIBER' }))
            .sort((a, b) => (a.guid === active ? -1 : b.guid === active ? 1 : a.name.localeCompare(b.name)));

        if (active && missions.value.some((m) => m.guid === active)) selected.value = active;
    } finally {
        loading.value = false;
    }
});

async function publish(): Promise<void> {
    if (!selected.value) return;

    busy.value = true;
    try {
        await publishToMission(selected.value);
        emit('close');
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.planning-option {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-start;
    min-height: 64px;
    white-space: normal;
}
</style>
