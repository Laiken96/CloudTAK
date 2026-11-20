<template>
    <SwissFormationPicker
        v-if='source === "swiss"'
        :action='action'
        @source='setSource($event)'
        @close='emit("close")'
        @place='emit("place", $event)'
    />
    <TablerModal
        v-else
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
            data-testid='signature-picker'
        >
            <SignatureSourceTabs
                class='mb-3'
                model-value='all'
                @update:model-value='setSource($event)'
            />

            <div class='d-flex align-items-center pb-3'>
                <div class='preview rounded d-flex align-items-center justify-content-center flex-shrink-0'>
                    <FeatureIcon
                        :key='previewKey'
                        :size='40'
                        :feature='{ properties: preview }'
                    />
                </div>
                <div
                    class='flex-grow-1 ms-3'
                    style='min-width: 0;'
                >
                    <div
                        class='fw-bold text-truncate'
                        v-text='summary.title'
                    />
                    <div
                        class='text-secondary small text-truncate'
                        v-text='summary.subtitle'
                    />
                </div>
                <FavoriteStar
                    v-if='ready'
                    :properties='preview'
                />
            </div>

            <AppearanceAffiliation
                :model-value='draft.affiliation'
                :context='draftContext'
                @update:model-value='setAffiliation($event)'
                @update:context='setContext($event)'
            />

            <AppearanceTypeSelect
                class='pt-3'
                :model-value='draft.type'
                :affiliation='draft.affiliation'
                @update:model-value='setType($event)'
            />

            <AppearanceMarker
                class='pt-3'
                :marker='draft.marker'
                :icon='draft.icon'
                :color='draft.color'
                :opacity='draft.opacity'
                @update:marker='setMarker($event)'
                @update:icon='draft.icon = $event'
                @update:color='draft.color = $event'
                @update:opacity='draft.opacity = $event'
            />
        </div>

        <div class='modal-footer'>
            <div
                v-if='!ready'
                class='text-secondary small me-auto'
            >
                Choose a type or an icon first.
            </div>
            <button
                v-if='action === "place"'
                type='button'
                class='btn btn-primary'
                data-testid='signature-picker-place'
                :disabled='!ready || busy'
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
                data-testid='signature-picker-add'
                :disabled='!ready || busy'
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
import { ref, computed, watch } from 'vue';
import Type2525 from '@tak-ps/node-cot/2525';
import { TablerModal } from '@tak-ps/vue-tabler';
import { IconStar, IconStars, IconHandClick } from '@tabler/icons-vue';
import FeatureIcon from './FeatureIcon.vue';
import FavoriteStar from './FavoriteStar.vue';
import AppearanceAffiliation from '../Appearance/AppearanceAffiliation.vue';
import AppearanceTypeSelect from '../Appearance/AppearanceTypeSelect.vue';
import AppearanceMarker from '../Appearance/AppearanceMarker.vue';
import SignatureSourceTabs from './SignatureSourceTabs.vue';
import SwissFormationPicker from './SwissFormationPicker.vue';
import {
    preferredSignatureSource,
    setPreferredSignatureSource,
    type SignatureSource,
} from '../../../base/swiss-formation-choice.ts';
import COT, { renderedIconImage } from '../../../base/cot.ts';
import FavoriteSignatures from '../../../base/favorite-signatures.ts';
import { signatureLabel } from '../../../base/signature-label.ts';
import { iconsetIconLabel } from '../Appearance/icon-label.ts';
import { signatureFrom, type Signature } from '../../../utils/signature.ts';
import {
    applyAppearance,
    describeAppearance,
    withAffiliation,
    withContext,
    contextOf,
    carryFrame,
    isIconsetIcon,
} from '../../../utils/appearance.ts';
import type { AppearanceDraft, Marker } from '../../../utils/appearance.ts';
import type { Feature } from '../../../types.ts';

/**
 * Full signature selection - every 2525 symbol and every Iconset icon - built
 * from the same parts as the Appearance editor of an object
 */
withDefaults(defineProps<{
    /** place: arm the signature for placement, favorite: add it to the favourites */
    action?: 'place' | 'favorite';
}>(), {
    action: 'place',
});

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'place', value: { signature: Signature; label: string }): void;
}>();

const busy = ref(false);

/** Swiss formations or every symbol and icon - the last used one opens again */
const source = ref<SignatureSource>(preferredSignatureSource());

function setSource(next: SignatureSource): void {
    source.value = next;
    setPreferredSignatureSource(next);
}

const draft = ref<AppearanceDraft>({
    type: undefined,
    affiliation: 'f',
    marker: 'symbol',
    icon: undefined,
    color: '#FFFFFF',
    opacity: 1,
});

const typeName = ref<string | undefined>();
const iconName = ref<string | undefined>();

const draftContext = computed<string | undefined>(() => {
    const type = draft.value.type;
    return type && Type2525.isNumericSIDCConvertable(type) ? contextOf(type) : undefined;
});

const preview = computed<Feature['properties']>(() => {
    return applyAppearance({ 'marker-opacity': 1 } as Feature['properties'], draft.value);
});

const previewKey = computed<string>(() => renderedIconImage(preview.value) || String(preview.value.type || ''));

const summary = computed(() => describeAppearance(preview.value, typeName.value, iconName.value));

/** A symbol needs a type and a custom icon an icon - a spot is always complete */
const ready = computed<boolean>(() => {
    if (draft.value.marker === 'symbol') return !!draft.value.type;
    if (draft.value.marker === 'icon') return isIconsetIcon(draft.value.icon);
    return true;
});

watch(() => preview.value.type, async (type) => {
    typeName.value = undefined;
    if (!type) return;

    const resolved = await COT.resolveType(String(type));
    if (type === preview.value.type) typeName.value = resolved.name;
});

watch(() => preview.value.icon, async (icon) => {
    iconName.value = undefined;
    if (!isIconsetIcon(icon as string | undefined)) return;

    const label = await iconsetIconLabel(icon as string);
    if (icon === preview.value.icon) iconName.value = label;
});

function setAffiliation(code: string): void {
    draft.value.affiliation = code;
    if (draft.value.type) draft.value.type = withAffiliation(draft.value.type, code);
}

function setContext(context: string): void {
    if (!draft.value.type) return;
    draft.value.type = withContext(draft.value.type, context);
}

function setMarker(marker: Marker): void {
    draft.value.marker = marker;
    if (marker !== 'icon') draft.value.icon = undefined;
}

function setType(type: string): void {
    draft.value.type = carryFrame(draft.value.type, type);
    if (draft.value.marker === 'spot') draft.value.marker = 'symbol';
}

async function chosen(): Promise<{ signature: Signature; label: string }> {
    const signature = signatureFrom(preview.value);
    return { signature, label: await signatureLabel(signature) };
}

async function place(): Promise<void> {
    if (!ready.value || busy.value) return;
    busy.value = true;

    try {
        emit('place', await chosen());
        emit('close');
    } finally {
        busy.value = false;
    }
}

async function addFavorite(): Promise<void> {
    if (!ready.value || busy.value) return;
    busy.value = true;

    try {
        const { signature, label } = await chosen();
        await FavoriteSignatures.add(signature, label);
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
</style>
