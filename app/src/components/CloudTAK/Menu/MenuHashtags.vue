<template>
    <MenuTemplate
        name='Hashtags'
    >
        <template #buttons>
            <TablerRefreshButton
                :loading='loading'
                @click='refresh(true)'
            />
        </template>
        <template #default>
            <div class='d-flex flex-column gap-3 py-2'>
                <section class='d-flex flex-column gap-2'>
                    <div class='d-flex align-items-center gap-2'>
                        <IconPinned
                            :size='20'
                            stroke='1'
                        />
                        <span class='subheader user-select-none'>Sticky Hashtags</span>
                    </div>
                    <div class='text-secondary small'>
                        Enabled tags are added to the remarks of every feature you draw or place on this device. Imported and received features are never tagged.
                    </div>

                    <div
                        v-for='sticky of stickyTags'
                        :key='sticky.tag'
                        class='d-flex align-items-center gap-2'
                    >
                        <TablerToggle
                            :model-value='sticky.enabled'
                            @update:model-value='toggleSticky(sticky.tag, $event)'
                        />
                        <span
                            class='fw-bold flex-grow-1 text-truncate'
                            v-text='sticky.tag'
                        />
                        <TablerIconButton
                            :title='`Remove ${sticky.tag}`'
                            @click='removeSticky(sticky.tag)'
                        >
                            <IconX
                                :size='20'
                                stroke='1'
                            />
                        </TablerIconButton>
                    </div>

                    <form
                        class='d-flex align-items-start gap-2'
                        @submit.prevent='addSticky'
                    >
                        <div class='flex-grow-1'>
                            <TablerInput
                                id='hashtags-sticky-new'
                                v-model='newSticky'
                                placeholder='New sticky tag, e.g. #FURY'
                            />
                        </div>
                        <TablerIconButton
                            title='Add Sticky Hashtag'
                            :disabled='!validateHashtag(newSticky)'
                            @click='addSticky'
                        >
                            <IconPlus
                                :size='24'
                                stroke='1'
                            />
                        </TablerIconButton>
                    </form>
                </section>

                <section class='d-flex flex-column gap-2'>
                    <SearchSortFilter v-model='filter' />

                    <div
                        v-if='hiddenCount'
                        class='d-flex align-items-center gap-2'
                    >
                        <IconEyeOff
                            :size='20'
                            stroke='1'
                            class='flex-shrink-0'
                        />
                        <span
                            class='flex-grow-1 small'
                            v-text='hiddenSummary'
                        />
                        <button
                            type='button'
                            class='btn btn-outline-secondary flex-shrink-0'
                            @click='showAll'
                        >
                            Show All
                        </button>
                    </div>

                    <TablerLoading
                        v-if='loading'
                        desc='Loading Hashtags'
                    />
                    <TablerNone
                        v-else-if='visible.length === 0'
                        :create='false'
                        :label='listed.length ? "No matching Hashtags" : "No Hashtags in remarks"'
                    />
                    <template v-else>
                        <div
                            v-for='entry of visible'
                            :key='entry.key'
                            :ref='(el) => setRow(entry.key, el)'
                            class='d-flex flex-column'
                        >
                            <StandardItem
                                class='d-flex align-items-center gap-3 p-2'
                                :class='{
                                    "hashtags-row--focus": focusKey === entry.key,
                                    "hashtags-row--hidden": isHidden(entry.tag)
                                }'
                                @click='toggleOpen(entry.key)'
                            >
                                <div
                                    class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                                    style='width: 2.5rem; height: 2.5rem; min-width: 2.5rem;'
                                >
                                    <IconHash
                                        :size='22'
                                        stroke='1'
                                    />
                                </div>

                                <div
                                    class='d-flex flex-column'
                                    style='min-width: 0;'
                                >
                                    <div
                                        class='fw-bold text-truncate'
                                        v-text='entry.tag'
                                    />
                                    <div
                                        class='text-secondary small'
                                        v-text='entry.features.length === 1 ? "1 Feature" : `${entry.features.length} Features`'
                                    />
                                    <div
                                        v-if='isHidden(entry.tag)'
                                        class='hashtags-hidden-label small'
                                    >
                                        Hidden on the map
                                    </div>
                                </div>

                                <div class='d-flex btn-list ms-auto'>
                                    <TablerIconButton
                                        :title='visibilityTitle(entry.tag)'
                                        @click.stop='toggleHidden(entry.tag)'
                                    >
                                        <IconEyeOff
                                            v-if='isHidden(entry.tag)'
                                            :size='20'
                                            stroke='1'
                                        />
                                        <IconEye
                                            v-else
                                            :size='20'
                                            stroke='1'
                                        />
                                    </TablerIconButton>
                                    <TablerIconButton
                                        v-if='!isSticky(entry.tag)'
                                        :title='`Use ${entry.tag} as Sticky Hashtag`'
                                        @click.stop='addSticky(entry.tag)'
                                    >
                                        <IconPin
                                            :size='20'
                                            stroke='1'
                                        />
                                    </TablerIconButton>
                                    <TablerIconButton
                                        :title='`Select all ${entry.tag} Features`'
                                        @click.stop='selectAll(entry)'
                                    >
                                        <IconListCheck
                                            :size='20'
                                            stroke='1'
                                        />
                                    </TablerIconButton>
                                    <IconChevronDown
                                        v-if='open.has(entry.key)'
                                        :size='20'
                                        stroke='1'
                                    />
                                    <IconChevronRight
                                        v-else
                                        :size='20'
                                        stroke='1'
                                    />
                                </div>
                            </StandardItem>

                            <div
                                v-if='open.has(entry.key)'
                                class='d-flex flex-column gap-1 ps-4 pt-1'
                            >
                                <Feature
                                    v-for='feat of entry.features'
                                    :key='feat.id'
                                    :feature='feat'
                                    :title='featureTitle(feat)'
                                    :detail='featureDetail(feat)'
                                    :info-button='true'
                                    :delete-button='false'
                                />
                            </div>
                        </div>
                    </template>
                </section>
            </div>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useRoute } from 'vue-router';
import MenuTemplate from '../util/MenuTemplate.vue';
import SearchSortFilter from '../util/SearchSortFilter.vue';
import StandardItem from '../util/StandardItem.vue';
import Feature from '../util/FeatureRow.vue';
import StickyHashtags, { type StickyHashtag } from '../../../base/sticky-hashtags.ts';
import HiddenHashtags from '../../../stores/modules/hidden-hashtags.ts';
import { tr } from '../../../i18n/index.ts';
import { hashtagKey, stripHashtags, validateHashtag } from '../../../utils/hashtags.ts';
import type { WorkerMessage } from '../../../utils/events.ts';
import { WorkerMessageType } from '../../../utils/events.ts';
import type { Feature as FeatureType } from '../../../types.ts';
import { useMapStore } from '../../../stores/map.ts';
import {
    TablerNone,
    TablerInput,
    TablerToggle,
    TablerLoading,
    TablerIconButton,
    TablerRefreshButton,
} from '@tak-ps/vue-tabler';
import {
    IconX,
    IconEye,
    IconEyeOff,
    IconPin,
    IconHash,
    IconPlus,
    IconPinned,
    IconListCheck,
    IconChevronDown,
    IconChevronRight,
} from '@tabler/icons-vue';

interface HashtagEntry {
    tag: string;
    key: string;
    features: FeatureType[];
}

/** Remote CoT updates do not notify the UI, so the list also refreshes on a timer while open */
const REFRESH_INTERVAL_MS = 10_000;

const route = useRoute();
const mapStore = useMapStore();

const loading = ref(true);
const entries = ref<HashtagEntry[]>([]);
const filter = ref('');
const open = ref<Set<string>>(new Set());
const focusKey = ref<string | undefined>();
const stickyTags = ref<StickyHashtag[]>([]);
const newSticky = ref('');

const rows = new Map<string, Element>();

/**
 * The tags in remarks plus hidden tags no loaded Feature carries right now -
 * they stay hidden for Features that get them later and must stay listed to be shown again
 */
const listed = computed<HashtagEntry[]>(() => {
    const keys = new Set(entries.value.map((entry) => entry.key));

    const absent = HiddenHashtags.state.tags
        .filter((tag) => !keys.has(hashtagKey(tag)))
        .map((tag) => ({ tag, key: hashtagKey(tag), features: [] }));

    if (!absent.length) return entries.value;

    return [...entries.value, ...absent].sort((a, b) => a.key.localeCompare(b.key));
});

const visible = computed(() => {
    const needle = filter.value.trim().toLowerCase().replace(/^#/, '');
    if (!needle) return listed.value;
    return listed.value.filter((entry) => entry.key.includes(needle));
});

const hiddenCount = computed(() => HiddenHashtags.state.tags.length);

const hiddenSummary = computed(() => hiddenCount.value === 1
    ? tr('1 hashtag hidden on the map')
    : tr('{count} hashtags hidden on the map', { count: hiddenCount.value }));

const channel = new BroadcastChannel('cloudtak');
let pending: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

channel.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    if (
        msg.type === WorkerMessageType.Feature_Archived_Added
        || msg.type === WorkerMessageType.Feature_Archived_Removed
        || msg.type === WorkerMessageType.Feature_Render
    ) {
        // Many features change at once on an import or bulk delete - refresh once
        clearTimeout(pending);
        pending = setTimeout(() => { void refresh(); }, 250);
    }
};

onMounted(async () => {
    // Independent of the hashtag list so neither waits for the other
    void loadSticky();
    await refresh(true);
    focusFromRoute();
    timer = setInterval(() => { void refresh(); }, REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => {
    clearTimeout(pending);
    clearInterval(timer);
    channel.close();
});

watch(() => route.query.tag, () => focusFromRoute());

function setRow(key: string, el: Element | ComponentPublicInstance | null): void {
    if (el instanceof Element) rows.set(key, el);
    else rows.delete(key);
}

/** `/menu/hashtags?tag=%23FURY` opens and scrolls to that tag, eg. from a feature's remarks */
async function focusFromRoute(): Promise<void> {
    const tag = route.query.tag;
    if (typeof tag !== 'string' || !tag) return;

    const key = hashtagKey(validateHashtag(tag));
    focusKey.value = key;
    open.value.add(key);

    await nextTick();
    rows.get(key)?.scrollIntoView?.({ block: 'nearest' });
}

async function refresh(load = false): Promise<void> {
    if (load) loading.value = true;

    try {
        entries.value = await mapStore.worker.db.hashtags({ mission: true });
    } catch (err) {
        console.error('Failed to load hashtags', err);
    } finally {
        loading.value = false;
    }
}

function toggleOpen(key: string): void {
    if (open.value.has(key)) open.value.delete(key);
    else open.value.add(key);
}

/**
 * Put every Feature of a tag into the map selection - the selection panel then
 * offers Delete, Share, Data Package and Move to Data Sync, as ATAK's Hashtag
 * Manager does with its multi-select
 */
async function selectAll(entry: HashtagEntry): Promise<void> {
    for (const feat of entry.features) {
        const cot = await mapStore.worker.db.get(feat.id, { mission: true });
        if (cot) mapStore.selected.set(cot.id, cot);
    }
}

/** A callsign that names something - not the "." the Bat gives units */
function hasCallsign(feat: FeatureType): boolean {
    const callsign = feat.properties.callsign;
    return typeof callsign === 'string' && /[\p{L}\p{N}]/u.test(callsign);
}

/** Units without a callsign are listed by the designation in their remarks */
function featureTitle(feat: FeatureType): string {
    return hasCallsign(feat) ? '' : stripHashtags(feat.properties.remarks);
}

function featureDetail(feat: FeatureType): string {
    return hasCallsign(feat) ? stripHashtags(feat.properties.remarks) : '';
}

async function loadSticky(): Promise<void> {
    try {
        stickyTags.value = await StickyHashtags.list();
    } catch (err) {
        console.error('Failed to load sticky hashtags', err);
    }
}

function isSticky(tag: string): boolean {
    const key = hashtagKey(tag);
    return stickyTags.value.some((sticky) => hashtagKey(sticky.tag) === key);
}

async function addSticky(tag?: string | Event): Promise<void> {
    const value = typeof tag === 'string' ? tag : newSticky.value;
    if (!validateHashtag(value)) return;

    stickyTags.value = await StickyHashtags.add(value);
    if (typeof tag !== 'string') newSticky.value = '';
}

async function toggleSticky(tag: string, enabled: boolean): Promise<void> {
    stickyTags.value = await StickyHashtags.setEnabled(tag, enabled);
}

async function removeSticky(tag: string): Promise<void> {
    stickyTags.value = await StickyHashtags.remove(tag);
}

function isHidden(tag: string): boolean {
    return HiddenHashtags.isHidden(tag);
}

function visibilityTitle(tag: string): string {
    return isHidden(tag)
        ? tr('Show {tag} on the map', { tag })
        : tr('Hide {tag} on the map', { tag });
}

/** ATAK's per-tag visibility: every Feature carrying the tag leaves the map of this device */
async function toggleHidden(tag: string): Promise<void> {
    try {
        await HiddenHashtags.toggle(tag);
    } catch (err) {
        console.error('Failed to change hashtag visibility', err);
    }
}

async function showAll(): Promise<void> {
    try {
        await HiddenHashtags.showAll();
    } catch (err) {
        console.error('Failed to show all hashtags', err);
    }
}
</script>

<style scoped>
.hashtags-row--focus {
    outline: 2px solid var(--tblr-primary);
    outline-offset: -2px;
}

.hashtags-row--hidden .fw-bold {
    opacity: 0.6;
}

.hashtags-hidden-label {
    color: var(--tblr-warning);
}
</style>
