<template>
    <MenuTemplate
        name='Fire Grid'
    >
        <template #buttons>
            <TablerIconButton
                v-if='!form'
                title='New Fire Grid'
                @click='openForm()'
            >
                <IconPlus
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
        </template>
        <template #default>
            <div class='d-flex flex-column gap-3 py-2'>
                <form
                    v-if='form'
                    class='d-flex flex-column gap-2'
                    data-test='fire-grid-form'
                    @submit.prevent='saveForm'
                >
                    <div
                        class='subheader user-select-none'
                        v-text='form.id ? "Edit Fire Grid" : "New Fire Grid"'
                    />

                    <TablerInput
                        id='fire-grid-name'
                        v-model='form.name'
                        label='Name'
                        placeholder='e.g. EFP MERKUR Pz Kp 2'
                    />

                    <TablerInput
                        id='fire-grid-link'
                        v-model='form.link'
                        label='Einheitsfeuerplan link'
                        description='Paste the link of the Einheitsfeuerplan (…#e0=…&n0=…&z=…&c=…&r=…) to take over its grid'
                        placeholder='#e0=2570000&n0=1256000&z=250&c=20&r=12'
                        :error='linkError'
                        @update:model-value='applyLink($event)'
                    />

                    <div class='row g-2'>
                        <div class='col-6'>
                            <TablerInput
                                id='fire-grid-e0'
                                v-model='form.e0'
                                type='number'
                                label='Origin E (LV95)'
                                description='North west corner'
                            />
                        </div>
                        <div class='col-6'>
                            <TablerInput
                                id='fire-grid-n0'
                                v-model='form.n0'
                                type='number'
                                label='Origin N (LV95)'
                            />
                        </div>
                        <div class='col-4'>
                            <TablerEnum
                                v-model='form.z'
                                label='Cell size [m]'
                                :options='sizes'
                            />
                        </div>
                        <div class='col-4'>
                            <TablerInput
                                id='fire-grid-ncols'
                                v-model='form.ncols'
                                type='number'
                                label='Columns'
                            />
                        </div>
                        <div class='col-4'>
                            <TablerInput
                                id='fire-grid-nrows'
                                v-model='form.nrows'
                                type='number'
                                label='Rows'
                            />
                        </div>
                    </div>

                    <div
                        class='text-secondary small'
                        v-text='formSummary'
                    />

                    <div
                        v-for='error of formErrors'
                        :key='error'
                        class='text-danger small'
                        v-text='error'
                    />

                    <div class='d-flex gap-2'>
                        <button
                            type='button'
                            class='btn btn-outline-secondary'
                            title='Place the grid around the centre of the map, origin on a whole kilometre'
                            @click='centerForm'
                        >
                            <IconFocusCentered
                                :size='20'
                                stroke='1'
                                class='me-1'
                            />
                            Map centre
                        </button>
                        <button
                            type='button'
                            class='btn btn-outline-secondary ms-auto'
                            @click='form = null'
                        >
                            Cancel
                        </button>
                        <button
                            type='submit'
                            class='btn btn-primary'
                            :disabled='formErrors.length > 0'
                        >
                            Save
                        </button>
                    </div>
                </form>

                <section
                    v-if='grids.length'
                    class='d-flex flex-column gap-2'
                >
                    <form
                        class='d-flex align-items-start gap-2'
                        @submit.prevent='lookup'
                    >
                        <div class='flex-grow-1'>
                            <TablerInput
                                id='fire-grid-find'
                                v-model='query'
                                placeholder='Find a cell, e.g. D2 or D2/6'
                            />
                        </div>
                        <TablerIconButton
                            title='Find Cell'
                            @click='lookup'
                        >
                            <IconSearch
                                :size='24'
                                stroke='1'
                            />
                        </TablerIconButton>
                    </form>

                    <div
                        v-if='lookupMessage'
                        class='text-secondary small'
                        v-text='lookupMessage'
                    />

                    <div
                        v-for='hit of hits'
                        :key='`${hit.grid.id}-${hit.designation}`'
                        class='d-flex align-items-center gap-2 p-2 rounded bg-black bg-opacity-10'
                        data-test='fire-grid-hit'
                    >
                        <div
                            class='d-flex flex-column flex-grow-1'
                            style='min-width: 0;'
                        >
                            <div class='fw-bold'>
                                <span v-text='hit.designation' />
                                <span
                                    class='text-secondary fw-normal ms-2'
                                    v-text='hit.spoken'
                                />
                            </div>
                            <div
                                class='text-secondary small text-truncate'
                                v-text='hit.grid.name'
                            />
                            <div
                                class='text-secondary small'
                                v-text='hitCoordinates(hit)'
                            />
                        </div>
                        <TablerIconButton
                            :title='`Show ${hit.designation}`'
                            @click='show(hit)'
                        >
                            <IconZoomIn
                                :size='20'
                                stroke='1'
                            />
                        </TablerIconButton>
                        <TablerIconButton
                            :title='`Place a marker at ${hit.designation}`'
                            @click='placeMarker(hit)'
                        >
                            <IconMapPinPlus
                                :size='20'
                                stroke='1'
                            />
                        </TablerIconButton>
                    </div>
                </section>

                <section class='d-flex flex-column gap-2'>
                    <TablerLoading
                        v-if='!loaded'
                        desc='Loading Fire Grids'
                    />
                    <TablerNone
                        v-else-if='grids.length === 0 && !form'
                        label='No Fire Grids'
                        @create='openForm()'
                    />
                    <StandardItem
                        v-for='grid of grids'
                        :key='grid.id'
                        class='d-flex align-items-center gap-3 p-2'
                        data-test='fire-grid-row'
                        @click='zoomTo(grid)'
                    >
                        <div
                            class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25'
                            style='width: 2.5rem; height: 2.5rem; min-width: 2.5rem;'
                        >
                            <IconGrid3x3
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
                                v-text='grid.name'
                            />
                            <div
                                class='text-secondary small'
                                v-text='gridSummary(grid)'
                            />
                        </div>

                        <div
                            class='d-flex align-items-center btn-list ms-auto'
                            @click.stop
                        >
                            <TablerToggle
                                :model-value='grid.visible'
                                :title='grid.visible ? `Hide ${grid.name}` : `Show ${grid.name}`'
                                @update:model-value='setVisible(grid, $event)'
                            />
                            <TablerIconButton
                                :title='`Edit ${grid.name}`'
                                @click='openForm(grid)'
                            >
                                <IconPencil
                                    :size='20'
                                    stroke='1'
                                />
                            </TablerIconButton>
                            <TablerDelete
                                displaytype='icon'
                                :size='20'
                                :title='`Delete ${grid.name}`'
                                @delete='remove(grid)'
                            />
                        </div>
                    </StandardItem>

                    <div
                        v-if='grids.length'
                        class='text-secondary small'
                    >
                        Same grid as the Einheitsfeuerplan: columns A–Z without I and O from west to east, rows from north to south, fine fields 1–9 like a telephone keypad. Long press the map to read a position as D2/6.
                    </div>
                </section>
            </div>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
/** MenuFireGrids - Einheitsfeuerplan fire grids on the map, cell lookup and target markers */
import { computed, onMounted, ref } from 'vue';
import { v4 as randomUUID } from 'uuid';
import MenuTemplate from '../util/MenuTemplate.vue';
import StandardItem from '../util/StandardItem.vue';
import FireGrids, { type FireGrid, type FireGridHit } from '../../../base/fire-grids.ts';
import {
    FIRE_GRID_DEFAULTS,
    FIRE_GRID_SIZES,
    bankersRound,
    fireGridAround,
    fireGridCenter,
    fireGridHash,
    fireGridShowZoom,
    lv95ToLngLat,
    parseDesignation,
    parseFireGridLink,
    validateFireGrid,
    type FireGridParams,
} from '../../../utils/fire-grid.ts';
import { formatCoordPair } from '../../../utils/coordinateFormat.ts';
import { useMapStore } from '../../../stores/map.ts';
import {
    TablerDelete,
    TablerEnum,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerNone,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import {
    IconFocusCentered,
    IconGrid3x3,
    IconMapPinPlus,
    IconPencil,
    IconPlus,
    IconSearch,
    IconZoomIn,
} from '@tabler/icons-vue';

interface GridForm {
    id?: string;
    name: string;
    link: string;
    e0: number;
    n0: number;
    z: string;
    ncols: number;
    nrows: number;
}

const mapStore = useMapStore();

const sizes = FIRE_GRID_SIZES.map(String);

const loaded = computed(() => FireGrids.state.loaded);
const grids = computed(() => FireGrids.state.grids);

const form = ref<GridForm | null>(null);
const linkError = ref('');
const saveError = ref('');

const query = ref('');
const hits = ref<FireGridHit[]>([]);
const lookupMessage = ref('');

onMounted(async () => {
    await FireGrids.load();
});

function formParams(f: GridForm): FireGridParams {
    return { e0: Number(f.e0), n0: Number(f.n0), z: Number(f.z), ncols: Number(f.ncols), nrows: Number(f.nrows) };
}

const formErrors = computed<string[]>(() => {
    if (!form.value) return [];

    const errors = validateFireGrid(formParams(form.value));
    if (saveError.value) errors.push(saveError.value);
    return errors;
});

const formSummary = computed(() => {
    if (!form.value || validateFireGrid(formParams(form.value)).length) return '';
    return gridSummary(formParams(form.value));
});

function km(m: number): string {
    return `${Math.round(m / 100) / 10}`;
}

function gridSummary(P: FireGridParams): string {
    return `${P.ncols} × ${P.nrows} cells of ${P.z} m · ${km(P.ncols * P.z)} × ${km(P.nrows * P.z)} km`;
}

function openForm(grid?: FireGrid): void {
    linkError.value = '';
    saveError.value = '';

    if (grid) {
        form.value = {
            id: grid.id,
            name: grid.name,
            link: `#${fireGridHash(grid)}`,
            e0: grid.e0,
            n0: grid.n0,
            z: String(grid.z),
            ncols: grid.ncols,
            nrows: grid.nrows
        };
    } else {
        const center = mapStore.map.getCenter();
        const P = fireGridAround(center.lng, center.lat, FIRE_GRID_DEFAULTS);
        const usable = validateFireGrid(P).length === 0 ? P : FIRE_GRID_DEFAULTS;

        form.value = {
            name: '',
            link: '',
            e0: usable.e0,
            n0: usable.n0,
            z: String(usable.z),
            ncols: usable.ncols,
            nrows: usable.nrows
        };
    }
}

function applyLink(value: string | number): void {
    if (!form.value) return;

    const text = String(value).trim();
    if (!text) {
        linkError.value = '';
        return;
    }

    const P = parseFireGridLink(text);
    if (!P) {
        linkError.value = 'No complete grid in this link (needs e0, n0, z, c and r)';
        return;
    }

    linkError.value = '';
    form.value.e0 = P.e0;
    form.value.n0 = P.n0;
    form.value.z = String(P.z);
    form.value.ncols = P.ncols;
    form.value.nrows = P.nrows;
}

function centerForm(): void {
    if (!form.value) return;

    const center = mapStore.map.getCenter();
    const P = fireGridAround(center.lng, center.lat, formParams(form.value));

    if (validateFireGrid(P).length) {
        saveError.value = 'The map centre is outside Switzerland';
        return;
    }

    saveError.value = '';
    form.value.e0 = P.e0;
    form.value.n0 = P.n0;
}

async function saveForm(): Promise<void> {
    if (!form.value || formErrors.value.length) return;

    const params = formParams(form.value);
    const name = form.value.name.trim() || `Fire Grid ${grids.value.length + 1}`;

    try {
        let grid: FireGrid;
        if (form.value.id) {
            grid = await FireGrids.update(form.value.id, { ...params, name });
        } else {
            grid = await FireGrids.add({ ...params, name });
        }

        form.value = null;
        zoomTo(grid);
    } catch (err) {
        saveError.value = err instanceof Error ? err.message : String(err);
    }
}

async function setVisible(grid: FireGrid, visible: boolean): Promise<void> {
    await FireGrids.update(grid.id, { visible });
    hits.value = hits.value.filter((hit) => hit.grid.id !== grid.id || visible);
}

async function remove(grid: FireGrid): Promise<void> {
    await FireGrids.remove(grid.id);
    hits.value = hits.value.filter((hit) => hit.grid.id !== grid.id);
}

function zoomTo(grid: FireGrid): void {
    mapStore.fireGrid.fitGrid(grid);
}

function lookup(): void {
    const text = query.value.trim();
    hits.value = [];
    lookupMessage.value = '';

    if (!text) return;

    if (!parseDesignation(text)) {
        lookupMessage.value = 'Format: D2 or D2/6';
        return;
    }

    hits.value = FireGrids.find(text);

    if (!hits.value.length) {
        lookupMessage.value = `${text.toUpperCase()} is in none of the shown grids`;
    } else if (hits.value.length === 1) {
        show(hits.value[0]);
    }
}

function hitPosition(hit: FireGridHit): [number, number] {
    const [E, N] = fireGridCenter(hit.grid, hit.cell);
    return lv95ToLngLat(E, N);
}

/** Centre of the cell or fine field in LV95 and MGRS, as on the FuOf target list */
function hitCoordinates(hit: FireGridHit): string {
    const [E, N] = fireGridCenter(hit.grid, hit.cell);
    const [lng, lat] = lv95ToLngLat(E, N);
    return `${bankersRound(E)} / ${bankersRound(N)} · ${formatCoordPair(lat, lng, 'mgrs')}`;
}

function show(hit: FireGridHit): void {
    mapStore.map.flyTo({ center: hitPosition(hit), zoom: fireGridShowZoom(hit.grid) });
    mapStore.fireGrid.highlight(hit.grid, hit.cell);
}

async function placeMarker(hit: FireGridHit): Promise<void> {
    const center = hitPosition(hit);
    const now = new Date();
    const id = randomUUID();

    await mapStore.worker.db.add({
        id,
        type: 'Feature',
        path: '/',
        properties: {
            id,
            callsign: hit.designation,
            type: 'u-d-p',
            how: 'h-g-i-g-o',
            archived: true,
            time: now.toISOString(),
            start: now.toISOString(),
            stale: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            center,
            'marker-color': '#FFD60A',
            'marker-opacity': 1,
            remarks: `${hit.designation} · ${hit.spoken} · ${hit.grid.name}`
        },
        geometry: {
            type: 'Point',
            coordinates: center
        }
    }, { authored: true, created: true, skipMissionLookup: true });

    await mapStore.refresh();
    show(hit);
}
</script>
