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
            <span
                class='modal-title text-truncate'
                v-text='$tr("Finish planning {name}", { name })'
            />
        </div>
        <div
            class='modal-body d-flex flex-column gap-3'
            data-testid='planning-end-dialog'
        >
            <template v-if='!confirmDiscard'>
                <button
                    type='button'
                    class='btn btn-primary w-100'
                    data-testid='planning-keep'
                    :disabled='busy'
                    @click='keep'
                >
                    Keep as draft
                </button>
                <div class='small text-secondary'>
                    The objects stay in your own objects in the folder Planung. Continue the draft any time with Plan an action.
                </div>

                <button
                    type='button'
                    class='btn btn-outline-danger w-100'
                    data-testid='planning-discard'
                    :disabled='busy'
                    @click='confirmDiscard = true'
                >
                    <IconTrash
                        :size='18'
                        stroke='1.5'
                        class='me-2'
                    />
                    Discard draft
                </button>

                <button
                    type='button'
                    class='btn btn-link w-100'
                    @click='emit("close")'
                >
                    Continue planning
                </button>
            </template>
            <template v-else>
                <div
                    class='fw-bold'
                    v-text='$tr("Delete {count} objects of the plan? This cannot be undone.", { count: planning.count })'
                />
                <div class='d-flex gap-2'>
                    <button
                        type='button'
                        class='btn flex-grow-1'
                        @click='confirmDiscard = false'
                    >
                        Cancel
                    </button>
                    <button
                        type='button'
                        class='btn btn-danger flex-grow-1'
                        data-testid='planning-discard-confirm'
                        :disabled='busy'
                        @click='discard'
                    >
                        Delete
                    </button>
                </div>
            </template>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { ref, computed } from 'vue';
import { TablerModal } from '@tak-ps/vue-tabler';
import { IconTrash } from '@tabler/icons-vue';
import { planning, planName, endPlan, discardPlan } from './planning.ts';

const emit = defineEmits<{ close: [] }>();

const busy = ref(false);
const confirmDiscard = ref(false);

const name = computed(() => planning.path ? planName(planning.path) : '');

async function keep(): Promise<void> {
    busy.value = true;
    try {
        await endPlan();
        emit('close');
    } finally {
        busy.value = false;
    }
}

async function discard(): Promise<void> {
    busy.value = true;
    try {
        await discardPlan();
        emit('close');
    } finally {
        busy.value = false;
    }
}
</script>
