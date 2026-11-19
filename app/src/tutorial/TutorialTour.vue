<template>
    <Teleport to='body'>
        <div
            v-if='state.active'
            class='tutorial-tour'
            data-testid='tutorial-tour'
        >
            <!-- Takes every tap outside the card: the app stays still during the tour -->
            <div
                class='tutorial-tour__blocker'
                @click.stop
                @touchmove.prevent
            />

            <div
                v-if='hole'
                class='tutorial-tour__hole'
                data-testid='tutorial-highlight'
                :style='{
                    top: `${hole.top}px`,
                    left: `${hole.left}px`,
                    width: `${hole.width}px`,
                    height: `${hole.height}px`,
                }'
            />
            <div
                v-else
                class='tutorial-tour__dim'
            />

            <div
                v-if='step'
                ref='card'
                class='tutorial-tour__card cloudtak-panel'
                :class='{ "tutorial-tour__card--hidden": !placed }'
                :style='{ top: `${position.top}px`, left: `${position.left}px` }'
                :data-placement='position.placement'
                role='dialog'
                aria-modal='true'
                :aria-labelledby='`${uid}-title`'
                :aria-describedby='`${uid}-text`'
                tabindex='-1'
                data-testid='tutorial-card'
            >
                <div
                    v-if='state.mode === "tour"'
                    class='small text-secondary'
                    data-testid='tutorial-progress'
                    v-text='progress'
                />
                <div
                    :id='`${uid}-title`'
                    class='tutorial-tour__title'
                    data-testid='tutorial-title'
                    v-text='step.title'
                />
                <p
                    :id='`${uid}-text`'
                    class='tutorial-tour__text'
                    data-testid='tutorial-text'
                    v-text='step.description'
                />
                <p
                    v-if='state.missing'
                    class='small text-secondary mb-0 mt-2'
                    data-testid='tutorial-missing'
                >
                    This element is not shown right now, for example in the simple view or while drawing.
                </p>

                <div class='d-flex align-items-center gap-2 mt-3'>
                    <template v-if='state.mode === "tour"'>
                        <button
                            v-if='!tour.isFirst'
                            type='button'
                            class='btn btn-outline-secondary tutorial-tour__button'
                            data-testid='tutorial-back'
                            :disabled='state.busy'
                            @click='tour.prev()'
                        >
                            Back
                        </button>
                        <button
                            type='button'
                            class='btn btn-ghost-secondary tutorial-tour__button'
                            data-testid='tutorial-end'
                            @click='tour.end()'
                        >
                            End
                        </button>
                        <button
                            type='button'
                            class='btn btn-primary tutorial-tour__button ms-auto'
                            data-testid='tutorial-next'
                            :disabled='state.busy'
                            @click='tour.next()'
                            v-text='tour.isLast ? "Done" : "Next"'
                        />
                    </template>
                    <button
                        v-else
                        type='button'
                        class='btn btn-primary tutorial-tour__button ms-auto'
                        data-testid='tutorial-close'
                        @click='tour.end()'
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang='ts'>
/**
 * TutorialTour - the guided tour on top of the app: darkens the screen, cuts
 * out the explained element and puts a short card above or below it.
 * Mounted once on the map page; starts by itself once per device.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { tour, shouldAutoStart, type TourEnvironment } from './tour.ts';
import { TOUR_STEPS } from './steps.ts';
import { placeCard, highlightRect, type CardPosition, type Insets, type Rect } from './position.ts';
import { elementRect, findShown, isShown, revealElement, safeAreaInsets, sameRect, viewportSize, waitForShown } from './dom.ts';
import { simpleMode } from '../stores/modules/simple-mode.ts';
import { tr } from '../i18n/index.ts';

const props = withDefaults(defineProps<{
    /** Something else asks for attention first (e.g. the configuration prompt) */
    paused?: boolean;
}>(), {
    paused: false,
});

/** The map and its panels settle before the tour starts by itself */
const AUTO_START_DELAY = 1200;
/** Elements move with animations and lists - follow them */
const FOLLOW_INTERVAL = 250;

const router = useRouter();
const route = useRoute();
const uid = useId();

const state = tour.state;
const step = computed(() => tour.step);

const card = ref<HTMLElement | null>(null);
const hole = ref<Rect | null>(null);
const position = ref<CardPosition>({ top: 0, left: 0, placement: 'center' });
const placed = ref(false);

let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

const progress = computed(() => tr('Step {current} of {total}', {
    current: tour.position,
    total: tour.total,
}));

function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const environment: TourEnvironment = {
    view: () => simpleMode.value ? 'simple' : 'full',
    currentRoute: () => router.currentRoute.value.path,
    navigate: async (path: string) => {
        await router.push(path);
        await nextTick();
        await nextFrame();
    },
    activate: async (selector: string) => {
        const el = findShown(selector);
        if (!el) return false;

        el.click();
        // The dropdown renders and positions itself on the next tick
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return true;
    },
    findTarget: (selector: string) => findShown(selector),
    waitForTarget: async (selector: string) => {
        const el = await waitForShown(selector);
        if (el) revealElement(el);
        return el;
    },
};

/** Measure the element and the card, then place hole and card */
function layout(): void {
    if (!state.active) return;

    const viewport = viewportSize();
    const target = state.target;

    let next: Rect | null = null;
    if (target) {
        if (!isShown(target)) {
            void tour.recover();
            return;
        }
        next = highlightRect(elementRect(target), viewport);
    }

    if (!sameRect(next, hole.value)) hole.value = next;

    const el = card.value;
    if (!el) return;

    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const pos = placeCard(next, size, viewport, insets);

    if (pos.top !== position.value.top || pos.left !== position.value.left || pos.placement !== position.value.placement) {
        position.value = pos;
    }

    placed.value = true;
}

async function relayout(): Promise<void> {
    await nextTick();
    layout();
}

function onResize(): void {
    insets = safeAreaInsets();
    layout();
}

function onOrientation(): void {
    // iOS reports the new size only after the rotation has finished
    setTimeout(onResize, 300);
}

function onKey(event: KeyboardEvent): void {
    if (!state.active) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        void tour.end();
    } else if (event.key === 'ArrowRight' && state.mode === 'tour') {
        void tour.next();
    } else if (event.key === 'ArrowLeft' && state.mode === 'tour') {
        void tour.prev();
    }
}

let follow: ReturnType<typeof setInterval> | undefined;

watch(() => state.active, (active) => {
    if (follow) clearInterval(follow);
    follow = undefined;

    if (active) {
        insets = safeAreaInsets();
        placed.value = false;
        follow = setInterval(layout, FOLLOW_INTERVAL);
        void nextTick(() => card.value?.focus({ preventScroll: true }));
    } else {
        hole.value = null;
        placed.value = false;
    }
});

watch(() => [state.index, state.target, state.missing], () => {
    void relayout();
});

// Starts by itself once per device, after the first login, on the bare map
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let autoStarted = false;

function autoStartWanted(): boolean {
    return !autoStarted && shouldAutoStart({
        paused: props.paused,
        routeName: route.name ? String(route.name) : undefined,
        active: state.active,
    });
}

watch(() => [props.paused, route.name], () => {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = undefined;

    if (!autoStartWanted()) return;

    autoTimer = setTimeout(() => {
        autoTimer = undefined;
        if (!autoStartWanted()) return;

        autoStarted = true;
        tour.start(TOUR_STEPS).catch((err) => {
            console.error('Tutorial: cannot start the tour', err);
        });
    }, AUTO_START_DELAY);
}, { immediate: true });

onMounted(() => {
    tour.setEnvironment(environment);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('keydown', onKey);
});

onUnmounted(() => {
    if (autoTimer) clearTimeout(autoTimer);
    if (follow) clearInterval(follow);

    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrientation);
    window.removeEventListener('keydown', onKey);

    // Leaving the map (logout): stop without moving the router
    void tour.end({ restore: false });
    tour.setEnvironment(undefined);
});
</script>

<style scoped>
/* Above modals and above dropdown menus (9999), which a step may open */
.tutorial-tour {
    position: fixed;
    inset: 0;
    z-index: 10000;
}

.tutorial-tour__blocker {
    position: absolute;
    inset: 0;
    touch-action: none;
}

.tutorial-tour__dim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.62);
    pointer-events: none;
}

.tutorial-tour__hole {
    position: fixed;
    border-radius: 12px;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 0 200vmax rgba(0, 0, 0, 0.62);
    pointer-events: none;
    transition: top 0.15s ease, left 0.15s ease, width 0.15s ease, height 0.15s ease;
}

.tutorial-tour__card {
    position: fixed;
    width: min(360px, calc(100vw - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
    max-height: calc(100vh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    padding: 14px 16px;
    border-radius: 12px;
    outline: none;
}

.tutorial-tour__card--hidden {
    visibility: hidden;
}

.tutorial-tour__title {
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.3;
    margin-top: 2px;
}

.tutorial-tour__text {
    margin: 6px 0 0;
    line-height: 1.4;
}

.tutorial-tour__button {
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
}

@media (prefers-reduced-motion: reduce) {
    .tutorial-tour__hole {
        transition: none;
    }
}
</style>
