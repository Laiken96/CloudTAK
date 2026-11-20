<template>
    <TablerModal
        size='lg'
        :dismissable='true'
        @close='emit("close")'
    >
        <div class='modal-status bg-blue' />
        <button
            type='button'
            class='btn-close'
            aria-label='Close'
            @click='emit("close")'
        />
        <div class='modal-header text-body'>
            <div class='d-flex align-items-center'>
                <IconStars
                    :size='28'
                    stroke='1'
                />
                <span class='mx-2'>Choose Signature</span>
            </div>
        </div>

        <div
            class='modal-body text-body'
            data-testid='swiss-formation-picker'
        >
            <SignatureSourceTabs
                class='mb-3'
                model-value='swiss'
                @update:model-value='emit("source", $event)'
            />

            <div class='d-flex align-items-center pb-3'>
                <div class='preview rounded d-flex align-items-center justify-content-center flex-shrink-0'>
                    <FeatureIcon
                        v-if='sidc'
                        :key='sidc'
                        :size='40'
                        :feature='{ properties: { type: sidc } }'
                    />
                    <IconShieldHalfFilled
                        v-else
                        :size='32'
                        stroke='1'
                        class='text-secondary'
                    />
                </div>
                <div
                    class='flex-grow-1 ms-3'
                    style='min-width: 0;'
                >
                    <div
                        class='fw-bold text-truncate'
                        data-testid='swiss-formation-title'
                        v-text='formation ? label : $tr("No formation chosen")'
                    />
                    <div
                        class='text-secondary small text-truncate'
                        v-text='subtitle'
                    />
                </div>
                <TablerIconButton
                    v-if='sidc'
                    :title='favorite ? $tr("Remove from favorite signatures") : $tr("Add to favorite signatures")'
                    :disabled='busy'
                    :aria-pressed='favorite'
                    data-testid='swiss-formation-star'
                    @click='toggleFavorite'
                >
                    <IconStarFilled
                        v-if='favorite'
                        :size='32'
                        class='favorite-on'
                    />
                    <IconStar
                        v-else
                        :size='32'
                        stroke='1'
                    />
                </TablerIconButton>
            </div>

            <label class='subheader user-select-none d-block pb-1'>Formation</label>

            <button
                v-if='formation && !browsing'
                type='button'
                class='formation-row formation-row--selected w-100 d-flex align-items-center gap-2 rounded px-2'
                data-testid='swiss-formation-selected'
                @click='browse'
            >
                <img
                    :src='listIcon(formation)'
                    alt=''
                    width='36'
                    height='36'
                    class='formation-icon flex-shrink-0'
                >
                <span
                    class='flex-grow-1 text-start text-truncate'
                    v-text='formation.name'
                />
                <span class='text-primary flex-shrink-0'>Change</span>
            </button>

            <template v-else>
                <input
                    v-model='filter'
                    type='search'
                    class='form-control'
                    enterkeyhint='search'
                    autocomplete='off'
                    placeholder='Search formation, e.g. Panzer'
                    :aria-label='$tr("Search formation, e.g. Panzer")'
                    data-testid='swiss-formation-search'
                >

                <div
                    class='formation-list mt-2 rounded'
                    data-testid='swiss-formation-list'
                >
                    <template
                        v-for='group of groups'
                        :key='group.id'
                    >
                        <div
                            class='formation-group px-2 py-1 small text-secondary text-uppercase'
                            v-text='group.name'
                        />
                        <button
                            v-for='item of group.formations'
                            :key='item.id'
                            type='button'
                            class='formation-row w-100 d-flex align-items-center gap-2 px-2'
                            :class='{ active: item.id === draft.formation }'
                            :aria-pressed='item.id === draft.formation'
                            data-testid='swiss-formation-item'
                            @click='pick(item)'
                        >
                            <img
                                :src='listIcon(item)'
                                alt=''
                                width='36'
                                height='36'
                                class='formation-icon flex-shrink-0'
                            >
                            <span
                                class='flex-grow-1 text-start'
                                style='min-width: 0;'
                            >
                                <span
                                    class='d-block'
                                    v-text='item.name'
                                />
                                <span
                                    v-if='item.abbr || item.match === "nearest"'
                                    class='d-block small text-secondary text-truncate'
                                    v-text='itemHint(item)'
                                />
                            </span>
                        </button>
                    </template>

                    <div
                        v-if='!results.length'
                        class='text-secondary small text-center py-4'
                        data-testid='swiss-formation-empty'
                    >
                        No formation found
                    </div>
                </div>
            </template>

            <label class='subheader user-select-none d-block pt-3 pb-1'>Echelon</label>
            <div
                class='d-flex flex-wrap gap-1'
                role='radiogroup'
                data-testid='swiss-echelons'
            >
                <button
                    type='button'
                    role='radio'
                    class='chip btn btn-sm'
                    :class='{ active: draft.echelon === NO_ECHELON }'
                    :aria-checked='draft.echelon === NO_ECHELON'
                    :data-testid='`swiss-echelon-${NO_ECHELON}`'
                    @click='setEchelon(NO_ECHELON)'
                >
                    None
                </button>
                <button
                    v-for='level of shownEchelons'
                    :key='level.code'
                    type='button'
                    role='radio'
                    class='chip btn btn-sm'
                    :class='{ active: draft.echelon === level.code }'
                    :aria-checked='draft.echelon === level.code'
                    :data-testid='`swiss-echelon-${level.code}`'
                    @click='setEchelon(level.code)'
                >
                    <span
                        class='chip-sign'
                        v-text='level.sign'
                    />
                    <span v-text='levelName(level)' />
                </button>
                <button
                    v-if='!allEchelons'
                    type='button'
                    class='chip btn btn-sm'
                    data-testid='swiss-echelon-more'
                    @click='allEchelons = true'
                >
                    More
                </button>
            </div>

            <div
                v-if='terms.length > 1'
                class='d-flex flex-wrap gap-1 pt-2'
                role='radiogroup'
                data-testid='swiss-terms'
            >
                <button
                    v-for='term of terms'
                    :key='term'
                    type='button'
                    role='radio'
                    class='chip chip--term btn btn-sm'
                    :class='{ active: currentTerm === term }'
                    :aria-checked='currentTerm === term'
                    @click='draft.term = term'
                    v-text='term'
                />
            </div>

            <div class='d-flex flex-wrap gap-1 pt-2'>
                <button
                    type='button'
                    class='chip btn btn-sm'
                    :class='{ active: draft.headquarters }'
                    :aria-pressed='draft.headquarters'
                    data-testid='swiss-formation-staff'
                    @click='draft.headquarters = !draft.headquarters'
                >
                    <IconCheck
                        v-if='draft.headquarters'
                        :size='14'
                        stroke='2.5'
                    />
                    Staff
                </button>
                <button
                    type='button'
                    class='chip btn btn-sm'
                    :class='{ active: draft.taskForce }'
                    :aria-pressed='draft.taskForce'
                    data-testid='swiss-formation-task-force'
                    @click='draft.taskForce = !draft.taskForce'
                >
                    <IconCheck
                        v-if='draft.taskForce'
                        :size='14'
                        stroke='2.5'
                    />
                    Task force
                </button>
            </div>

            <AppearanceAffiliation
                class='pt-3'
                :model-value='draft.affiliation'
                :context='draft.context'
                @update:model-value='draft.affiliation = $event'
                @update:context='draft.context = $event'
            />

            <label
                class='subheader user-select-none d-block pt-3 pb-1'
                for='swiss-formation-label'
            >Designation</label>
            <input
                id='swiss-formation-label'
                v-model='customLabel'
                type='text'
                class='form-control'
                autocomplete='off'
                :placeholder='autoLabel || $tr("Name on the map")'
                data-testid='swiss-formation-label'
            >
        </div>

        <div class='modal-footer'>
            <div
                v-if='!formation'
                class='text-secondary small me-auto'
            >
                Choose a formation first.
            </div>
            <button
                v-if='action === "place"'
                type='button'
                class='btn btn-primary'
                data-testid='swiss-formation-place'
                :disabled='!sidc || busy'
                @click='place'
            >
                <IconHandClick
                    :size='20'
                    stroke='1.5'
                    class='me-1'
                />
                Place on Map
            </button>
            <button
                v-else
                type='button'
                class='btn btn-primary'
                data-testid='swiss-formation-add'
                :disabled='!sidc || busy'
                @click='addFavorite'
            >
                <IconStar
                    :size='20'
                    stroke='1.5'
                    class='me-1'
                />
                Add to Favorites
            </button>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted, watch } from 'vue';
import { TablerModal, TablerIconButton } from '@tak-ps/vue-tabler';
import {
    IconStar,
    IconStars,
    IconCheck,
    IconHandClick,
    IconStarFilled,
    IconShieldHalfFilled,
} from '@tabler/icons-vue';
import FeatureIcon from './FeatureIcon.vue';
import SignatureSourceTabs from './SignatureSourceTabs.vue';
import AppearanceAffiliation from '../Appearance/AppearanceAffiliation.vue';
import FavoriteSignatures from '../../../base/favorite-signatures.ts';
import {
    lastSwissDraft,
    rememberSwissDraft,
    setPreferredSignatureSource,
    type SignatureSource,
    type SwissFormationDraft,
} from '../../../base/swiss-formation-choice.ts';
import {
    NO_ECHELON,
    SWISS_ECHELONS,
    defaultTerm,
    groupSwissFormations,
    searchSwissFormations,
    swissEchelon,
    swissFormation,
    swissFormationLabel,
    swissFormationSidc,
    type SwissEchelon,
    type SwissFormation,
} from '../../../utils/swiss-formations.ts';
import { affiliation as affiliationOption } from '../../../utils/appearance.ts';
import { symbolDataURL } from '../../../utils/milsymbol.ts';
import { tr } from '../../../i18n/index.ts';
import type { Signature } from '../../../utils/signature.ts';

/**
 * Swiss formation signatures (Reglement 52.003, chapter 2.2) as 2525
 * symbols: pick a formation by its Swiss name, the echelon and the
 * affiliation. Opened from the signature picker, which it replaces while
 * "Swiss Formation" is chosen.
 */
withDefaults(defineProps<{
    /** place: arm the signature for placement, favorite: add it to the favourites */
    action?: 'place' | 'favorite';
}>(), {
    action: 'place',
});

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'source', source: SignatureSource): void;
    (e: 'place', value: { signature: Signature; label: string }): void;
}>();

/** Echelons above division are rare - behind More unless chosen */
const COMMON_ECHELONS = SWISS_ECHELONS.filter((level) => Number(level.code) <= 21);

const draft = ref<SwissFormationDraft>({ ...lastSwissDraft });
const filter = ref('');
const browsing = ref(!draft.value.formation);
const allEchelons = ref(!COMMON_ECHELONS.some((level) => level.code === draft.value.echelon) && draft.value.echelon !== NO_ECHELON);
const customLabel = ref('');
const busy = ref(false);

const formation = computed<SwissFormation | undefined>(() => swissFormation(draft.value.formation));

const results = computed<SwissFormation[]>(() => searchSwissFormations(filter.value));

const groups = computed(() => {
    // A search lists the hits by relevance under one heading
    if (filter.value.trim()) return [{ id: 'results', name: tr('Results'), formations: results.value }].filter((group) => group.formations.length);
    return groupSwissFormations(results.value);
});

const shownEchelons = computed<SwissEchelon[]>(() => allEchelons.value ? SWISS_ECHELONS : COMMON_ECHELONS);

const terms = computed<string[]>(() => swissEchelon(draft.value.echelon)?.terms ?? []);

const currentTerm = computed<string | undefined>(() => {
    if (!terms.value.length) return undefined;
    if (draft.value.term && terms.value.includes(draft.value.term)) return draft.value.term;
    return defaultTerm(formation.value, draft.value.echelon);
});

const choice = computed(() => ({
    affiliation: draft.value.affiliation,
    context: draft.value.context,
    echelon: draft.value.echelon,
    term: currentTerm.value,
    headquarters: draft.value.headquarters,
    taskForce: draft.value.taskForce,
}));

const sidc = computed<string | undefined>(() => formation.value ? swissFormationSidc(formation.value, choice.value) : undefined);

const autoLabel = computed<string>(() => formation.value ? swissFormationLabel(formation.value, choice.value) : '');

const label = computed<string>(() => customLabel.value.trim() || autoLabel.value);

const subtitle = computed<string>(() => {
    if (!formation.value) return tr('Search by Swiss name, then choose echelon and affiliation');

    return [
        formation.value.name,
        affiliationOption(draft.value.affiliation)?.label,
        formation.value.match === 'nearest' ? tr('Nearest 2525 symbol') : undefined,
    ].filter(Boolean).join(' · ');
});

const favorite = computed<boolean>(() => !!sidc.value && FavoriteSignatures.has({ type: sidc.value }));

onMounted(async () => {
    setPreferredSignatureSource('swiss');
    await FavoriteSignatures.load();
});

// Kept for the next time the picker opens on this page
watch(draft, (value) => rememberSwissDraft(value), { deep: true });

function listIcon(item: SwissFormation): string {
    return symbolDataURL(`2525E:${swissFormationSidc(item, { affiliation: draft.value.affiliation })}`, 24);
}

function itemHint(item: SwissFormation): string {
    return [item.abbr, item.match === 'nearest' ? tr('Nearest 2525 symbol') : undefined].filter(Boolean).join(' · ');
}

function levelName(level: SwissEchelon): string {
    return defaultTerm(formation.value, level.code) ?? level.terms[0];
}

function browse(): void {
    browsing.value = true;
}

function pick(item: SwissFormation): void {
    draft.value.formation = item.id;
    // A preferred term (Batterie for artillery) applies to the new formation
    draft.value.term = undefined;
    // A designation typed for the previous formation no longer fits
    customLabel.value = '';
    browsing.value = false;
    filter.value = '';
}

function setEchelon(code: string): void {
    draft.value.echelon = code;
    draft.value.term = undefined;
}

function chosen(): { signature: Signature; label: string } | undefined {
    if (!sidc.value) return undefined;
    return { signature: { type: sidc.value }, label: label.value };
}

async function toggleFavorite(): Promise<void> {
    const current = chosen();
    if (!current || busy.value) return;

    busy.value = true;
    try {
        await FavoriteSignatures.toggle(current.signature, current.label);
    } catch (err) {
        console.error('Failed to update favourite signatures', err);
    } finally {
        busy.value = false;
    }
}

function place(): void {
    const current = chosen();
    if (!current || busy.value) return;

    emit('place', current);
    emit('close');
}

async function addFavorite(): Promise<void> {
    const current = chosen();
    if (!current || busy.value) return;

    busy.value = true;
    try {
        await FavoriteSignatures.add(current.signature, current.label);
        emit('close');
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.preview {
    width: 64px;
    height: 64px;
    background: var(--tblr-bg-surface-secondary, rgba(128, 128, 128, 0.12));
}

.formation-list {
    max-height: 40vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--tblr-border-color-translucent);
}

.formation-group {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--tblr-bg-surface-secondary, var(--tblr-bg-surface));
    letter-spacing: 0.04em;
}

.formation-row {
    min-height: 48px;
    border: 0;
    border-bottom: 1px solid var(--tblr-border-color-translucent);
    background: transparent;
    color: inherit;
}

.formation-row.active {
    background: color-mix(in srgb, var(--tblr-primary) 14%, transparent);
}

.formation-row--selected {
    border: 1px solid var(--tblr-border-color-translucent);
    background: var(--tblr-bg-surface-secondary, rgba(128, 128, 128, 0.12));
}

.formation-icon {
    object-fit: contain;
}

.chip {
    min-height: 40px;
    gap: 0.35rem;
    border: 1px solid var(--tblr-border-color);
    background: transparent;
    color: var(--tblr-body-color);
}

.chip.active {
    border-color: var(--tblr-primary);
    background: color-mix(in srgb, var(--tblr-primary) 16%, transparent);
    font-weight: 500;
}

.chip-sign {
    font-weight: 700;
    letter-spacing: -0.05em;
    min-width: 1.2em;
    text-align: center;
}

.favorite-on {
    color: var(--tblr-yellow, #f59f00);
}
</style>
