import { watch, type WatchStopHandle } from 'vue';
import type * as mapgl from 'maplibre-gl';
import type { useMapStore } from '../map.ts';
import FireGrids, { FIRE_GRID_COLOR, type FireGrid } from '../../base/fire-grids.ts';
import { useFireGridTargets } from './fire-grid-targets.ts';
import {
    fireGridBounds,
    fireGridCellPolygon,
    fireGridGeoJSON,
    fireGridHash,
    zoomForLength,
    type FireGridCell,
} from '../../utils/fire-grid.ts';

export const FIRE_GRID_PREFIX = 'fire-grid-';
export const FIRE_GRID_HIGHLIGHT = 'fire-grid-highlight';

/** How long a cell found by search or lookup stays outlined [ms] */
const HIGHLIGHT_MS = 20000;

/** Layers of one grid, bottom to top */
const PARTS = ['fine', 'line', 'frame', 'cell', 'edge'] as const;

function sourceId(grid: Pick<FireGrid, 'id'>): string {
    return `${FIRE_GRID_PREFIX}${grid.id}`;
}

function layerId(grid: Pick<FireGrid, 'id'>, part: typeof PARTS[number]): string {
    return `${sourceId(grid)}-${part}`;
}

/** What a drawn grid looks like; a change redraws it */
function signature(grid: FireGrid): string {
    return fireGridHash(grid);
}

/**
 * FireGridLayer - draws the visible fire grids (Einheitsfeuerplan rasters) below
 * the map features: frame and cell lines, fine field lines and cell labels once
 * they fit on screen, and a temporary outline for a cell found by search.
 */
export default class FireGridLayer {
    mapStore: ReturnType<typeof useMapStore>;

    private drawn: Map<string, string>;
    private stop: WatchStopHandle | null;
    private timer: ReturnType<typeof setTimeout> | null;
    private initialized: boolean;

    constructor(mapStore: ReturnType<typeof useMapStore>) {
        this.mapStore = mapStore;
        this.drawn = new Map();
        this.stop = null;
        this.timer = null;
        this.initialized = false;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        // The targets of a grid are shown, hidden and deleted with it
        useFireGridTargets(this.mapStore);

        const map = this.mapStore.map;

        if (!map.getSource(FIRE_GRID_HIGHLIGHT)) {
            map.addSource(FIRE_GRID_HIGHLIGHT, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
        }

        if (!map.getLayer(`${FIRE_GRID_HIGHLIGHT}-fill`)) {
            map.addLayer({
                id: `${FIRE_GRID_HIGHLIGHT}-fill`,
                type: 'fill',
                source: FIRE_GRID_HIGHLIGHT,
                paint: { 'fill-color': '#ffd60a', 'fill-opacity': 0.35 }
            });
        }

        if (!map.getLayer(`${FIRE_GRID_HIGHLIGHT}-line`)) {
            map.addLayer({
                id: `${FIRE_GRID_HIGHLIGHT}-line`,
                type: 'line',
                source: FIRE_GRID_HIGHLIGHT,
                paint: { 'line-color': '#ffd60a', 'line-width': 3 }
            });
        }

        await FireGrids.load();
        if (!this.initialized) return;

        this.stop = watch(
            () => FireGrids.state.grids.map((g) => `${g.id}|${g.visible}|${signature(g)}`).join(';'),
            () => this.sync(),
            { immediate: true }
        );
    }

    /** Add, redraw or remove grids to match the stored list */
    sync(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const wanted = new Map<string, FireGrid>();
        for (const grid of FireGrids.state.grids) {
            if (grid.visible) wanted.set(grid.id, grid);
        }

        for (const [id, sig] of this.drawn) {
            const grid = wanted.get(id);
            if (!grid || signature(grid) !== sig) this.removeGrid(map, id);
        }

        for (const grid of wanted.values()) {
            if (!this.drawn.has(grid.id)) this.addGrid(map, grid);
        }

        this.restack();
    }

    private addGrid(map: mapgl.Map, grid: FireGrid): void {
        const source = sourceId(grid);

        map.addSource(source, { type: 'geojson', data: fireGridGeoJSON(grid) });

        map.addLayer({
            id: layerId(grid, 'fine'),
            type: 'line',
            source,
            minzoom: zoomForLength(grid.z / 3, 24),
            filter: ['==', ['get', 'kind'], 'fine'],
            paint: { 'line-color': FIRE_GRID_COLOR, 'line-width': 0.75, 'line-opacity': 0.55, 'line-dasharray': [3, 3] }
        });

        map.addLayer({
            id: layerId(grid, 'line'),
            type: 'line',
            source,
            filter: ['==', ['get', 'kind'], 'line'],
            paint: { 'line-color': FIRE_GRID_COLOR, 'line-width': 1.25, 'line-opacity': 0.9 }
        });

        map.addLayer({
            id: layerId(grid, 'frame'),
            type: 'line',
            source,
            filter: ['==', ['get', 'kind'], 'frame'],
            paint: { 'line-color': FIRE_GRID_COLOR, 'line-width': 2.5 }
        });

        const label = (size: number): mapgl.SymbolLayerSpecification['layout'] => ({
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Bold'],
            'text-size': size,
            'text-allow-overlap': false,
        });

        const halo: mapgl.SymbolLayerSpecification['paint'] = {
            'text-color': FIRE_GRID_COLOR,
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
        };

        map.addLayer({
            id: layerId(grid, 'cell'),
            type: 'symbol',
            source,
            minzoom: zoomForLength(grid.z, 40),
            filter: ['==', ['get', 'kind'], 'cell'],
            layout: label(12),
            paint: { ...halo, 'text-opacity': 0.85 }
        });

        map.addLayer({
            id: layerId(grid, 'edge'),
            type: 'symbol',
            source,
            minzoom: zoomForLength(grid.z, 16),
            filter: ['==', ['get', 'kind'], 'edge'],
            layout: label(13),
            paint: halo
        });

        this.drawn.set(grid.id, signature(grid));
    }

    private removeGrid(map: mapgl.Map, id: string): void {
        for (const part of PARTS) {
            const layer = layerId({ id }, part);
            if (map.getLayer(layer)) map.removeLayer(layer);
        }

        if (map.getSource(sourceId({ id }))) map.removeSource(sourceId({ id }));
        this.drawn.delete(id);
    }

    /** Layer ids of the drawn grids and the highlight, bottom to top */
    layerIds(): string[] {
        const ids: string[] = [];
        for (const id of this.drawn.keys()) {
            for (const part of PARTS) ids.push(layerId({ id }, part));
        }

        ids.push(`${FIRE_GRID_HIGHLIGHT}-fill`, `${FIRE_GRID_HIGHLIGHT}-line`);
        return ids;
    }

    /** Keep the grids below the map features and their history trails */
    restack(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const order = map.getLayersOrder();
        const anchor = order.find((id) => id.startsWith('cloudtak-history'))
            ?? order.find((id) => id === '-1' || id.startsWith('-1-'));
        if (!anchor) return;

        for (const id of this.layerIds()) {
            if (map.getLayer(id)) map.moveLayer(id, anchor);
        }
    }

    /** Outline a cell or fine field for a moment */
    highlight(grid: FireGrid, cell: FireGridCell): void {
        if (!this.initialized) return;

        const source = this.mapStore.map.getSource(FIRE_GRID_HIGHLIGHT) as mapgl.GeoJSONSource | undefined;
        if (!source) return;

        source.setData({ type: 'FeatureCollection', features: [fireGridCellPolygon(grid, cell)] });

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.clearHighlight(), HIGHLIGHT_MS);
    }

    clearHighlight(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;

        if (!this.initialized) return;
        const source = this.mapStore.map.getSource(FIRE_GRID_HIGHLIGHT) as mapgl.GeoJSONSource | undefined;
        source?.setData({ type: 'FeatureCollection', features: [] });
    }

    /** Show a whole grid */
    fitGrid(grid: FireGrid): void {
        this.mapStore.map.fitBounds(fireGridBounds(grid), { padding: 40, maxZoom: 16 });
    }

    destroy(): void {
        if (this.stop) this.stop();
        this.stop = null;

        if (this.timer) clearTimeout(this.timer);
        this.timer = null;

        if (!this.initialized) return;
        this.initialized = false;

        const map = this.mapStore._map as mapgl.Map | undefined;
        if (!map) {
            this.drawn.clear();
            return;
        }

        try {
            for (const id of Array.from(this.drawn.keys())) this.removeGrid(map, id);

            for (const id of [`${FIRE_GRID_HIGHLIGHT}-fill`, `${FIRE_GRID_HIGHLIGHT}-line`]) {
                if (map.getLayer(id)) map.removeLayer(id);
            }

            if (map.getSource(FIRE_GRID_HIGHLIGHT)) map.removeSource(FIRE_GRID_HIGHLIGHT);
        } catch (err) {
            console.error('Failed to remove fire grid layers', err);
        }
    }
}
