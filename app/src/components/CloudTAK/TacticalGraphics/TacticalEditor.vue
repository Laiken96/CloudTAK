<template>
    <MenuTemplate
        :name='entry ? entry.label : "Tactical Graphic"'
        :loading='loading'
        :none='!loading && (!cot || !entry || !draft)'
    >
        <div
            v-if='cot && entry && draft'
            class='d-flex flex-column gap-3 py-2'
            data-testid='tactical-editor'
        >
            <div class='d-flex align-items-center gap-3'>
                <TacticalPreview
                    :entry='entry'
                    :model='draft'
                    :width='120'
                    :height='54'
                />
                <div
                    class='flex-grow-1'
                    style='min-width: 0;'
                >
                    <div
                        class='fw-bold text-truncate'
                        v-text='callsign'
                    />
                    <div
                        class='text-secondary small'
                        v-text='$tr("Regulation 52.003, chapter {chapter}", { chapter: entry.chapter })'
                    />
                </div>
            </div>

            <TablerInlineAlert
                v-if='!editable'
                severity='info'
                title='Read only'
                description='This object can only be changed by its author or with write access to its mission.'
            />

            <div v-if='family.length > 1'>
                <div class='form-label'>
                    Type
                </div>
                <div class='d-flex flex-wrap gap-2'>
                    <button
                        v-for='member of family'
                        :key='member.id'
                        type='button'
                        class='btn tactical-choice'
                        :class='{ "btn-primary": member.id === entry.id }'
                        :disabled='!editable'
                        @click='setEntry(member)'
                        v-text='member.label'
                    />
                </div>
            </div>

            <div v-if='has("ech")'>
                <div class='form-label'>
                    Hierarchy sign
                </div>
                <div class='d-flex flex-wrap gap-2'>
                    <button
                        v-for='ech of ECHELONS'
                        :key='ech.code'
                        type='button'
                        class='btn tactical-choice tactical-echelon'
                        :class='{ "btn-primary": draft.ech === ech.code }'
                        :disabled='!editable'
                        :data-testid='`tactical-ech-${ech.code}`'
                        @click='draft.ech = ech.code'
                        v-text='ech.sign'
                    />
                </div>
            </div>

            <TablerInput
                v-if='has("t")'
                v-model='t'
                :label='$tr(entry.tLabel ?? "Name")'
                :disabled='!editable'
                data-testid='tactical-t'
            />

            <TablerInput
                v-if='has("t1")'
                v-model='t1'
                :label='$tr(entry.t1Label ?? "Name")'
                :disabled='!editable'
                data-testid='tactical-t1'
            />

            <TablerInlineAlert
                v-if='classified'
                severity='warning'
                title='Classify the overlay'
                description='Unit numbers or designations on boundaries and areas make the overlay classified (regulation 52.003, p. 28).'
                data-testid='tactical-classified'
            />

            <div v-if='has("aff")'>
                <div class='form-label'>
                    Affiliation
                </div>
                <div class='d-flex flex-wrap gap-2'>
                    <button
                        v-for='aff of AFFILIATION_CHOICES'
                        :key='aff.code'
                        type='button'
                        class='btn tactical-choice d-flex align-items-center gap-2'
                        :class='{ "btn-primary": affiliation === aff.code }'
                        :disabled='!editable'
                        :data-testid='`tactical-aff-${aff.code}`'
                        @click='draft.aff = aff.code'
                    >
                        <span
                            class='tactical-swatch'
                            :style='{ background: AFFILIATION_COLORS[aff.code] }'
                        />
                        <span v-text='aff.label' />
                    </button>
                </div>
            </div>

            <div v-if='has("planned")'>
                <div class='form-label'>
                    Planned or executed
                </div>
                <div class='d-flex flex-wrap gap-2'>
                    <button
                        type='button'
                        class='btn tactical-choice'
                        :class='{ "btn-primary": !draft.planned }'
                        :disabled='!editable'
                        data-testid='tactical-executed'
                        @click='draft.planned = false'
                    >
                        Executed (solid)
                    </button>
                    <button
                        type='button'
                        class='btn tactical-choice'
                        :class='{ "btn-primary": draft.planned }'
                        :disabled='!editable'
                        data-testid='tactical-planned'
                        @click='draft.planned = true'
                    >
                        Planned (dashed)
                    </button>
                </div>
            </div>

            <div v-if='has("width")'>
                <TablerInput
                    v-model='width'
                    type='number'
                    label='Width (m)'
                    placeholder='Automatic'
                    :disabled='!editable'
                    data-testid='tactical-width'
                />
            </div>

            <div v-if='has("side")'>
                <button
                    type='button'
                    class='btn tactical-choice w-100'
                    :disabled='!editable'
                    data-testid='tactical-swap'
                    @click='swapSide'
                >
                    <IconArrowsExchange
                        :size='20'
                        stroke='1.5'
                        class='me-2'
                    />
                    Swap side
                </button>
                <div class='text-secondary small pt-1'>
                    Reverses the drawing direction: arcs and ticks change to the other side.
                </div>
            </div>
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { TablerInput, TablerInlineAlert } from '@tak-ps/vue-tabler';
import { IconArrowsExchange } from '@tabler/icons-vue';
import MenuTemplate from '../util/MenuTemplate.vue';
import TacticalPreview from './TacticalPreview.vue';
import type COT from '../../../base/cot.ts';
import { OriginMode } from '../../../base/cot.ts';
import Subscription from '../../../base/subscription.ts';
import { useMapStore } from '../../../stores/map.ts';
import {
    ECHELONS, tacticalOf, type Affiliation, type TacticalModel,
} from '../../../utils/tactical-graphics/model.ts';
import {
    CATALOG, AFFILIATION_COLORS, entryOf, affiliationOf, callsignOf, type CatalogEntry, type FieldKey,
} from '../../../utils/tactical-graphics/catalog.ts';
import { tacticalProperties } from '../../../utils/tactical-graphics/apply.ts';

const AFFILIATION_CHOICES: Array<{ code: Affiliation; label: string }> = [
    { code: 'f', label: 'Own troops' },
    { code: 'h', label: 'Enemy troops' },
    { code: 'n', label: 'Neutral' },
    { code: 'u', label: 'Unknown' },
];

const route = useRoute();
const mapStore = useMapStore();

const loading = ref(true);
const cot = ref<COT | undefined>();
const editable = ref(false);
const entry = ref<CatalogEntry | undefined>();
const draft = ref<TacticalModel | undefined>();

let lastStored = '';
let persistTimeout: ReturnType<typeof setTimeout> | undefined;

const family = computed<CatalogEntry[]>(() => {
    if (!entry.value?.family) return [];
    return CATALOG.filter((e) => e.family === entry.value?.family);
});

const affiliation = computed<Affiliation | undefined>(() => {
    return entry.value && draft.value ? affiliationOf(entry.value, draft.value) : undefined;
});

const callsign = computed<string>(() => entry.value && draft.value ? callsignOf(entry.value, draft.value) : '');

const classified = computed<boolean>(() => !!entry.value?.unitFields && !!(draft.value?.t || draft.value?.t1));

const t = computed<string>({
    get: () => draft.value?.t ?? '',
    set: (value: string) => { if (draft.value) draft.value.t = value.trim() ? value : undefined; },
});

const t1 = computed<string>({
    get: () => draft.value?.t1 ?? '',
    set: (value: string) => { if (draft.value) draft.value.t1 = value.trim() ? value : undefined; },
});

const width = computed<string>({
    get: () => draft.value?.width ? String(draft.value.width) : '',
    set: (value: string) => {
        if (!draft.value) return;
        const n = Number(value);
        draft.value.width = value !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
    },
});

function has(field: FieldKey): boolean {
    return !!entry.value?.fields.includes(field);
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

function syncFromCot(): void {
    if (!cot.value) return;
    const model = tacticalOf(cot.value.properties);
    if (!model) return;

    const stored = JSON.stringify(model);
    if (stored === lastStored) return;
    lastStored = stored;

    entry.value = entry.value?.sig === model.sig ? entry.value : entryOf(model);
    draft.value = { ...model };
}

watch(() => cot.value?.properties.chsig, () => {
    if (persistTimeout) return;
    syncFromCot();
}, { deep: true });

watch(draft, () => {
    if (!editable.value || !draft.value) return;
    if (JSON.stringify(draft.value) === lastStored) return;

    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(() => {
        persistTimeout = undefined;
        void persist();
    }, 400);
}, { deep: true });

function setEntry(member: CatalogEntry): void {
    if (!draft.value) return;
    entry.value = member;
    draft.value = { ...draft.value, sig: member.sig };
}

async function persist(): Promise<void> {
    if (!cot.value || !entry.value || !draft.value || !editable.value) return;

    const model: TacticalModel = { ...draft.value };
    lastStored = JSON.stringify(model);

    const properties = JSON.parse(JSON.stringify(cot.value.properties)) as COT['properties'];
    Object.assign(properties, tacticalProperties(entry.value, model, properties));

    await cot.value.update({ properties });
}

/** Reverse the drawing direction - arcs, teeth and ticks change side */
async function swapSide(): Promise<void> {
    if (!cot.value || !editable.value) return;

    const geometry = JSON.parse(JSON.stringify(cot.value.geometry));
    if (geometry.type === 'LineString') {
        geometry.coordinates.reverse();
    } else if (geometry.type === 'Polygon') {
        for (const ring of geometry.coordinates) ring.reverse();
    } else {
        return;
    }

    await cot.value.update({ geometry });
}
</script>

<style scoped>
.tactical-choice {
    min-height: 44px;
    min-width: 44px;
}

.tactical-echelon {
    min-width: 56px;
    font-weight: 700;
    letter-spacing: 0.05em;
}

.tactical-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.5);
}
</style>
