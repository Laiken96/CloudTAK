<template>
    <TablerModal size='md'>
        <div class='modal-status bg-orange' />
        <button
            type='button'
            class='btn-close'
            aria-label='Close'
            @click='emit("close")'
        />
        <div class='modal-header'>
            <IconPencilBolt
                :size='28'
                stroke='1.5'
            />
            <span class='modal-title mx-2'>Plan an action</span>
        </div>
        <div
            class='modal-body d-flex flex-column gap-3'
            data-testid='planning-start'
        >
            <div>
                Everything you draw while planning is a draft. Only you see it until you share it. Nothing goes to the TAK Server or into a Data Sync before that.
            </div>

            <TablerInlineAlert
                v-if='mapStore.mission'
                severity='info'
                title='Active Mission'
                :description='$tr("The Active Mission {name} stays untouched while you plan.", { name: mapStore.mission.meta.name })'
            />

            <TablerInlineAlert
                v-if='planning.path'
                severity='warning'
                title='Already planning'
                :description='$tr("You are planning {name}. Starting another plan keeps it as a draft.", { name: currentName })'
            />

            <TablerInput
                v-model='name'
                label='Name of the plan'
                data-testid='planning-name-input'
                @keyup.enter='start'
            />

            <button
                type='button'
                class='btn btn-primary w-100'
                data-testid='planning-start-button'
                :disabled='busy'
                @click='start'
            >
                <IconPlayerPlay
                    :size='18'
                    stroke='2'
                    class='me-2'
                />
                Start planning
            </button>

            <div
                v-if='drafts.length'
                class='d-flex flex-column gap-2'
            >
                <div class='subheader pt-2'>
                    Continue a draft
                </div>
                <button
                    v-for='draft of drafts'
                    :key='draft.path'
                    type='button'
                    class='btn w-100 d-flex align-items-center justify-content-between'
                    :class='{ "btn-outline-primary": draft.path === planning.path }'
                    :data-testid='`planning-draft-${draft.name}`'
                    :disabled='busy'
                    @click='resume(draft.path)'
                >
                    <span class='d-flex align-items-center gap-2 text-truncate'>
                        <IconFolder
                            :size='18'
                            stroke='1.5'
                        />
                        <span
                            class='text-truncate'
                            v-text='draft.name'
                        />
                    </span>
                    <span
                        class='text-secondary small'
                        v-text='$tr("Objects: {count}", { count: draft.count })'
                    />
                </button>
            </div>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import { TablerModal, TablerInput, TablerInlineAlert } from '@tak-ps/vue-tabler';
import { IconPencilBolt, IconPlayerPlay, IconFolder } from '@tabler/icons-vue';
import { useMapStore } from '../../../stores/map.ts';
import { planning, planName, defaultPlanName, listPlans, startPlan, resumePlan } from './planning.ts';

const emit = defineEmits<{ close: [] }>();

const mapStore = useMapStore();

const name = ref(defaultPlanName());
const busy = ref(false);
const drafts = ref<Array<{ path: string; name: string; count: number }>>([]);

const currentName = computed(() => planning.path ? planName(planning.path) : '');

onMounted(async () => {
    drafts.value = await listPlans();
});

async function start(): Promise<void> {
    busy.value = true;
    try {
        await startPlan(name.value);
        emit('close');
    } finally {
        busy.value = false;
    }
}

async function resume(path: string): Promise<void> {
    busy.value = true;
    try {
        await resumePlan(path);
        emit('close');
    } finally {
        busy.value = false;
    }
}
</script>
