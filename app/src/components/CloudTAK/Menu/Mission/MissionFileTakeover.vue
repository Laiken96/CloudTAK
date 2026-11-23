<template>
    <TablerModal
        v-if='open'
        size='sm'
    >
        <button
            type='button'
            class='btn-close'
            aria-label='Close'
            :disabled='busy'
            @click='close'
        />
        <div class='modal-status bg-blue' />
        <div class='modal-header text-body'>
            <div class='d-flex align-items-center'>
                <IconFileImport
                    :size='28'
                    stroke='1'
                />
                <span class='mx-2'>Take Over into Mission</span>
            </div>
        </div>

        <div
            class='modal-body text-body'
            data-testid='mission-file-takeover'
        >
            <template v-if='result || error'>
                <div
                    v-if='result && result.written'
                    class='alert alert-success'
                    role='status'
                    v-text='writtenText'
                />
                <div
                    v-if='result && result.failed'
                    class='alert alert-danger'
                    role='alert'
                    v-text='failedText'
                />
                <div
                    v-for='folder in result ? result.folders : []'
                    :key='folder.name'
                    class='alert alert-warning'
                    role='alert'
                    v-text='folderText(folder)'
                />
                <div
                    v-if='error'
                    class='alert alert-danger'
                    role='alert'
                    v-text='error'
                />
            </template>
            <template v-else>
                <p
                    class='fw-bold'
                    v-text='question'
                />
                <p class='text-secondary'>
                    They become objects of the mission: listed under Layers and in the Hashtag Manager and editable for everyone with write access. The files stay attached.
                </p>

                <ul class='list-group mb-3'>
                    <li
                        v-for='file in files'
                        :key='file.hash'
                        class='list-group-item d-flex align-items-center gap-2'
                    >
                        <IconFile
                            :size='20'
                            stroke='1'
                            class='flex-shrink-0'
                        />
                        <span
                            class='text-break flex-grow-1'
                            v-text='file.name'
                        />
                        <span
                            class='badge bg-blue-lt flex-shrink-0'
                            v-text='file.features.length'
                        />
                    </li>
                </ul>

                <label
                    class='form-check form-switch d-flex align-items-center gap-2 m-0 py-2 cursor-pointer'
                    style='min-height: 44px'
                >
                    <input
                        v-model='folders'
                        class='form-check-input flex-shrink-0 m-0'
                        type='checkbox'
                        :disabled='busy'
                    >
                    <span>One folder per file, named after the file</span>
                </label>
            </template>
        </div>

        <div class='modal-footer d-flex gap-2'>
            <button
                v-if='result || error'
                type='button'
                class='btn btn-primary flex-grow-1'
                @click='close'
            >
                Close
            </button>
            <template v-else>
                <button
                    type='button'
                    class='btn btn-outline-secondary flex-grow-1'
                    :disabled='busy'
                    @click='close'
                >
                    Later
                </button>
                <button
                    type='button'
                    class='btn btn-primary flex-grow-1'
                    data-testid='mission-file-takeover-confirm'
                    :disabled='busy'
                    @click='take'
                >
                    <span
                        v-if='busy'
                        class='spinner-border spinner-border-sm me-2'
                        role='status'
                    />
                    Take Over
                </button>
            </template>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { TablerModal } from '@tak-ps/vue-tabler';
import { IconFile, IconFileImport } from '@tabler/icons-vue';
import { tr } from '../../../../i18n/index.ts';
import { useMapStore } from '../../../../stores/map.ts';
import { missionFiles } from '../../../../base/mission-files.ts';
import {
    askedHashes,
    canTakeOver,
    markAsked,
    takeOver,
    takeoverCandidates,
    takeoverState,
    type TakeoverFile,
    type TakeoverMission,
    type TakeoverResult,
} from '../../../../base/mission-file-takeover.ts';
import type Atlas from '../../../../workers/atlas.ts';

/**
 * Mission view: asks once per file whether the objects of the files attached
 * to the mission should be taken over into it, and runs the takeover asked
 * for in Mission > Files (see base/mission-file-takeover.ts). Only for
 * subscribers with write access.
 */
const props = defineProps<{
    subscription: TakeoverMission;
}>();

const mapStore = useMapStore();

const open = ref(false);
const busy = ref(false);
const folders = ref(true);
const files = shallowRef<TakeoverFile[]>([]);
const result = shallowRef<TakeoverResult | undefined>();
const error = ref<string | undefined>();

const writable = computed(() => canTakeOver(props.subscription));

const count = computed(() => files.value.reduce((sum, file) => sum + file.features.length, 0));

const question = computed(() => count.value === 1
    ? tr('Take over 1 drawing from attached files into the mission?')
    : tr('Take over {count} drawings from attached files into the mission?', { count: count.value }));

const writtenText = computed(() => result.value?.written === 1
    ? tr('1 drawing is now in the mission')
    : tr('{count} drawings are now in the mission', { count: result.value?.written ?? 0 }));

const failedText = computed(() => {
    const params = { count: result.value?.failed ?? 0, error: result.value?.error ?? '' };

    return params.count === 1
        ? tr('1 drawing could not be taken over: {error}', params)
        : tr('{count} drawings could not be taken over: {error}', params);
});

function folderText(folder: { name: string; error: string }): string {
    return tr('The folder {name} could not be created or filled ({error}); its drawings are in the mission without folder.', folder);
}

/** Changes whenever the map paints other objects of the mission's files */
const painted = computed(() => {
    const prefix = `${props.subscription.guid}:`;
    const parts: string[] = [];

    for (const [key, status] of missionFiles.statuses) {
        if (key.startsWith(prefix)) parts.push(`${key}=${status.state}/${status.count}/${status.shown}`);
    }

    return parts.sort().join('|');
});

let seq = 0;

async function refresh(): Promise<void> {
    const run = ++seq;
    const guid = props.subscription.guid;

    if (!writable.value) {
        takeoverState.pending.delete(guid);
        return;
    }

    const pending = await takeoverCandidates(guid);
    if (run !== seq) return;

    takeoverState.pending.set(guid, pending);

    // Ask once per file: a new file (new hash) is asked about again
    if (open.value || busy.value || !pending.length) return;

    const asked = await askedHashes(guid);
    const fresh = pending.filter((file) => !asked.has(file.hash));
    if (run !== seq || open.value || !fresh.length) return;

    show(fresh);
}

function show(list: TakeoverFile[]): void {
    files.value = list;
    folders.value = true;
    result.value = undefined;
    error.value = undefined;
    open.value = true;
}

async function close(): Promise<void> {
    if (busy.value) return;

    open.value = false;

    if (!result.value && !error.value) {
        await markAsked(props.subscription.guid, files.value.map((file) => file.hash));
    }
}

async function take(): Promise<void> {
    busy.value = true;

    try {
        await markAsked(props.subscription.guid, files.value.map((file) => file.hash));

        result.value = await takeOver(
            props.subscription,
            mapStore.worker as unknown as Atlas,
            files.value,
            { folders: folders.value }
        );
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        busy.value = false;
        void refresh();
    }
}

watch([painted, writable, () => props.subscription.guid], () => {
    void refresh();
}, { immediate: true });

// Mission > Files asks for a takeover
watch(() => takeoverState.request.value, (request) => {
    if (!request || request.guid !== props.subscription.guid) return;
    takeoverState.request.value = null;

    if (!writable.value || open.value) return;

    const pending = takeoverState.pending.get(request.guid) ?? [];
    const chosen = request.hashes
        ? pending.filter((file) => request.hashes?.includes(file.hash))
        : pending;

    if (chosen.length) show(chosen);
}, { immediate: true });

onBeforeUnmount(() => {
    seq++;
    takeoverState.pending.delete(props.subscription.guid);
});
</script>
