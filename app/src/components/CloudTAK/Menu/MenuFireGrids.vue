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
                            <div
                                v-if='targetCounts[grid.id]'
                                class='text-secondary small'
                                data-test='fire-grid-targets'
                                v-text='targetSummary(targetCounts[grid.id])'
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
                            <TablerIconButton
                                :title='`Delete ${grid.name}`'
                                data-test='fire-grid-delete'
                                @click='askRemove(grid)'
                            >
                                <IconTrash
                                    :size='20'
                                    stroke='1'
                                />
                            </TablerIconButton>
                        </div>
                    </StandardItem>

                    <div
                        v-if='grids.length'
                        class='text-secondary small'
                    >
                        Same grid as the Einheitsfeuerplan: columns A–Z without I and O from west to east, rows from north to south, fine fields 1–9 like a telephone keypad. Long press the map to read a position as D2/6.
                    </div>
                </section>

                <section
                    v-if='!form'
                    class='d-flex flex-column gap-2'
                >
                    <input
                        ref='efpInput'
                        type='file'
                        accept='.zip,application/zip'
                        class='d-none'
                        data-test='efp-file'
                        @change='importEfp'
                    >
                    <div
                        v-if='efpError'
                        class='alert alert-danger m-0'
                        role='alert'
                        data-test='efp-error'
                        v-text='efpError'
                    />
                    <div
                        v-if='efpMessage'
                        class='alert alert-success m-0'
                        role='status'
                        data-test='efp-message'
                        v-text='efpMessage'
                    />
                    <div
                        v-if='efpWarnings.length'
                        class='alert alert-warning m-0 d-flex flex-column gap-2'
                        role='status'
                        data-test='efp-warning'
                    >
                        <div
                            v-for='warning of efpWarnings'
                            :key='warning'
                            v-text='warning'
                        />
                    </div>
                    <button
                        type='button'
                        class='btn btn-outline-secondary w-100'
                        data-test='efp-import'
                        :disabled='importing'
                        @click='pickEfp'
                    >
                        <IconFileImport
                            :size='20'
                            stroke='1'
                            class='me-1'
                        />
                        Import EFP File
                    </button>
                    <div class='text-secondary small'>
                        The data package (ATAK) exported by the Einheitsfeuerplan: its grid becomes a fire grid with cell lookup, its targets are added to the map as features of this device. The targets belong to the grid: they are shown and hidden with it and deleted with it, and are not added to a mission.
                    </div>
                </section>
            </div>

            <TablerModal
                v-if='removing'
                size='sm'
            >
                <button
                    type='button'
                    class='btn-close'
                    aria-label='Close'
                    @click='removing = null'
                />
                <div class='modal-status bg-red' />
                <div
                    class='modal-header text-center py-3'
                    v-text='removeTitle'
                />
                <div
                    class='modal-body text-center py-3'
                    data-test='fire-grid-delete-text'
                    v-text='removeText'
                />
                <div
                    v-if='removeError'
                    class='alert alert-danger mx-3'
                    role='alert'
                    v-text='removeError'
                />
                <div class='modal-footer d-flex gap-2'>
                    <button
                        type='button'
                        class='btn btn-outline-secondary flex-grow-1'
                        @click='removing = null'
                    >
                        Cancel
                    </button>
                    <button
                        type='button'
                        class='btn btn-danger flex-grow-1'
                        data-test='fire-grid-delete-confirm'
                        :disabled='removeBusy'
                        @click='remove'
                    >
                        Delete
                    </button>
                </div>
            </TablerModal>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
/** MenuFireGrids - Einheitsfeuerplan fire grids on the map, cell lookup and target markers */
import { computed, onMounted, ref, watch } from 'vue';
import { v4 as randomUUID } from 'uuid';
import MenuTemplate from '../util/MenuTemplate.vue';
import StandardItem from '../util/StandardItem.vue';
import FireGrids, { type FireGrid, type FireGridHit } from '../../../base/fire-grids.ts';
import { importEfpPackage, type EfpImportResult } from '../../../base/efp-import.ts';
import { EfpPackageError, readEfpPackage, type EfpPackage } from '../../../utils/efp-package.ts';
import { useFireGridTargets } from '../../../stores/modules/fire-grid-targets.ts';
import { tr } from '../../../i18n/index.ts';
import {
    FIRE_GRID_DEFAULTS,
    FIRE_GRID_SIZES,
    fireGridAround,
    fireGridCenter,
    fireGridHash,
    fireGridShowZoom,
    parseDesignation,
    parseFireGridLink,
    validateFireGrid,
    type FireGridParams,
} from '../../../utils/fire-grid.ts';
import { formatCoordPair } from '../../../utils/coordinateFormat.ts';
import { formatLv95, lv95ToLngLat } from '../../../utils/lv95.ts';
import { useMapStore } from '../../../stores/map.ts';
import {
    TablerEnum,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerModal,
    TablerNone,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import {
    IconFileImport,
    IconFocusCentered,
    IconGrid3x3,
    IconMapPinPlus,
    IconPencil,
    IconPlus,
    IconSearch,
    IconTrash,
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
const targetHost = useFireGridTargets(mapStore);

const sizes = FIRE_GRID_SIZES.map(String);

const loaded = computed(() => FireGrids.state.loaded);
const grids = computed(() => FireGrids.state.grids);

const form = ref<GridForm | null>(null);
const linkError = ref('');
const saveError = ref('');

const query = ref('');
const hits = ref<FireGridHit[]>([]);
const lookupMessage = ref('');

const efpInput = ref<HTMLInputElement | null>(null);
const efpError = ref('');
const efpMessage = ref('');
const efpWarnings = ref<string[]>([]);
const importing = ref(false);

/** Targets of each grid on this device, by grid id */
const targetCounts = ref<Record<string, number>>({});

const removing = ref<{ grid: FireGrid; count: number } | null>(null);
const removeBusy = ref(false);
const removeError = ref('');

onMounted(async () => {
    await FireGrids.load();
});

async function countTargets(): Promise<void> {
    const counts: Record<string, number> = {};
    for (const grid of grids.value) {
        if (grid.targets.length) counts[grid.id] = await FireGrids.targetCount(grid);
    }
    targetCounts.value = counts;
}

watch(() => grids.value.map((g) => `${g.id}:${g.targets.length}`).join(';'), () => {
    countTargets().catch((err) => console.error('Failed to count fire grid targets', err));
}, { immediate: true });

function targetSummary(count: number): string {
    return count === 1
        ? tr('1 target, shown and hidden with the grid')
        : tr('{count} targets, shown and hidden with the grid', { count });
}

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

async function askRemove(grid: FireGrid): Promise<void> {
    removeError.value = '';
    removeBusy.value = false;
    removing.value = { grid, count: await FireGrids.targetCount(grid) };
}

const removeTitle = computed(() => removing.value ? tr('Delete fire grid {name}?', { name: removing.value.grid.name }) : '');

const removeText = computed(() => {
    if (!removing.value) return '';

    const { count } = removing.value;
    if (count === 0) return tr('The grid has no targets on this device, only the grid is deleted.');
    if (count === 1) return tr('The grid is deleted together with 1 target.');
    return tr('The grid is deleted together with {count} targets.', { count });
});

/** Delete the grid in the confirmation, with its targets */
async function remove(): Promise<void> {
    if (!removing.value) return;
    const { grid } = removing.value;

    removeBusy.value = true;
    removeError.value = '';

    try {
        await FireGrids.remove(grid.id);
        if (grid.targets.length) await mapStore.refresh();

        hits.value = hits.value.filter((hit) => hit.grid.id !== grid.id);
        removing.value = null;
    } catch (err) {
        removeError.value = err instanceof Error ? tr(err.message) : String(err);
    } finally {
        removeBusy.value = false;
    }
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
    return `${formatLv95(E, N)} · ${formatCoordPair(lat, lng, 'mgrs')}`;
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

function pickEfp(): void {
    efpError.value = '';
    efpMessage.value = '';
    efpWarnings.value = [];
    efpInput.value?.click();
}

function efpSummary(pkg: EfpPackage, result: EfpImportResult): string {
    const parts: string[] = [];

    if (!result.grid) {
        parts.push(tr('No grid in this file (Einheitsfeuerplan before V1.5)'));
    } else if (result.gridAdded) {
        parts.push(tr('Fire grid {name} added', { name: result.grid.name }));
    } else {
        parts.push(tr('Fire grid {name} was already there', { name: result.grid.name }));
    }

    if (pkg.targets.length === 0) {
        parts.push(tr('No targets in this file'));
    } else if (result.targets.length === 1) {
        parts.push(tr('1 target imported'));
    } else if (result.targets.length > 1) {
        parts.push(tr('{count} targets imported', { count: result.targets.length }));
    }

    let summary = parts.join(' · ');

    if (result.targets.length && !result.grid) {
        summary += '. ' + tr('Without a grid the targets belong to no grid: they are features of this device in the folder {folder} (menu Features), not in a mission.', {
            folder: pkg.name.replace(/\//g, '')
        });
    }

    return summary;
}

/**
 * Targets of an earlier import still in a mission, per mission: left there,
 * the user deletes them in the mission and imports the file again
 */
function efpMissionWarnings(result: EfpImportResult): string[] {
    const byMission = new Map<string, { name: string; targets: string[] }>();

    for (const { target, mission } of result.inMission) {
        const entry = byMission.get(mission.guid) ?? { name: mission.name, targets: [] };
        entry.targets.push(target.properties.callsign || target.id);
        byMission.set(mission.guid, entry);
    }

    return [...byMission.values()].map(({ name, targets }) => {
        if (targets.length === 1) {
            return tr('{target} is still in the mission {mission} from an earlier import and was left there unchanged.', { target: targets[0], mission: name })
                + ' ' + (result.grid
                    ? tr('Delete it there and import this file again: then it belongs to the fire grid.')
                    : tr('Delete it there and import this file again: then it is a feature of this device.'));
        }

        return tr('{targets} are still in the mission {mission} from an earlier import and were left there unchanged.', { targets: targets.join(', '), mission: name })
            + ' ' + (result.grid
                ? tr('Delete them there and import this file again: then they belong to the fire grid.')
                : tr('Delete them there and import this file again: then they are features of this device.'));
    });
}

/**
 * Import the data package (ATAK) of the Einheitsfeuerplan: its grid as a fire
 * grid, its targets as local features of this device that belong to the grid.
 * Read on this device; the targets are never filed into a mission.
 */
async function importEfp(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    importing.value = true;
    efpError.value = '';
    efpMessage.value = '';
    efpWarnings.value = [];

    try {
        const pkg = readEfpPackage(new Uint8Array(await file.arrayBuffer()));
        const result = await importEfpPackage(pkg, targetHost);

        if (result.targets.length) await mapStore.refresh();

        efpMessage.value = efpSummary(pkg, result);
        efpWarnings.value = efpMissionWarnings(result);
        await countTargets();

        if (result.grid) {
            zoomTo(result.grid);
        } else {
            const lngs = pkg.targets.map((t) => t.lng), lats = pkg.targets.map((t) => t.lat);
            mapStore.map.fitBounds(
                [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                { padding: 60, maxZoom: 16 }
            );
        }
    } catch (err) {
        efpError.value = err instanceof EfpPackageError
            ? tr(err.message)
            : tr('Import failed: {error}', { error: err instanceof Error ? err.message : String(err) });
    } finally {
        importing.value = false;
    }
}
</script>
