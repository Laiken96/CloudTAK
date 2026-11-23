<template>
    <div
        v-if='kind'
        class='d-flex align-items-center gap-1 small'
        :class='problem ? "text-warning" : "text-secondary"'
        data-testid='mission-file-status'
    >
        <IconMapPin
            v-if='state === "loaded" && !problem'
            :size='16'
            stroke='1.5'
            class='flex-shrink-0'
        />
        <IconLoader2
            v-else-if='state === "loading"'
            :size='16'
            stroke='1.5'
            class='flex-shrink-0 mission-file-spin'
        />
        <IconMapOff
            v-else
            :size='16'
            stroke='1.5'
            class='flex-shrink-0'
        />

        <span
            class='text-break'
            v-text='text'
        />

        <TablerIconButton
            v-if='state === "failed"'
            title='Retry'
            class='ms-1'
            @click='missionFiles.retry(props.subscription.guid, props.content.hash)'
        >
            <IconRefresh
                :size='24'
                stroke='1'
            />
        </TablerIconButton>
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { IconMapPin, IconMapOff, IconLoader2, IconRefresh } from '@tabler/icons-vue';
import { TablerIconButton } from '@tak-ps/vue-tabler';
import { tr } from '../../../../i18n/index.ts';
import OverlayManager from '../../../../base/overlay.ts';
import { missionFiles } from '../../../../base/mission-files.ts';
import { missionFileKind, MISSION_FILE_MAX_BYTES } from '../../../../utils/mission-file-kind.ts';
import type Subscription from '../../../../base/subscription.ts';
import type { DBSubscriptionContent } from '../../../../database.ts';

/**
 * Mission > Files: whether the objects of a file are on the map, and if not why
 * (see base/mission-files.ts). Nothing for files that are not map files.
 */
const props = defineProps<{
    subscription: Subscription;
    content: DBSubscriptionContent;
}>();

const kind = computed(() => missionFileKind(props.content.name, props.content.mimeType));

const onMap = computed(() => !!OverlayManager.loadedByMode('mission', props.subscription.guid));

const status = computed(() => missionFiles.status(props.subscription.guid, props.content.hash));

const state = computed(() => {
    if (!props.subscription.subscribed) return 'unsubscribed';
    if (!onMap.value || !status.value) return 'loading';
    return status.value.state;
});

const problem = computed(() => {
    if (state.value === 'loaded') return status.value?.count === 0;
    return state.value !== 'loading';
});

const text = computed(() => {
    const current = status.value;

    switch (state.value) {
        case 'unsubscribed':
            return tr('Not on the map: the mission is not subscribed');
        case 'too-large':
            return tr('Not on the map: larger than {size} MB', { size: Math.round(MISSION_FILE_MAX_BYTES / 1024 / 1024) });
        case 'invalid':
            return tr('Not on the map: format not readable');
        case 'failed':
            return tr('Not on the map: download failed');
        case 'loaded': {
            const count = current?.count ?? 0;
            const shown = current?.shown ?? count;

            if (count === 0) return tr('No objects for the map');
            if (shown < count) {
                return tr('On the map: {shown} of {count} objects, the others are already in the mission or filtered', { shown, count });
            }

            return count === 1 ? tr('On the map: 1 object') : tr('On the map: {count} objects', { count });
        }
        default:
            return tr('Loading for the map...');
    }
});
</script>

<style scoped>
.mission-file-spin {
    animation: mission-file-spin 1s linear infinite;
}

@keyframes mission-file-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
