<template>
    <MenuTemplate name='Help'>
        <div
            class='d-flex flex-column gap-3 py-2'
            data-testid='help-menu'
        >
            <StandardItem
                :hover='false'
                class='d-flex align-items-center gap-3 p-3'
            >
                <div
                    class='help-icon d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25 flex-shrink-0'
                >
                    <IconRoute2
                        :size='24'
                        stroke='1.5'
                    />
                </div>
                <div
                    class='flex-grow-1'
                    style='min-width: 0;'
                >
                    <div class='fw-bold'>
                        Guided Tour
                    </div>
                    <div class='small text-secondary'>
                        The most important elements of the app, step by step.
                    </div>
                </div>
                <button
                    type='button'
                    class='btn btn-primary help-button flex-shrink-0'
                    data-testid='help-start-tour'
                    @click='startTour'
                >
                    <IconPlayerPlay
                        :size='18'
                        stroke='1.5'
                        class='me-1'
                    />
                    Start Tour
                </button>
            </StandardItem>

            <div
                v-if='simpleMode'
                class='alert alert-info d-flex align-items-center gap-2 m-0'
                data-testid='help-simple-note'
            >
                <div class='flex-grow-1 small'>
                    The simple view shows only some functions. Switch to the full view to see and look up all of them.
                </div>
                <button
                    type='button'
                    class='btn btn-outline-secondary help-button flex-shrink-0'
                    data-testid='help-full-view'
                    @click='setSimpleMode(false)'
                >
                    Full View
                </button>
            </div>

            <TablerInput
                v-model='filter'
                placeholder='Search help...'
                icon='search'
                class='mb-0'
            />

            <section
                v-for='section in sections'
                :key='section.id'
                class='d-flex flex-column gap-2'
                :data-testid='`help-section-${section.id}`'
            >
                <div
                    class='subheader user-select-none'
                    v-text='section.title'
                />

                <StandardItem
                    v-for='entry in section.entries'
                    :key='entry.id'
                    :hover='false'
                    class='d-flex align-items-start gap-3 p-2'
                    data-testid='help-entry'
                    :data-help-id='entry.id'
                >
                    <div
                        class='help-icon d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25 flex-shrink-0'
                    >
                        <component
                            :is='entry.icon'
                            v-if='entry.icon'
                            :size='22'
                            stroke='1.5'
                        />
                        <IconHelpCircle
                            v-else
                            :size='22'
                            stroke='1.5'
                        />
                    </div>
                    <div
                        class='flex-grow-1'
                        style='min-width: 0;'
                    >
                        <div
                            class='fw-bold'
                            v-text='entry.title'
                        />
                        <div
                            class='small text-secondary help-text'
                            v-text='entry.description'
                        />
                    </div>
                    <button
                        v-if='canShow(entry)'
                        type='button'
                        class='btn btn-outline-primary help-button flex-shrink-0 align-self-center'
                        data-testid='help-show'
                        :title='showTitle(entry)'
                        @click='show(entry)'
                    >
                        Show
                    </button>
                </StandardItem>
            </section>

            <TablerNone
                v-if='!sections.length'
                label='No matching help'
                :create='false'
            />
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
/** MenuHelp - function overview with the guided tour (Menu › Help) */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TablerInput, TablerNone } from '@tak-ps/vue-tabler';
import { IconHelpCircle, IconPlayerPlay, IconRoute2 } from '@tabler/icons-vue';
import MenuTemplate from '../components/CloudTAK/util/MenuTemplate.vue';
import StandardItem from '../components/CloudTAK/util/StandardItem.vue';
import { useMapStore } from '../stores/map.ts';
import { simpleMode, setSimpleMode } from '../stores/modules/simple-mode.ts';
import { openSecondaryView } from '../utils/capacitor.ts';
import { tr } from '../i18n/index.ts';
import { tour } from './tour.ts';
import { HELP_ENTRIES, TOUR_STEPS } from './steps.ts';
import { helpOverview, type OverviewEntry } from './overview.ts';

const mapStore = useMapStore();
const router = useRouter();
const route = useRoute();

const filter = ref('');

const sections = computed(() => helpOverview(
    HELP_ENTRIES,
    mapStore.menu.items.value,
    simpleMode.value ? 'simple' : 'full',
    filter.value,
));

function showTitle(entry: OverviewEntry): string {
    return tr('Show {name}', { name: entry.title });
}

function canShow(entry: OverviewEntry): boolean {
    if (entry.show) return true;
    return Boolean(entry.route) && entry.route !== route.path;
}

function startTour(): void {
    tour.start(TOUR_STEPS).catch((err) => {
        console.error('Tutorial: cannot start the tour', err);
    });
}

function show(entry: OverviewEntry): void {
    if (entry.show) {
        tour.show(entry.show).catch((err) => {
            console.error('Tutorial: cannot show', entry.id, err);
        });
    } else if (entry.route && entry.routeExternal) {
        void openSecondaryView(String(new URL(entry.route, window.location.origin)));
    } else if (entry.route) {
        router.push(entry.route);
    }
}
</script>

<style scoped>
.help-icon {
    width: 2.5rem;
    height: 2.5rem;
}

.help-button {
    min-height: 44px;
    touch-action: manipulation;
}

.help-text {
    line-height: 1.35;
}
</style>
