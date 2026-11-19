<template>
    <MenuTemplate
        name='MEDEVAC 9-Line'
        :loading='loading'
        :none='!loading && (!cot || !form)'
    >
        <template #buttons>
            <TablerIconButton
                v-if='cot && form'
                title='Share'
                @click='openShare'
            >
                <IconShare2
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
        </template>

        <div
            v-if='cot && form'
            class='medevac d-flex flex-column gap-3 py-2'
        >
            <TablerInlineAlert
                v-if='!editable'
                severity='info'
                title='Read only'
                description='This MEDEVAC cannot be edited here. The 9-Line and the readout can still be viewed, copied and shared.'
            />

            <fieldset
                :disabled='!editable'
                class='d-flex flex-column gap-3'
            >
                <label class='d-flex flex-column gap-1'>
                    <span class='text-secondary small'>Title</span>
                    <input
                        v-model='form.title'
                        class='form-control'
                        type='text'
                        autocomplete='off'
                    >
                </label>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>1</span>
                        <span class='fw-bold'>Location of pick-up site</span>
                    </div>
                    <div
                        class='font-monospace fs-3'
                        v-text='location'
                    />
                    <div class='text-secondary small'>
                        MGRS of the object. Move the object to change it.
                    </div>
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>2</span>
                        <span class='fw-bold'>Radio frequency, call sign</span>
                    </div>
                    <div class='row g-2'>
                        <label class='col-12 col-sm-6 d-flex flex-column gap-1'>
                            <span class='text-secondary small'>Callsign</span>
                            <input
                                v-model='callsign'
                                class='form-control'
                                type='text'
                                autocomplete='off'
                            >
                        </label>
                        <label class='col-12 col-sm-6 d-flex flex-column gap-1'>
                            <span class='text-secondary small'>Frequency</span>
                            <input
                                v-model='form.freq'
                                class='form-control'
                                type='text'
                                inputmode='decimal'
                                autocomplete='off'
                            >
                        </label>
                    </div>
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>3</span>
                        <span class='fw-bold'>Number of patients by precedence</span>
                    </div>
                    <MedevacStepper
                        v-for='opt in PRECEDENCE'
                        :key='opt.key'
                        v-model='form.precedence[opt.key]'
                        :label='opt.label'
                        :disabled='!editable'
                    />
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>4</span>
                        <span class='fw-bold'>Special equipment required</span>
                    </div>
                    <label
                        v-for='opt in EQUIPMENT'
                        :key='opt.key'
                        class='form-check medevac-check'
                    >
                        <input
                            class='form-check-input'
                            type='checkbox'
                            :checked='form.equipment[opt.key]'
                            @change='form.equipment = toggleChoice(form.equipment, opt.key, checked($event), "equipment_none")'
                        >
                        <span
                            class='form-check-label'
                            v-text='opt.label'
                        />
                    </label>
                    <input
                        v-if='form.equipment.equipment_other'
                        v-model='form.equipment_detail'
                        class='form-control'
                        type='text'
                        placeholder='Other Equipment'
                        autocomplete='off'
                    >
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>5</span>
                        <span class='fw-bold'>Number of patients by type</span>
                    </div>
                    <MedevacStepper
                        v-for='opt in PATIENT_TYPE'
                        :key='opt.key'
                        v-model='form.patients[opt.key]'
                        :label='opt.label'
                        :disabled='!editable'
                    />
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>6</span>
                        <span class='fw-bold'>Security at pick-up site</span>
                    </div>
                    <select
                        v-model.number='form.security'
                        class='form-select'
                        aria-label='Security at pick-up site'
                    >
                        <option
                            v-for='(opt, i) in SECURITY'
                            :key='opt.code'
                            :value='i'
                            v-text='opt.label'
                        />
                    </select>
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>7</span>
                        <span class='fw-bold'>Method of marking pick-up site</span>
                    </div>
                    <select
                        v-model.number='form.hlz_marking'
                        class='form-select'
                        aria-label='Method of marking pick-up site'
                    >
                        <option
                            v-for='(opt, i) in HLZ_MARKING'
                            :key='opt.code'
                            :value='i'
                            v-text='opt.label'
                        />
                    </select>
                    <input
                        v-if='form.hlz_marking === HLZ_MARKING_OTHER'
                        v-model='form.hlz_other'
                        class='form-control'
                        type='text'
                        placeholder='Other Marking'
                        autocomplete='off'
                    >
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>8</span>
                        <span class='fw-bold'>Patient nationality and status</span>
                    </div>
                    <MedevacStepper
                        v-for='opt in NATIONALITY'
                        :key='opt.key'
                        v-model='form.nationality[opt.key]'
                        :label='opt.label'
                        :disabled='!editable'
                    />
                </section>

                <section class='medevac-line'>
                    <div class='medevac-line-head'>
                        <span class='medevac-line-number'>9</span>
                        <span class='fw-bold'>Pick-up site terrain and obstacles</span>
                    </div>
                    <template
                        v-for='opt in TERRAIN'
                        :key='opt.key'
                    >
                        <label class='form-check medevac-check'>
                            <input
                                class='form-check-input'
                                type='checkbox'
                                :checked='form.terrain[opt.key]'
                                @change='form.terrain = toggleChoice(form.terrain, opt.key, checked($event), "terrain_none")'
                            >
                            <span
                                class='form-check-label'
                                v-text='opt.label'
                            />
                        </label>
                        <select
                            v-if='opt.key === "terrain_slope" && form.terrain.terrain_slope'
                            v-model='form.terrain_slope_dir'
                            class='form-select ms-4 medevac-direction'
                            aria-label='Slope direction'
                        >
                            <option
                                v-for='dir in SLOPE_DIRECTIONS'
                                :key='dir'
                                :value='dir'
                                v-text='dir'
                            />
                        </select>
                    </template>
                    <input
                        v-if='form.terrain.terrain_other'
                        v-model='form.terrain_other_detail'
                        class='form-control'
                        type='text'
                        placeholder='Other terrain features'
                        autocomplete='off'
                    >
                    <div class='text-secondary small'>
                        ATAK has no field for NBC contamination (wartime Line 9) - enter it under Other.
                    </div>
                </section>

                <section class='medevac-line'>
                    <button
                        type='button'
                        class='btn btn-link px-0 d-flex align-items-center gap-1 text-reset medevac-toggle'
                        :aria-expanded='showHlz'
                        @click='showHlz = !showHlz'
                    >
                        <IconChevronDown
                            v-if='showHlz'
                            :size='20'
                            stroke='1.5'
                        />
                        <IconChevronRight
                            v-else
                            :size='20'
                            stroke='1.5'
                        />
                        <span class='fw-bold'>HLZ Brief</span>
                        <span class='text-secondary small'>(optional)</span>
                    </button>
                    <template v-if='showHlz'>
                        <label
                            v-for='field in HLZ_FIELDS'
                            :key='field.key'
                            class='d-flex flex-column gap-1'
                        >
                            <span
                                class='text-secondary small'
                                v-text='field.label'
                            />
                            <input
                                v-model='form.hlz[field.key]'
                                class='form-control'
                                type='text'
                                autocomplete='off'
                            >
                        </label>
                    </template>
                </section>
            </fieldset>

            <div
                v-if='zmist'
                class='text-secondary small'
            >
                Patient details (ZMIST) from ATAK are passed on unchanged but not shown.
            </div>

            <section class='medevac-line'>
                <div class='d-flex align-items-center'>
                    <span class='fw-bold'>Readout</span>
                    <div class='ms-auto'>
                        <CopyButton
                            :text='readout'
                            title='Copy Readout'
                            :size='28'
                        />
                    </div>
                </div>
                <pre
                    class='medevac-readout mb-0'
                    v-text='readout'
                />
            </section>
        </div>
    </MenuTemplate>

    <Share
        v-if='share && cot'
        :feats='[cot.as_feature()]'
        @done='share = false'
        @close='share = false'
    />
</template>

<script setup lang='ts'>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import {
    TablerIconButton,
    TablerInlineAlert,
} from '@tak-ps/vue-tabler';
import {
    IconShare2,
    IconChevronDown,
    IconChevronRight,
} from '@tabler/icons-vue';
import MenuTemplate from '../util/MenuTemplate.vue';
import CopyButton from '../util/CopyButton.vue';
import Share from '../util/Share.vue';
import MedevacStepper from './MedevacStepper.vue';
import type COT from '../../../base/cot.ts';
import { OriginMode } from '../../../base/cot.ts';
import Subscription from '../../../base/subscription.ts';
import { useMapStore } from '../../../stores/map.ts';
import { formatCoordPair } from '../../../utils/coordinateFormat.ts';
import {
    PRECEDENCE,
    EQUIPMENT,
    PATIENT_TYPE,
    SECURITY,
    HLZ_MARKING,
    HLZ_MARKING_OTHER,
    NATIONALITY,
    TERRAIN,
    SLOPE_DIRECTIONS,
    HLZ_FIELDS,
    NEW_FEATURE_CALLSIGN,
    formFromDetail,
    detailFromForm,
    medevacDetail,
    medevacCallsign,
    medevacReadout,
    hasZMist,
    toggleChoice,
    type MedevacForm,
} from '../../../utils/medevac.ts';

const route = useRoute();
const mapStore = useMapStore();

const loading = ref(true);
const cot = ref<COT | undefined>();
const editable = ref(false);
const form = ref<MedevacForm | undefined>();
const callsign = ref('');
const share = ref(false);
const showHlz = ref(false);

// What was last loaded into or written from the form - a change of the CoT
// that differs (eg ATAK resent the MEDEVAC) reloads the form
let lastDetail: string | undefined;
let lastCallsign: string | undefined;

// Set while the form is filled from the CoT so that does not write back
let syncing = false;

// Edits apply as they are made - debounced while typing
let persistTimeout: ReturnType<typeof setTimeout> | undefined;
let persisting: Promise<void> | undefined;

const location = computed<string>(() => {
    if (!cot.value) return '';

    const center = cot.value.properties.center;
    const coords = Array.isArray(center) && center.length >= 2
        ? center
        : (cot.value.geometry.type === 'Point' ? cot.value.geometry.coordinates : undefined);

    if (!coords) return '';
    return formatCoordPair(Number(coords[1]), Number(coords[0]), 'mgrs');
});

const zmist = computed<boolean>(() => {
    return !!cot.value && hasZMist(medevacDetail(cot.value.properties));
});

const readout = computed<string>(() => {
    if (!form.value) return '';

    return medevacReadout({
        location: location.value,
        callsign: callsign.value.trim(),
        form: form.value
    });
});

function checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
}

onMounted(async () => {
    await load();
});

onUnmounted(() => {
    if (persistTimeout) {
        clearTimeout(persistTimeout);
        persistTimeout = undefined;
        void persist();
    }

    if (cot.value && cot.value._liveQuerySubscription) {
        cot.value._liveQuerySubscription.unsubscribe();
    }
});

async function load(): Promise<void> {
    loading.value = true;

    try {
        const loaded = await mapStore.worker.db.get(String(route.params.uid), { mission: true });
        if (!loaded) return;

        editable.value = await canEdit(loaded);

        cot.value = loaded;
        cot.value.reactivity();

        syncFromCot();

        // ATAK writes the defaults of an untouched 9-Line when it is first
        // opened - do the same so the MEDEVAC goes out complete
        if (editable.value && !medevacDetail(loaded.properties)) {
            await persist();
        }
    } finally {
        loading.value = false;
    }
}

async function canEdit(loaded: COT): Promise<boolean> {
    if (!loaded.is_editable) return false;

    if (loaded.origin.mode === OriginMode.MISSION && loaded.origin.mode_id) {
        const subscription = await Subscription.from(loaded.origin.mode_id);
        return !!subscription && !!subscription.role && subscription.role.permissions.includes('MISSION_WRITE');
    }

    return true;
}

/**
 * Fill the form from the CoT unless it still shows what is stored
 */
function syncFromCot(): void {
    if (!cot.value) return;

    const properties = cot.value.properties;
    const detail = medevacDetail(properties);
    const detailJSON = JSON.stringify(detail ?? null);
    const storedCallsign = String(properties.callsign || '');

    if (detailJSON === lastDetail && storedCallsign === lastCallsign) return;

    syncing = true;

    lastDetail = detailJSON;
    lastCallsign = storedCallsign;

    // A MEDEVAC drawn as a plain Point gets the callsign ATAK would give it
    callsign.value = editable.value && !detail && (!storedCallsign || storedCallsign === NEW_FEATURE_CALLSIGN)
        ? medevacCallsign(mapStore.callsign)
        : storedCallsign;

    form.value = formFromDetail(detail, callsign.value);

    void nextTick(() => {
        syncing = false;
    });
}

watch(() => [cot.value?.properties.medevac, cot.value?.properties.callsign], () => {
    // Local edits that are not yet stored win over the CoT
    if (persistTimeout || persisting) return;
    syncFromCot();
}, { deep: true });

// ATAK labels the marker with the 9-Line title, which starts out as the
// callsign - keep following the callsign until the title is set apart
watch(callsign, (next, previous) => {
    if (syncing || !form.value) return;
    if (form.value.title === previous) form.value.title = next;
});

watch([form, callsign], () => {
    if (syncing || !editable.value) return;

    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(() => {
        persistTimeout = undefined;
        void persist();
    }, 400);
}, { deep: true });

/** Store pending edits now - before the MEDEVAC is shared */
async function flush(): Promise<void> {
    if (persistTimeout) {
        clearTimeout(persistTimeout);
        persistTimeout = undefined;
        await persist();
    } else if (persisting) {
        await persisting;
    }
}

async function openShare(): Promise<void> {
    await flush();
    share.value = true;
}

async function persist(): Promise<void> {
    if (!cot.value || !form.value || !editable.value) return;

    const properties = JSON.parse(JSON.stringify(cot.value.properties)) as COT['properties'];

    properties.medevac = detailFromForm(form.value, medevacDetail(properties));

    const name = callsign.value.trim();
    if (name) properties.callsign = name;

    lastDetail = JSON.stringify(properties.medevac);
    lastCallsign = String(properties.callsign || '');

    persisting = cot.value.update({ properties }).then(() => undefined);

    try {
        await persisting;
    } finally {
        persisting = undefined;
    }
}
</script>

<style scoped>
.medevac fieldset {
    min-width: 0;
}

.medevac-line {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.medevac-line-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.medevac-line-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-weight: bold;
    background: var(--tblr-red, #d63939);
    color: #fff;
}

/* 16px keeps iOS Safari from zooming in on focus, 44px is a comfortable touch target */
.medevac .form-control,
.medevac .form-select {
    font-size: 16px;
    min-height: 44px;
}

.medevac-direction {
    max-width: 120px;
}

.medevac-check {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 44px;
    margin: 0;
    padding-left: 0;
    cursor: pointer;
}

.medevac-check .form-check-input {
    width: 24px;
    height: 24px;
    margin: 0;
    float: none;
    flex-shrink: 0;
}

.medevac-toggle {
    min-height: 44px;
    text-decoration: none;
}

.medevac-readout {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.9rem;
    padding: 0.75rem;
    border-radius: 4px;
    background: var(--tblr-bg-surface-secondary, rgba(128, 128, 128, 0.12));
}
</style>
