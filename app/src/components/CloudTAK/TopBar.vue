<template>
    <div
        class='position-absolute d-flex align-items-center cloudtak-top-bar'
        :class='compact ? "cloudtak-panel px-2" : "cloudtak-top-bar--split"'
    >
        <div
            class='d-flex align-items-center cloudtak-top-bar-section'
            :class='compact ? "flex-grow-1" : "cloudtak-panel px-2"'
            style='min-width: 0;'
        >
            <SimpleModeExit
                v-if='simpleMode'
                :compact='compact'
            />
            <ActiveMission
                v-else
                :compact='compact'
            />
        </div>

        <!-- PzBat12: planning mode (prototype) - next to the mission, never over the menu -->
        <PlanningBanner
            v-if='!compact'
            variant='topbar'
        />

        <div
            class='d-flex align-items-center flex-shrink-0 cloudtak-top-bar-section'
            :class='{ "cloudtak-panel px-2": !compact }'
        >
            <div
                v-if='compact'
                class='border-start mx-1'
                style='height: 32px;'
            />

            <!-- The simple view has no notifications or drawing tools -->
            <div
                v-if='!simpleMode'
                class='position-relative'
                data-testid='top-bar-notifications'
            >
                <TablerDropdown>
                    <TablerIconButton
                        id='map-notifications'
                        title='Notifications Icon'
                        class='cloudtak-hover'
                        :class='{ "alert-pulse": alertNotifications }'
                        :hover='false'
                    >
                        <IconAlertTriangle
                            v-if='alertNotifications'
                            :size='40'
                            stroke='1'
                            class='text-danger'
                        />
                        <IconBell
                            v-else
                            :size='40'
                            stroke='1'
                        />
                    </TablerIconButton>
                    <template #dropdown>
                        <Notifications />
                    </template>
                </TablerDropdown>

                <span
                    v-if='notifications'
                    class='badge bg-red text-white notification-count'
                    v-text='notificationCount'
                />
            </div>

            <DrawTools
                v-if='!simpleMode'
                data-testid='top-bar-draw-tools'
            />
            <!-- PzBat12: the simple view keeps measuring from the drawing tools -->
            <TablerIconButton
                v-else
                title='Measure Distance'
                class='mx-2 cloudtak-hover'
                data-testid='top-bar-measure'
                :hover='false'
                @click='measureState.active ? stopMeasure() : startMeasure()'
            >
                <IconRuler2
                    :size='40'
                    stroke='1'
                    :color='measureState.active ? "#1E90FF" : undefined'
                />
            </TablerIconButton>

            <div
                v-if='!simpleMode'
                class='border-start mx-1'
                style='height: 32px;'
            />

            <TablerIconButton
                v-if='!menuShown'
                title='Open Menu'
                class='ms-1 cloudtak-hover'
                data-testid='top-bar-menu-open'
                :hover='false'
                @click='router.push("/menu")'
            >
                <IconMenu2
                    :size='40'
                    stroke='1'
                />
            </TablerIconButton>
            <TablerIconButton
                v-else
                title='Close Menu'
                class='ms-1 cloudtak-hover'
                data-testid='top-bar-menu-close'
                :hover='false'
                @click='router.push("/")'
            >
                <IconX
                    :size='40'
                    stroke='1'
                />
            </TablerIconButton>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { from } from 'rxjs';
import { liveQuery } from '../../database.ts';
import { useObservable } from '@vueuse/rxjs';
import { TablerIconButton, TablerDropdown } from '@tak-ps/vue-tabler';
import {
    IconAlertTriangle,
    IconMenu2,
    IconBell,
    IconRuler2,
    IconX,
} from '@tabler/icons-vue';
import ActiveMission from './ActiveMission.vue';
// PzBat12: planning mode (prototype)
import PlanningBanner from './Planning/PlanningBanner.vue';
import Notifications from './Notifications.vue';
import DrawTools from './DrawTools.vue';
import SimpleModeExit from './util/SimpleModeExit.vue';
import { simpleMode } from '../../stores/modules/simple-mode.ts';
import { measureState, startMeasure, stopMeasure } from '../../base/measure-tool.ts';
import TAKNotification, { NotificationType } from '../../base/notification.ts';
import { useAppStore } from '../../stores/app.ts';

defineProps<{
    menuShown: boolean;
}>();

const router = useRouter();
const appStore = useAppStore();

const compact = computed(() => appStore.isMobileDetected);

const notifications = useObservable<number>(
    from(liveQuery(async () => {
        return await TAKNotification.count()
    }))
);

const notificationCount = computed(() => {
    const count = notifications.value || 0;
    return count > 99 ? '99+' : String(count);
});

const alertNotifications = useObservable<number>(
    from(liveQuery(async () => {
        return await TAKNotification.countByType(NotificationType.Alert)
    }))
);
</script>

<style scoped>
.cloudtak-top-bar {
    z-index: 5;
    top: calc(8px + var(--status-bar-height, 0px));
    left: 8px;
    right: 8px;
    height: 60px;
}

/* Two floating panels with the map still interactive between them */
.cloudtak-top-bar--split {
    justify-content: space-between;
    pointer-events: none;
}

.cloudtak-top-bar--split .cloudtak-top-bar-section {
    height: 60px;
    pointer-events: auto;
}

@keyframes alert-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

.alert-pulse {
    animation: alert-pulse 1.2s ease-in-out infinite;
}

.notification-count {
    position: absolute;
    top: 0;
    right: 0;
    padding: 2px 5px;
    font-size: 11px;
    line-height: 1;
    pointer-events: none;
}
</style>
