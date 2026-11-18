import { watch, type WatchStopHandle } from 'vue';
import * as mapgl from 'maplibre-gl';
import type { useMapStore } from '../map.ts';
import RubberSheets, { type RubberSheet } from '../../base/rubber-sheets.ts';
import { moveQuad, quadCenter, type LngLat, type Quad } from '../../utils/rubbersheet.ts';
import { FIRE_GRID_PREFIX } from './fire-grid.ts';
import { GRID_LINES_LAYERS } from './grid-lines.ts';

export const RUBBER_SHEET_PREFIX = 'rubber-sheet-';

function sourceId(id: string): string {
    return `${RUBBER_SHEET_PREFIX}${id}`;
}

function layerId(id: string): string {
    return `${RUBBER_SHEET_PREFIX}${id}-image`;
}

function handle(kind: 'corner' | 'center', title: string): HTMLElement {
    const el = document.createElement('div');
    el.title = title;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', title);
    el.className = `rubber-sheet-handle rubber-sheet-handle--${kind}`;

    const size = kind === 'corner' ? 16 : 26;
    Object.assign(el.style, {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: kind === 'corner' ? '3px' : '50%',
        border: '2px solid #ffffff',
        background: kind === 'corner' ? '#e91e8c' : 'rgba(233, 30, 140, 0.55)',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.6)',
        cursor: kind === 'corner' ? 'crosshair' : 'move',
        touchAction: 'none'
    });

    return el;
}

const CORNER_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'];

/**
 * RubberSheetLayer - draws the visible rubber sheets as image layers above the
 * basemap and below fire grids and map features. In edit mode each corner and
 * the centre get a draggable handle, as ATAK's RubberSheetEditTool offers.
 */
export default class RubberSheetLayer {
    mapStore: ReturnType<typeof useMapStore>;

    /** Sheet id -> drawn corners and opacity */
    private drawn: Map<string, { corners: string; opacity: number }>;
    private stop: WatchStopHandle | null;
    private queue: Promise<void>;
    private initialized: boolean;

    private editing: {
        id: string;
        corners: Quad;
        handles: mapgl.Marker[];
        center: mapgl.Marker;
    } | null;

    constructor(mapStore: ReturnType<typeof useMapStore>) {
        this.mapStore = mapStore;
        this.drawn = new Map();
        this.stop = null;
        this.queue = Promise.resolve();
        this.initialized = false;
        this.editing = null;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        await RubberSheets.load();
        if (!this.initialized) return;

        this.stop = watch(
            () => RubberSheets.state.sheets.map((s) => `${s.id}|${s.visible}|${s.opacity}|${JSON.stringify(s.corners)}`).join(';'),
            () => this.schedule(),
            { immediate: true }
        );
    }

    /** Apply changes one after another, image loading is asynchronous */
    private schedule(): void {
        this.queue = this.queue
            .then(() => this.sync())
            .catch((err: unknown) => console.error('Rubber sheet update failed', err));
    }

    /** Wait until every scheduled change is on the map */
    settled(): Promise<void> {
        return this.queue;
    }

    private async sync(): Promise<void> {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const wanted = new Map<string, RubberSheet>();
        for (const sheet of RubberSheets.state.sheets) {
            if (sheet.visible) wanted.set(sheet.id, sheet);
        }

        for (const id of Array.from(this.drawn.keys())) {
            if (!wanted.has(id)) this.removeSheet(map, id);
        }

        if (this.editing && !wanted.has(this.editing.id)) this.stopEdit();

        for (const sheet of wanted.values()) {
            const drawn = this.drawn.get(sheet.id);
            const corners = JSON.stringify(sheet.corners);

            if (!drawn) {
                const url = await RubberSheets.imageUrl(sheet.id);
                if (!url || !this.initialized || this.drawn.has(sheet.id)) continue;
                this.addSheet(map, sheet, url);
                continue;
            }

            if (drawn.corners !== corners) {
                (map.getSource(sourceId(sheet.id)) as mapgl.ImageSource | undefined)?.setCoordinates(sheet.corners);
                drawn.corners = corners;
                if (this.editing?.id === sheet.id) this.placeHandles(sheet.corners);
            }

            if (drawn.opacity !== sheet.opacity) {
                map.setPaintProperty(layerId(sheet.id), 'raster-opacity', sheet.opacity);
                drawn.opacity = sheet.opacity;
            }
        }

        this.restack();
    }

    private addSheet(map: mapgl.Map, sheet: RubberSheet, url: string): void {
        map.addSource(sourceId(sheet.id), {
            type: 'image',
            url,
            coordinates: sheet.corners
        });

        map.addLayer({
            id: layerId(sheet.id),
            type: 'raster',
            source: sourceId(sheet.id),
            paint: {
                'raster-opacity': sheet.opacity,
                'raster-fade-duration': 0
            }
        });

        this.drawn.set(sheet.id, { corners: JSON.stringify(sheet.corners), opacity: sheet.opacity });
    }

    private removeSheet(map: mapgl.Map, id: string): void {
        if (map.getLayer(layerId(id))) map.removeLayer(layerId(id));
        if (map.getSource(sourceId(id))) map.removeSource(sourceId(id));
        this.drawn.delete(id);
    }

    /** Keep the sheets above the basemap, below fire grids, trails and map features */
    restack(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        // Below the grid lines and fire grids, so their lines stay on top of the image
        const order = map.getLayersOrder();
        const anchor = order.find((id) => id === GRID_LINES_LAYERS[0])
            ?? order.find((id) => id.startsWith(FIRE_GRID_PREFIX))
            ?? order.find((id) => id.startsWith('cloudtak-history'))
            ?? order.find((id) => id === '-1' || id.startsWith('-1-'));
        if (!anchor) return;

        for (const sheet of RubberSheets.state.sheets) {
            if (map.getLayer(layerId(sheet.id))) map.moveLayer(layerId(sheet.id), anchor);
        }
    }

    /** Draw the sheet with the given corners right away, without storing them */
    private preview(id: string, corners: Quad): void {
        (this.mapStore.map.getSource(sourceId(id)) as mapgl.ImageSource | undefined)?.setCoordinates(corners);
    }

    private placeHandles(corners: Quad): void {
        if (!this.editing) return;

        this.editing.corners = corners;
        corners.forEach((c, i) => this.editing?.handles[i].setLngLat(c));
        this.editing.center.setLngLat(quadCenter(corners));
    }

    private commit(): void {
        if (!this.editing) return;

        const { id, corners } = this.editing;
        const drawn = this.drawn.get(id);
        if (drawn) drawn.corners = JSON.stringify(corners);

        RubberSheets.update(id, { corners }).catch((err: unknown) => {
            console.error('Failed to save rubber sheet corners', err);
        });
    }

    isEditing(id?: string): boolean {
        return id ? this.editing?.id === id : this.editing !== null;
    }

    /** Show draggable handles on the corners and the centre of a sheet */
    edit(id: string): void {
        this.stopEdit();

        const sheet = RubberSheets.get(id);
        if (!sheet || !this.initialized) return;

        const map = this.mapStore.map;

        const handles = sheet.corners.map((corner, i) => {
            const marker = new mapgl.Marker({ element: handle('corner', `Drag the ${CORNER_NAMES[i]} corner`), draggable: true })
                .setLngLat(corner)
                .addTo(map);

            marker.on('drag', () => {
                if (!this.editing) return;
                const corners = [...this.editing.corners] as Quad;
                const { lng, lat } = marker.getLngLat();
                corners[i] = [lng, lat];
                this.editing.corners = corners;
                this.editing.center.setLngLat(quadCenter(corners));
                this.preview(id, corners);
            });

            marker.on('dragend', () => this.commit());
            return marker;
        });

        const center = new mapgl.Marker({ element: handle('center', 'Drag to move the sheet'), draggable: true })
            .setLngLat(quadCenter(sheet.corners))
            .addTo(map);

        let start: { corners: Quad; at: LngLat } | null = null;

        center.on('dragstart', () => {
            if (!this.editing) return;
            start = { corners: this.editing.corners, at: quadCenter(this.editing.corners) };
        });

        center.on('drag', () => {
            if (!this.editing || !start) return;
            const { lng, lat } = center.getLngLat();
            const corners = moveQuad(start.corners, start.at, [lng, lat]);
            this.editing.corners = corners;
            corners.forEach((c, i) => this.editing?.handles[i].setLngLat(c));
            this.preview(id, corners);
        });

        center.on('dragend', () => {
            start = null;
            this.commit();
        });

        this.editing = { id, corners: sheet.corners, handles, center };
    }

    stopEdit(): void {
        if (!this.editing) return;

        for (const marker of this.editing.handles) marker.remove();
        this.editing.center.remove();
        this.editing = null;
    }

    destroy(): void {
        this.stopEdit();

        if (this.stop) this.stop();
        this.stop = null;

        if (!this.initialized) return;
        this.initialized = false;

        const map = this.mapStore._map as mapgl.Map | undefined;
        if (!map) {
            this.drawn.clear();
            return;
        }

        try {
            for (const id of Array.from(this.drawn.keys())) this.removeSheet(map, id);
        } catch (err) {
            console.error('Failed to remove rubber sheet layers', err);
        }
    }
}
