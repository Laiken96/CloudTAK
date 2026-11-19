<template>
    <MenuTemplate
        name='Rubber Sheets'
    >
        <template #buttons>
            <TablerIconButton
                title='Add Image or KMZ'
                @click='pickFile'
            >
                <IconPlus
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
        </template>
        <template #default>
            <input
                ref='fileInput'
                type='file'
                class='d-none'
                accept='image/png,image/jpeg,image/webp,.kmz,application/vnd.google-earth.kmz'
                data-test='rubber-sheet-file'
                @change='onFile'
            >

            <div class='d-flex flex-column gap-3 py-2'>
                <TablerLoading
                    v-if='busy'
                    :desc='busy'
                />

                <div
                    v-if='error'
                    class='text-danger small'
                    v-text='error'
                />

                <section
                    v-if='selected'
                    class='d-flex flex-column gap-2'
                    data-test='rubber-sheet-editor'
                >
                    <div class='d-flex align-items-center gap-2'>
                        <span
                            class='subheader user-select-none flex-grow-1'
                            v-text='`Edit ${selected.name}`'
                        />
                        <button
                            type='button'
                            class='btn btn-primary btn-sm'
                            @click='closeEditor'
                        >
                            Done
                        </button>
                    </div>

                    <div class='text-secondary small'>
                        Drag the corners on the map to fit the image, or the centre to move it.
                    </div>

                    <TablerInput
                        id='rubber-sheet-name'
                        :model-value='selected.name'
                        label='Name'
                        @update:model-value='rename($event)'
                    />

                    <TablerRange
                        :model-value='Math.round(selected.opacity * 100)'
                        label='Opacity'
                        :min='10'
                        :max='100'
                        :step='5'
                        @update:model-value='setOpacity($event)'
                    />

                    <div class='d-flex align-items-center gap-1 flex-wrap'>
                        <span class='small text-secondary me-1'>Rotate</span>
                        <button
                            v-for='step of [-5, -1, 1, 5]'
                            :key='`r${step}`'
                            type='button'
                            class='btn btn-sm btn-outline-secondary'
                            :title='`Rotate ${Math.abs(step)}° ${step < 0 ? "counter clockwise" : "clockwise"}`'
                            @click='transform("rotate", step)'
                            v-text='`${step > 0 ? "+" : ""}${step}°`'
                        />
                        <span class='small text-secondary ms-2 me-1'>Scale</span>
                        <button
                            v-for='step of [-10, -1, 1, 10]'
                            :key='`s${step}`'
                            type='button'
                            class='btn btn-sm btn-outline-secondary'
                            :title='`${step < 0 ? "Shrink" : "Enlarge"} by ${Math.abs(step)} %`'
                            @click='transform("scale", step)'
                            v-text='`${step > 0 ? "+" : ""}${step}%`'
                        />
                    </div>

                    <div class='d-flex gap-2'>
                        <button
                            type='button'
                            class='btn btn-sm btn-outline-secondary'
                            @click='toMapCentre'
                        >
                            <IconFocusCentered
                                :size='18'
                                stroke='1'
                                class='me-1'
                            />
                            Move to map centre
                        </button>
                        <button
                            type='button'
                            class='btn btn-sm btn-outline-secondary'
                            @click='zoomTo(selected)'
                        >
                            <IconZoomIn
                                :size='18'
                                stroke='1'
                                class='me-1'
                            />
                            Show all
                        </button>
                    </div>

                    <div class='d-flex flex-column gap-2 mt-2'>
                        <div class='subheader user-select-none'>
                            Two control points
                        </div>
                        <div class='text-secondary small'>
                            Click a distinct point on the image, then the same point on the map or type its coordinates (MGRS, LV95 or latitude, longitude). Repeat for a second point far from the first.
                        </div>

                        <div class='rubber-sheet-preview'>
                            <div
                                class='position-relative'
                                data-test='rubber-sheet-preview'
                            >
                                <img
                                    v-if='thumbs[selected.id]'
                                    :src='thumbs[selected.id]'
                                    :alt='selected.name'
                                    class='w-100 d-block rounded'
                                    style='cursor: crosshair;'
                                    @click='pickImagePoint($event)'
                                >
                                <template
                                    v-for='(point, i) of points'
                                    :key='`p${i}`'
                                >
                                    <div
                                        v-if='point.pixel'
                                        class='rubber-sheet-point'
                                        :style='pointStyle(point.pixel)'
                                        v-text='i + 1'
                                    />
                                </template>
                            </div>
                        </div>

                        <div
                            v-for='(point, i) of points'
                            :key='`row${i}`'
                            class='d-flex flex-column gap-1'
                            :data-test='`rubber-sheet-point-${i + 1}`'
                        >
                            <div class='small'>
                                <span
                                    class='fw-bold me-2'
                                    v-text='`Point ${i + 1}`'
                                />
                                <span
                                    :class='point.pixel ? "text-success" : "text-secondary"'
                                    v-text='point.pixel ? "on image ✓" : (activeImagePoint === i ? "click it on the image" : "on image –")'
                                />
                                <span class='text-secondary mx-1'>·</span>
                                <span
                                    :class='point.map ? "text-success" : "text-secondary"'
                                    v-text='point.map ? `on map ✓ ${formatCoordPair(point.map[1], point.map[0], "mgrs")}` : "on map –"'
                                />
                            </div>
                            <div class='d-flex gap-1 align-items-start'>
                                <div class='flex-grow-1'>
                                    <TablerInput
                                        :id='`rubber-sheet-coord-${i + 1}`'
                                        v-model='point.text'
                                        placeholder='MGRS, LV95 or lat, lon'
                                        :error='point.error'
                                        @submit='setMapPointFromText(i)'
                                    />
                                </div>
                                <TablerIconButton
                                    :title='`Use the typed coordinates for point ${i + 1}`'
                                    @click='setMapPointFromText(i)'
                                >
                                    <IconCheck
                                        :size='20'
                                        stroke='1'
                                    />
                                </TablerIconButton>
                                <TablerIconButton
                                    :title='picking === i ? "Cancel" : `Click point ${i + 1} on the map`'
                                    @click='picking === i ? cancelPick() : pickMapPoint(i)'
                                >
                                    <IconCrosshair
                                        :size='20'
                                        stroke='1'
                                        :class='{ "text-primary": picking === i }'
                                    />
                                </TablerIconButton>
                            </div>
                        </div>

                        <div class='d-flex gap-2'>
                            <button
                                type='button'
                                class='btn btn-sm btn-outline-secondary'
                                @click='resetPoints'
                            >
                                Clear points
                            </button>
                            <button
                                type='button'
                                class='btn btn-sm btn-primary ms-auto'
                                :disabled='!pointsComplete'
                                data-test='rubber-sheet-apply'
                                @click='applyControlPoints'
                            >
                                Place by points
                            </button>
                        </div>
                    </div>
                </section>

                <section class='d-flex flex-column gap-2'>
                    <TablerLoading
                        v-if='!loaded'
                        desc='Loading Rubber Sheets'
                    />
                    <TablerNone
                        v-else-if='sheets.length === 0'
                        label='No Rubber Sheets'
                        @create='pickFile'
                    />
                    <StandardItem
                        v-for='sheet of sheets'
                        :key='sheet.id'
                        class='d-flex align-items-center gap-3 p-2'
                        :class='{ "rubber-sheet-row--selected": selectedId === sheet.id }'
                        data-test='rubber-sheet-row'
                        @click='zoomTo(sheet)'
                    >
                        <img
                            v-if='thumbs[sheet.id]'
                            :src='thumbs[sheet.id]'
                            alt=''
                            class='rounded flex-shrink-0'
                            style='width: 2.5rem; height: 2.5rem; object-fit: cover;'
                        >
                        <div
                            v-else
                            class='d-flex align-items-center justify-content-center rounded bg-black bg-opacity-25 flex-shrink-0'
                            style='width: 2.5rem; height: 2.5rem;'
                        >
                            <IconPhoto
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
                                v-text='sheet.name'
                            />
                            <div
                                class='text-secondary small'
                                v-text='sheetSummary(sheet)'
                            />
                        </div>

                        <div
                            class='d-flex align-items-center btn-list ms-auto'
                            @click.stop
                        >
                            <TablerToggle
                                :model-value='sheet.visible'
                                :title='sheet.visible ? `Hide ${sheet.name}` : `Show ${sheet.name}`'
                                @update:model-value='setVisible(sheet, $event)'
                            />
                            <TablerIconButton
                                :title='`Edit ${sheet.name}`'
                                @click='openEditor(sheet)'
                            >
                                <IconPencil
                                    :size='20'
                                    stroke='1'
                                />
                            </TablerIconButton>
                            <TablerIconButton
                                :title='`Export ${sheet.name} as KMZ`'
                                @click='exportKmz(sheet)'
                            >
                                <IconDownload
                                    :size='20'
                                    stroke='1'
                                />
                            </TablerIconButton>
                            <TablerDelete
                                displaytype='icon'
                                :size='20'
                                :title='`Delete ${sheet.name}`'
                                @delete='remove(sheet)'
                            />
                        </div>
                    </StandardItem>

                    <div class='text-secondary small'>
                        Lay a sketch, scan or photo on the map like ATAK's Rubber Sheet. Images and KMZ ground overlays from ATAK or WinTAK can be added; Export gives a KMZ that ATAK and WinTAK import. Sheets stay on this device.
                    </div>
                </section>
            </div>
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
/** MenuRubberSheets - images laid on the map by their corners, as ATAK's Rubber Sheet tool */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import MenuTemplate from '../util/MenuTemplate.vue';
import StandardItem from '../util/StandardItem.vue';
import RubberSheets, { type RubberSheet } from '../../../base/rubber-sheets.ts';
import {
    moveQuad,
    placeImage,
    quadCenter,
    quadFromControlPoints,
    quadRotation,
    quadSize,
    rotateQuad,
    scaleQuad,
    toMercator,
    type LngLat,
    type Pixel,
} from '../../../utils/rubbersheet.ts';
import { lv95ToLngLat, parseLv95 } from '../../../utils/lv95.ts';
import { formatCoordPair, parseCoordPair } from '../../../utils/coordinateFormat.ts';
import { useMapStore } from '../../../stores/map.ts';
import {
    TablerDelete,
    TablerIconButton,
    TablerInput,
    TablerLoading,
    TablerNone,
    TablerRange,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import {
    IconCheck,
    IconCrosshair,
    IconDownload,
    IconFocusCentered,
    IconPencil,
    IconPhoto,
    IconPlus,
    IconZoomIn,
} from '@tabler/icons-vue';

interface ControlPoint {
    pixel?: Pixel;
    map?: LngLat;
    text: string;
    error: string;
}

const mapStore = useMapStore();

const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref('');
const error = ref('');
const thumbs = ref<Record<string, string>>({});

const selectedId = ref<string | null>(null);
const picking = ref<number | null>(null);
const points = reactive<ControlPoint[]>([newPoint(), newPoint()]);

const loaded = computed(() => RubberSheets.state.loaded);
const sheets = computed(() => RubberSheets.state.sheets);
const selected = computed(() => sheets.value.find((s) => s.id === selectedId.value));

const activeImagePoint = computed(() => points.findIndex((p) => !p.pixel));
const pointsComplete = computed(() => points.every((p) => p.pixel && p.map));

function newPoint(): ControlPoint {
    return { text: '', error: '' };
}

onMounted(async () => {
    await RubberSheets.load();
});

watch(sheets, async (list) => {
    for (const sheet of list) {
        if (thumbs.value[sheet.id]) continue;
        const url = await RubberSheets.imageUrl(sheet.id);
        if (url) thumbs.value = { ...thumbs.value, [sheet.id]: url };
    }
}, { immediate: true });

watch(selected, (sheet) => {
    if (!sheet && selectedId.value) closeEditor();
});

onBeforeUnmount(() => {
    cancelPick();
    mapStore.rubberSheet.stopEdit();
});

function sheetSummary(sheet: RubberSheet): string {
    const size = quadSize(sheet.corners);
    const km = (m: number) => m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
    const rotation = quadRotation(sheet.corners);
    return `${km(size.width)} × ${km(size.height)}${rotation ? ` · ${rotation}°` : ''}`;
}

/** Ground metres across the smaller side of the visible map */
function viewSpan(): number {
    const map = mapStore.map;
    const b = map.getBounds();
    const c = map.getCenter();
    const w = toMercator([b.getWest(), c.lat]), e = toMercator([b.getEast(), c.lat]);
    const n = toMercator([c.lng, b.getNorth()]), s = toMercator([c.lng, b.getSouth()]);
    return Math.min(Math.abs(e[0] - w[0]), Math.abs(n[1] - s[1])) * Math.cos(c.lat * Math.PI / 180);
}

function mapCentre(): LngLat {
    const c = mapStore.map.getCenter();
    return [c.lng, c.lat];
}

function pickFile(): void {
    error.value = '';
    fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    await addFile(file);
}

async function addFile(file: File): Promise<void> {
    error.value = '';

    try {
        if (file.name.toLowerCase().endsWith('.kmz')) {
            busy.value = 'Importing KMZ';
            const added = await RubberSheets.importKmz(file);
            zoomTo(added[0]);
        } else {
            busy.value = 'Loading Image';
            const center = mapCentre();
            const span = viewSpan() * 0.6;
            const sheet = await RubberSheets.importImage(file, (w, h) => placeImage(w, h, center, span));
            await mapStore.rubberSheet.settled();
            openEditor(sheet);
        }
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        busy.value = '';
    }
}

function zoomTo(sheet: RubberSheet | undefined): void {
    if (!sheet) return;

    const lngs = sheet.corners.map((c) => c[0]), lats = sheet.corners.map((c) => c[1]);
    mapStore.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, maxZoom: 18 });
}

function openEditor(sheet: RubberSheet): void {
    cancelPick();
    resetPoints();
    selectedId.value = sheet.id;

    if (!sheet.visible) {
        void RubberSheets.update(sheet.id, { visible: true }).then(() => mapStore.rubberSheet.settled()).then(() => mapStore.rubberSheet.edit(sheet.id));
    } else {
        mapStore.rubberSheet.edit(sheet.id);
    }
}

function closeEditor(): void {
    cancelPick();
    mapStore.rubberSheet.stopEdit();
    selectedId.value = null;
}

let renameTimer: ReturnType<typeof setTimeout> | null = null;
function rename(value: string | number): void {
    const sheet = selected.value;
    if (!sheet) return;

    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = setTimeout(() => {
        void RubberSheets.update(sheet.id, { name: String(value) });
    }, 400);
}

async function setOpacity(percent: number): Promise<void> {
    if (!selected.value) return;
    await RubberSheets.update(selected.value.id, { opacity: Number(percent) / 100 });
}

async function setVisible(sheet: RubberSheet, visible: boolean): Promise<void> {
    if (!visible && selectedId.value === sheet.id) closeEditor();
    await RubberSheets.update(sheet.id, { visible });
}

async function transform(kind: 'rotate' | 'scale', step: number): Promise<void> {
    const sheet = selected.value;
    if (!sheet) return;

    const corners = kind === 'rotate'
        ? rotateQuad(sheet.corners, step)
        : scaleQuad(sheet.corners, 1 + step / 100);

    await RubberSheets.update(sheet.id, { corners });
}

async function toMapCentre(): Promise<void> {
    const sheet = selected.value;
    if (!sheet) return;

    await RubberSheets.update(sheet.id, { corners: moveQuad(sheet.corners, quadCenter(sheet.corners), mapCentre()) });
}

async function remove(sheet: RubberSheet): Promise<void> {
    if (selectedId.value === sheet.id) closeEditor();
    await RubberSheets.remove(sheet.id);

    const next = { ...thumbs.value };
    delete next[sheet.id];
    thumbs.value = next;
}

async function exportKmz(sheet: RubberSheet): Promise<void> {
    error.value = '';

    try {
        const { name, kmz } = await RubberSheets.exportKmz(sheet.id);
        const url = URL.createObjectURL(kmz);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    }
}

function pointStyle([px, py]: Pixel): Record<string, string> {
    const sheet = selected.value;
    if (!sheet) return {};

    return { left: `${px / sheet.width * 100}%`, top: `${py / sheet.height * 100}%` };
}

function pickImagePoint(event: MouseEvent): void {
    const sheet = selected.value;
    const img = event.currentTarget as HTMLImageElement;
    if (!sheet || !img.clientWidth) return;

    const i = activeImagePoint.value === -1 ? 1 : activeImagePoint.value;
    points[i].pixel = [
        event.offsetX / img.clientWidth * sheet.width,
        event.offsetY / img.clientHeight * sheet.height
    ];
}

/** Map position of typed coordinates: LV95 first, then MGRS, UTM or degrees */
function parseMapPoint(text: string): LngLat {
    const lv95 = parseLv95(text);
    if (lv95) return lv95ToLngLat(lv95[0], lv95[1]);

    const [lat, lng] = parseCoordPair(text);
    return [lng, lat];
}

function setMapPointFromText(i: number): void {
    const point = points[i];
    point.error = '';

    if (!point.text.trim()) return;

    try {
        point.map = parseMapPoint(point.text);
    } catch {
        point.error = 'Not a coordinate (MGRS, LV95 or lat, lon)';
    }
}

function onMapPick(e: { lngLat: { lng: number; lat: number } }): void {
    const i = picking.value;
    picking.value = null;
    mapStore.map.getCanvas().style.cursor = '';
    if (i === null) return;

    points[i].map = [e.lngLat.lng, e.lngLat.lat];
    points[i].text = '';
    points[i].error = '';
}

function pickMapPoint(i: number): void {
    cancelPick();
    picking.value = i;
    mapStore.map.getCanvas().style.cursor = 'crosshair';
    mapStore.map.once('click', onMapPick);
}

function cancelPick(): void {
    if (picking.value === null) return;
    picking.value = null;
    mapStore.map.getCanvas().style.cursor = '';
    mapStore.map.off('click', onMapPick);
}

function resetPoints(): void {
    points.splice(0, points.length, newPoint(), newPoint());
}

async function applyControlPoints(): Promise<void> {
    const sheet = selected.value;
    const [a, b] = points;
    if (!sheet || !a.pixel || !b.pixel || !a.map || !b.map) return;

    const corners = quadFromControlPoints(sheet.width, sheet.height, a.pixel, b.pixel, a.map, b.map);
    if (!corners) {
        error.value = 'The two points must differ on the image and on the map';
        return;
    }

    error.value = '';
    await RubberSheets.update(sheet.id, { corners });
    zoomTo(RubberSheets.get(sheet.id));
}
</script>

<style scoped>
.rubber-sheet-preview {
    max-height: 22rem;
    overflow: auto;
}

.rubber-sheet-point {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    border: 2px solid #ffffff;
    background: #e91e8c;
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.1rem;
    text-align: center;
    pointer-events: none;
}

.rubber-sheet-row--selected {
    outline: 2px solid var(--tblr-primary);
}
</style>
