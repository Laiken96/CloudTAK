<template>
    <div
        class='favorites-bar-wrap position-absolute d-flex flex-column align-items-start'
        data-testid='favorites-bar-wrap'
    >
        <!-- Placement in progress: what is placed, where it goes, undo and done -->
        <div
            v-if='armed || error'
            class='favorites-bar__status cloudtak-panel d-flex align-items-center gap-2 px-2 py-1'
            data-testid='favorites-bar-status'
            role='status'
        >
            <template v-if='error'>
                <IconAlertTriangle
                    :size='24'
                    stroke='1.5'
                    class='text-danger flex-shrink-0'
                />
                <div
                    class='flex-grow-1 small text-danger favorites-bar__text'
                    v-text='error'
                />
                <TablerIconButton
                    title='Dismiss'
                    @click='error = undefined'
                >
                    <IconX
                        :size='24'
                        stroke='1.5'
                    />
                </TablerIconButton>
            </template>
            <template v-else-if='armed'>
                <FeatureIcon
                    :key='armedKey'
                    :size='32'
                    :feature='{ properties: armedProperties }'
                />
                <div class='flex-grow-1 favorites-bar__text'>
                    <div
                        class='fw-bold text-truncate'
                        v-text='armed.label'
                    />
                    <div
                        class='small text-secondary favorites-bar__hint'
                        data-testid='favorites-bar-hint'
                        v-text='hint'
                    />
                </div>
                <button
                    v-if='placed'
                    type='button'
                    class='btn btn-outline-secondary favorites-bar__action'
                    title='Undo'
                    data-testid='favorites-bar-undo'
                    :disabled='busy'
                    @click='undo'
                >
                    <IconArrowBackUp
                        :size='20'
                        stroke='1.5'
                    />
                    <span class='d-none d-sm-inline ms-1'>Undo</span>
                </button>
                <button
                    type='button'
                    class='btn btn-primary favorites-bar__action'
                    data-testid='favorites-bar-done'
                    @click='disarmSignature()'
                >
                    Done
                </button>
            </template>
        </div>

        <div
            class='favorites-bar cloudtak-panel d-flex align-items-center gap-1 px-1'
            data-testid='favorites-bar'
        >
            <button
                type='button'
                class='favorites-bar__button flex-shrink-0'
                :title='collapsed ? "Show Favorite Signatures" : "Hide Favorite Signatures"'
                :aria-expanded='!collapsed'
                data-testid='favorites-bar-toggle'
                @click='toggleCollapsed'
            >
                <IconStarFilled
                    v-if='!collapsed'
                    :size='28'
                    class='favorites-bar__star'
                />
                <IconStar
                    v-else
                    :size='28'
                    stroke='1.5'
                />
            </button>

            <template v-if='!collapsed'>
                <div
                    class='favorites-bar__list d-flex align-items-center gap-1'
                    data-testid='favorites-bar-list'
                >
                    <button
                        v-for='fav of items'
                        :key='fav.id'
                        type='button'
                        class='favorites-bar__button flex-shrink-0'
                        :class='{ "favorites-bar__button--armed": armed && armedId === fav.id }'
                        :title='fav.label'
                        :aria-label='fav.label'
                        :aria-pressed='!!armed && armedId === fav.id'
                        data-testid='favorites-bar-item'
                        @click='select(fav)'
                    >
                        <FeatureIcon
                            :size='36'
                            :feature='{ properties: signatureProperties(signatureOf(fav)) }'
                        />
                    </button>
                    <span
                        v-if='loaded && !items.length'
                        class='small text-secondary px-2 text-nowrap'
                        data-testid='favorites-bar-empty'
                    >No favorites yet</span>
                </div>

                <button
                    type='button'
                    class='favorites-bar__button flex-shrink-0'
                    title='More Signatures'
                    data-testid='favorites-bar-more'
                    @click='picker = true'
                >
                    <IconPlus
                        :size='28'
                        stroke='1.5'
                    />
                </button>
                <button
                    type='button'
                    class='favorites-bar__button flex-shrink-0'
                    title='Manage Favorite Signatures'
                    data-testid='favorites-bar-manage'
                    @click='router.push("/menu/signatures")'
                >
                    <IconAdjustments
                        :size='28'
                        stroke='1.5'
                    />
                </button>
            </template>
        </div>

        <SignaturePicker
            v-if='picker'
            action='place'
            @close='picker = false'
            @place='arm($event.signature, $event.label)'
        />
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MapMouseEvent } from 'maplibre-gl';
import { TablerIconButton } from '@tak-ps/vue-tabler';
import {
    IconX,
    IconStar,
    IconPlus,
    IconStarFilled,
    IconAdjustments,
    IconArrowBackUp,
    IconAlertTriangle,
} from '@tabler/icons-vue';
import FeatureIcon from './util/FeatureIcon.vue';
import SignaturePicker from './util/SignaturePicker.vue';
import FavoriteSignatures, { signatureOf, type FavoriteSignature } from '../../base/favorite-signatures.ts';
import {
    armSignature,
    armedSignature,
    attachPlacementHandler,
    disarmSignature,
    placeSignature,
    undoPlacement,
    type PlacedSignature,
    type PlacementTarget,
} from '../../base/signature-placement.ts';
import { signatureKey, signatureProperties, type Signature } from '../../utils/signature.ts';
import { renderedIconImage } from '../../base/cot.ts';
import { DrawToolMode } from '../../stores/modules/draw.ts';
import { useMapStore } from '../../stores/map.ts';
import { tr } from '../../i18n/index.ts';
import type { Feature } from '../../types.ts';

/**
 * Favourite signatures on the map: tap one, then tap the map to place it.
 * It stays armed for the next tap until Done, so several objects go down in
 * a row - like ATAK's Point Dropper.
 */

const COLLAPSED_KEY = 'cloudtak-favorites-bar-collapsed';

const mapStore = useMapStore();
const route = useRoute();
const router = useRouter();

const picker = ref(false);
const busy = ref(false);
const error = ref<string | undefined>();
const placed = ref<PlacedSignature | undefined>();
const placedCount = ref(0);
const collapsed = ref<boolean>(readCollapsed());

const items = computed<FavoriteSignature[]>(() => FavoriteSignatures.state.items);
const loaded = computed<boolean>(() => FavoriteSignatures.state.loaded);

const armed = computed(() => armedSignature.value);
const armedId = computed<string | undefined>(() => armed.value ? signatureKey(armed.value.signature) : undefined);

const armedProperties = computed<Feature['properties']>(() => {
    return (armed.value ? signatureProperties(armed.value.signature as Signature) : {}) as Feature['properties'];
});

const armedKey = computed<string>(() => renderedIconImage(armedProperties.value) || armedId.value || '');

const destination = computed<string>(() => {
    return mapStore.mission ? mapStore.mission.meta.name : tr('Own objects');
});

const hint = computed<string>(() => {
    const parts = [
        placedCount.value
            ? tr('{count} placed', { count: placedCount.value })
            : tr('Tap the map to place'),
        tr('Goes to {target}', { target: destination.value })
    ];

    return parts.join(' · ');
});

function readCollapsed(): boolean {
    try {
        return globalThis.localStorage?.getItem(COLLAPSED_KEY) === 'true';
    } catch {
        return false;
    }
}

function toggleCollapsed(): void {
    collapsed.value = !collapsed.value;

    try {
        globalThis.localStorage?.setItem(COLLAPSED_KEY, collapsed.value ? 'true' : 'false');
    } catch {
        // Storage blocked: the choice lasts for this page only
    }
}

function arm(signature: Signature, label: string): void {
    error.value = undefined;

    // A tap now places - an open radial menu would swallow it
    mapStore.radial.mode = undefined;
    mapStore.radial.cot = undefined;

    armSignature(signature, label);
}

function select(fav: FavoriteSignature): void {
    if (armedId.value === fav.id) {
        disarmSignature();
    } else {
        arm(signatureOf(fav), fav.label);
    }
}

async function onMapClick(event: MapMouseEvent): Promise<void> {
    const current = armedSignature.value;
    if (!current || mapStore.draw.mode !== DrawToolMode.STATIC) return;

    const lngLat = event.lngLat.wrap();

    try {
        placed.value = await placeSignature(
            mapStore as unknown as PlacementTarget,
            current.signature as Signature,
            current.label,
            [lngLat.lng, lngLat.lat]
        );

        placedCount.value += 1;
        error.value = undefined;
    } catch (err) {
        console.error('Failed to place signature', err);
        error.value = tr('Could not place the signature: {message}', {
            message: err instanceof Error ? err.message : String(err)
        });
    }
}

async function undo(): Promise<void> {
    if (!placed.value || busy.value) return;

    busy.value = true;
    const last = placed.value;

    try {
        await undoPlacement(mapStore as unknown as PlacementTarget, last);
        placed.value = undefined;
        placedCount.value = Math.max(0, placedCount.value - 1);
    } catch (err) {
        console.error('Failed to undo placement', err);
        error.value = tr('Could not remove the object: {message}', {
            message: err instanceof Error ? err.message : String(err)
        });
    } finally {
        busy.value = false;
    }
}

// A double tap would place twice - map zoom by double tap is off while armed
watch(armedId, (current, previous) => {
    // Undo and the count belong to the signature being placed
    placed.value = undefined;
    placedCount.value = 0;

    if (!mapStore._map) return;

    if (current && !previous) {
        mapStore.map.doubleClickZoom.disable();
        mapStore.map.getCanvas().style.cursor = 'crosshair';
    } else if (!current && previous) {
        mapStore.map.doubleClickZoom.enable();
        mapStore.map.getCanvas().style.cursor = '';
    }
});

// Opening a menu or an object ends the placement
watch(() => route.name, (name) => {
    if (armed.value && String(name ?? '').startsWith('home-menu')) disarmSignature();
});

let detach: (() => void) | undefined;

onMounted(async () => {
    detach = attachPlacementHandler();
    mapStore.map.on('click', onMapClick);
    await FavoriteSignatures.load();
});

onUnmounted(() => {
    if (detach) detach();
    disarmSignature();

    if (mapStore._map) {
        mapStore.map.off('click', onMapClick);
        mapStore.map.doubleClickZoom.enable();
        mapStore.map.getCanvas().style.cursor = '';
    }
});
</script>

<style scoped>
.favorites-bar-wrap {
    z-index: 5;
    gap: 8px;
    left: calc(8px + env(safe-area-inset-left, 0px));
    right: calc(8px + var(--map-side-offset, 0px) + env(safe-area-inset-right, 0px));
    bottom: calc(var(--map-gps-panel-size, 84px) + 16px + var(--map-bottom-inset, 0px));
    pointer-events: none;
}

.favorites-bar-wrap > * {
    pointer-events: auto;
}

.favorites-bar {
    height: 60px;
    max-width: 100%;
}

.favorites-bar__list {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
}

.favorites-bar__list::-webkit-scrollbar {
    display: none;
}

.favorites-bar__button {
    width: 52px;
    height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    padding: 0;
    touch-action: manipulation;
}

.favorites-bar__button:hover,
.favorites-bar__button:focus-visible {
    background: var(--cloudtak-hover-bg, rgba(128, 128, 128, 0.15));
}

.favorites-bar__button--armed {
    border-color: var(--tblr-primary);
    background: color-mix(in srgb, var(--tblr-primary) 25%, transparent);
}

.favorites-bar__star {
    color: var(--tblr-yellow, #f59f00);
}

.favorites-bar__status {
    min-height: 56px;
    max-width: min(100%, 520px);
    width: 100%;
}

.favorites-bar__text {
    min-width: 0;
}

/* Wraps rather than truncates on a phone - the target must stay readable */
.favorites-bar__hint {
    line-height: 1.2;
    overflow-wrap: anywhere;
}

.favorites-bar__action {
    min-height: 44px;
    flex-shrink: 0;
}
</style>
