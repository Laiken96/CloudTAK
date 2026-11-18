<template>
    <MenuTemplate
        name='Routes'
    >
        <template #buttons>
            <TablerIconButton
                v-if='routeCreation'
                title='New Route'
                @click='router.push("/menu/routes/new")'
            >
                <IconPlus
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
            <TablerIconButton
                title='Import GPX'
                @click='pickGpx'
            >
                <IconFileImport
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
            <TablerRefreshButton
                :loading='loading'
                @click='refresh(true)'
            />
        </template>
        <template #default>
            <input
                ref='gpxInput'
                type='file'
                accept='.gpx,application/gpx+xml'
                class='d-none'
                data-test='gpx-file'
                @change='readGpx'
            >

            <div
                v-if='gpxError'
                class='alert alert-danger my-2'
                role='alert'
                data-test='gpx-error'
                v-text='gpxError'
            />
            <div
                v-if='gpxMessage'
                class='alert alert-success my-2'
                role='status'
                data-test='gpx-message'
                v-text='gpxMessage'
            />

            <div
                v-if='gpx'
                class='card my-2'
                data-test='gpx-import'
            >
                <div class='card-body d-flex flex-column gap-2'>
                    <div
                        class='fw-bold text-break'
                        v-text='gpx.file'
                    />
                    <div
                        class='text-secondary small'
                        v-text='gpxSummary'
                    />
                    <TablerToggle
                        v-model='gpx.routes'
                        :disabled='!gpx.doc.paths.length'
                        :label='`Routes and tracks (${gpx.doc.paths.length})`'
                    />
                    <TablerToggle
                        v-model='gpx.waypoints'
                        :disabled='!gpx.doc.waypoints.length'
                        :label='`Waypoints as markers (${gpx.doc.waypoints.length})`'
                    />
                    <div class='d-flex gap-2'>
                        <button
                            type='button'
                            class='btn btn-primary'
                            data-test='gpx-import-run'
                            :disabled='importing || (!(gpx.routes && gpx.doc.paths.length) && !(gpx.waypoints && gpx.doc.waypoints.length))'
                            @click='importGpx'
                        >
                            Import
                        </button>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            :disabled='importing'
                            @click='gpx = null'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>

            <div class='my-2'>
                <SearchSortFilter v-model='query.filter' />
            </div>
            <TablerLoading
                v-if='loading'
                v-model='query.filter'
                desc='Loading Features'
            />
            <TablerNone
                v-else-if='routes.size === 0'
                :create='false'
                label='No Routes'
            />
            <template v-else>
                <div class='col-12 d-flex flex-column gap-2 py-3'>
                    <StandardItem
                        v-for='cot of routes.values()'
                        :key='cot.id'
                        class='d-flex align-items-center gap-3 p-2'
                        @click='clickRoute(cot)'
                    >
                        <div
                            class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                            style='width: 3rem; height: 3rem; min-width: 3rem;'
                        >
                            <IconRoute
                                :size='24'
                                :color='cot.properties["stroke"] || "currentColor"'
                                stroke='1'
                            />
                        </div>

                        <div class='d-flex flex-column'>
                            <div class='fw-bold'>
                                {{ cot.properties.callsign }}
                            </div>
                            <div
                                v-if='cot.geometry.type === "LineString"'
                                class='text-secondary small'
                            >
                                {{ Math.round(cot.length() * 1000) / 1000 + " km" }}
                            </div>
                        </div>

                        <div class='d-flex btn-list ms-auto'>
                            <TablerIconButton
                                v-if='cot.geometry.type === "LineString"'
                                :title='`Export ${cot.properties.callsign} as GPX`'
                                @click.stop='exportGpx(cot)'
                            >
                                <IconDownload
                                    :size='24'
                                    stroke='1'
                                />
                            </TablerIconButton>
                            <TablerDelete
                                displaytype='icon'
                                @delete='deleteRoute(cot.id)'
                            />
                        </div>
                    </StandardItem>
                </div>
            </template>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type { LineString } from 'geojson';
import { useRouter } from 'vue-router';
import COT from '../../../base/cot.ts';
import { server } from '../../../std.ts';
import MenuTemplate from '../util/MenuTemplate.vue';
import SearchSortFilter from '../util/SearchSortFilter.vue';
import StandardItem from '../util/StandardItem.vue';
import {
    TablerNone,
    TablerDelete,
    TablerLoading,
    TablerToggle,
    TablerIconButton,
    TablerRefreshButton
} from '@tak-ps/vue-tabler';
import type { WorkerMessage } from '../../../utils/events.ts';
import { WorkerMessageType } from '../../../utils/events.ts';
import {
    IconPlus,
    IconRoute,
    IconDownload,
    IconFileImport,
} from '@tabler/icons-vue';
import {
    gpxBounds,
    gpxFeatures,
    gpxFileName,
    parseGpx,
    routeToGpx,
    type GpxDocument,
} from '../../../utils/gpx.ts';
import { useMapStore } from '../../../stores/map.ts';

const router = useRouter();
const mapStore = useMapStore();

const channel = new BroadcastChannel("cloudtak");

channel.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === WorkerMessageType.Feature_Archived_Added) {
        await refresh();
    } else if (msg.type === WorkerMessageType.Feature_Archived_Removed) {
        await refresh();
    }
}

const routes = ref<Set<COT>>(new Set());
const query = ref({
    filter: ''
})

const routeCreation = ref(false);

const gpxInput = ref<HTMLInputElement | null>(null);
const gpx = ref<{ file: string; doc: GpxDocument; routes: boolean; waypoints: boolean } | null>(null);
const gpxError = ref('');
const gpxMessage = ref('');
const importing = ref(false);

const gpxSummary = computed(() => {
    if (!gpx.value) return '';
    const { doc } = gpx.value;

    const parts = [
        plural(doc.paths.length, 'route or track', 'routes and tracks'),
        plural(doc.waypoints.length, 'waypoint', 'waypoints')
    ];
    if (doc.skipped) parts.push(`${doc.skipped} repeated points dropped`);

    return (doc.name ? `${doc.name}: ` : '') + parts.join(', ');
});

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

const loading = ref(true);

watch(query.value, async () => {
    await refresh();
})

onMounted(async () => {
    await refresh();
    await settings();
});

onBeforeUnmount(() => {
    if (channel) {
        channel.close();
    }
})

async function settings() {
    try {
        const { data, error } = await server.GET('/api/search');
        if (error) throw new Error(error.message);

        if (data.route.enabled && data.route.providers) {
            routeCreation.value = true;
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteRoute(id: string): Promise<void> {
    await mapStore.worker.db.remove(id);
    await refresh();
}

async function clickRoute(cot: COT): Promise<void> {
    cot.flyTo();

    router.push(`/cot/${cot.id}`);
}

function pickGpx(): void {
    gpxError.value = '';
    gpxMessage.value = '';
    gpxInput.value?.click();
}

/** Read a GPX file and offer what it holds for import */
async function readGpx(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    gpxError.value = '';
    gpxMessage.value = '';
    gpx.value = null;

    try {
        const doc = parseGpx(await file.text());

        if (!doc.paths.length && !doc.waypoints.length) {
            throw new Error(`${file.name} holds no routes, tracks or waypoints`);
        }

        gpx.value = { file: file.name, doc, routes: doc.paths.length > 0, waypoints: doc.waypoints.length > 0 };
    } catch (err) {
        gpxError.value = err instanceof Error ? err.message : String(err);
    }
}

/** Add the routes and waypoints of the read GPX file to the map, as ATAK's route import does */
async function importGpx(): Promise<void> {
    if (!gpx.value) return;

    importing.value = true;
    gpxError.value = '';

    try {
        const features = gpxFeatures(gpx.value.doc, { routes: gpx.value.routes, waypoints: gpx.value.waypoints });

        for (const feature of features) {
            await mapStore.worker.db.add(feature, { authored: true });
        }

        await mapStore.refresh();

        const bounds = gpxBounds(features);
        if (bounds) {
            mapStore.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 60, maxZoom: 16 });
        }

        const routes = features.filter((f) => f.properties.type === 'b-m-r').length;
        gpxMessage.value = `Imported ${plural(routes, 'route', 'routes')} and ${plural(features.length - routes, 'waypoint', 'waypoints')} from ${gpx.value.file}`;
        gpx.value = null;

        await refresh();
    } catch (err) {
        gpxError.value = err instanceof Error ? err.message : String(err);
    } finally {
        importing.value = false;
    }
}

/** Save a route as a GPX file, with ATAK's colour and width */
function exportGpx(cot: COT): void {
    if (cot.geometry.type !== 'LineString') return;

    const text = routeToGpx({ properties: cot.properties, geometry: cot.geometry as LineString });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));

    const link = document.createElement('a');
    link.href = url;
    link.download = gpxFileName(String(cot.properties.callsign || 'route'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refresh(load = false): Promise<void> {
    if (load) loading.value = true;

    routes.value = new Set(Array.from(await mapStore.worker.db
        .filter(`
            properties.archived
            and properties.type = "b-m-r"
            and $contains($lowercase(properties.callsign), "${query.value.filter.toLowerCase()}")
        `, {
            mission: true
        })))

    loading.value = false
}

</script>
