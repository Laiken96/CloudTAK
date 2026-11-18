import { watch, type WatchStopHandle } from 'vue';
import type * as mapgl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { useMapStore } from '../map.ts';
import GridLines from '../../base/grid-lines.ts';
import { FIRE_GRID_PREFIX } from './fire-grid.ts';
import {
    edgeLabels,
    graticule,
    graticuleStep,
    metersPerPixel,
    mgrsGrid,
    mgrsSquareLabels,
    padBounds,
    squareCornerLabel,
    type Grid,
    type GridLabel,
    type GridLine,
    type LngLat,
} from '../../utils/grid-lines.ts';

export const GRID_LINES_SOURCE = 'grid-lines';
export const GRID_LINES_EDGE_SOURCE = 'grid-lines-edge';

/** Layers bottom to top */
export const GRID_LINES_LAYERS = ['grid-lines-casing', 'grid-lines-line', 'grid-lines-label', 'grid-lines-edge'];

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Share of the view added on every side, so a short pan does not show the grid's edge */
const PAD = 0.5;

export function gridGeoJSON(grid: Grid): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: [
            ...grid.lines.map((line) => ({
                type: 'Feature' as const,
                properties: { kind: line.kind },
                geometry: { type: 'LineString' as const, coordinates: line.coords }
            })),
            ...grid.labels.map((label) => ({
                type: 'Feature' as const,
                properties: { kind: label.kind, text: label.text },
                geometry: { type: 'Point' as const, coordinates: label.at }
            }))
        ]
    };
}

/**
 * GridLinesLayer - draws the grid lines chosen under Menu > Grid Lines, as ATAK
 * does: coloured lines with a dark casing above the basemap and the overlays,
 * below fire grids and map features. The grid is recomputed when the map comes
 * to rest; the line labels follow the screen edges while it moves.
 */
export default class GridLinesLayer {
    mapStore: ReturnType<typeof useMapStore>;

    private stop: WatchStopHandle | null;
    private lines: GridLine[];
    private labels: GridLabel[];
    /** Name the square in the screen corner (MGRS with squares drawn) */
    private corner: boolean;
    private frame: number | null;
    private initialized: boolean;

    private readonly onMoveEnd = (): void => this.update();

    private readonly onMove = (): void => {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.updateEdges();
        });
    };

    constructor(mapStore: ReturnType<typeof useMapStore>) {
        this.mapStore = mapStore;
        this.stop = null;
        this.lines = [];
        this.labels = [];
        this.corner = false;
        this.frame = null;
        this.initialized = false;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        const map = this.mapStore.map;
        const color = GridLines.state.color;

        for (const id of [GRID_LINES_SOURCE, GRID_LINES_EDGE_SOURCE]) {
            if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
        }

        const layers: mapgl.LayerSpecification[] = [{
            id: 'grid-lines-casing',
            type: 'line',
            source: GRID_LINES_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            layout: { visibility: 'none' },
            paint: {
                'line-color': '#000000',
                'line-opacity': 0.55,
                'line-width': ['match', ['get', 'kind'], 'zone', 4.5, 'square', 3.5, 2.5]
            }
        }, {
            id: 'grid-lines-line',
            type: 'line',
            source: GRID_LINES_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            layout: { visibility: 'none' },
            paint: {
                'line-color': color,
                'line-width': ['match', ['get', 'kind'], 'zone', 2.5, 'square', 1.75, 1]
            }
        }, {
            id: 'grid-lines-label',
            type: 'symbol',
            source: GRID_LINES_SOURCE,
            filter: ['==', ['geometry-type'], 'Point'],
            layout: {
                visibility: 'none',
                'text-field': ['get', 'text'],
                'text-font': ['Open Sans Bold'],
                'text-size': ['match', ['get', 'kind'], 'zone', 16, 13],
                'text-anchor': ['match', ['get', 'kind'], 'square', 'bottom-left', 'center']
            },
            paint: {
                'text-color': color,
                'text-halo-color': 'rgba(0, 0, 0, 0.85)',
                'text-halo-width': 1.5
            }
        }, {
            id: 'grid-lines-edge',
            type: 'symbol',
            source: GRID_LINES_EDGE_SOURCE,
            layout: {
                visibility: 'none',
                'text-field': ['get', 'text'],
                'text-font': ['Open Sans Bold'],
                'text-size': 12,
                'symbol-sort-key': ['get', 'priority'],
                'text-anchor': ['match', ['get', 'anchor'], 'left', 'left', 'bottom-left', 'bottom-left', 'top'],
                'text-padding': 1
            },
            paint: {
                'text-color': color,
                'text-halo-color': 'rgba(0, 0, 0, 0.85)',
                'text-halo-width': 1.5
            }
        }];

        for (const layer of layers) {
            if (!map.getLayer(layer.id)) map.addLayer(layer);
        }

        await GridLines.load();
        if (!this.initialized) return;

        map.on('moveend', this.onMoveEnd);
        map.on('move', this.onMove);

        this.stop = watch(
            () => `${GridLines.state.visible}|${GridLines.state.type}|${GridLines.state.color}`,
            () => this.apply(),
            { immediate: true }
        );

        this.restack();
    }

    /** Show or hide the grid and colour it as set */
    apply(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;
        const { visible, color } = GridLines.state;

        for (const id of GRID_LINES_LAYERS) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }

        if (map.getLayer('grid-lines-line')) map.setPaintProperty('grid-lines-line', 'line-color', color);
        for (const id of ['grid-lines-label', 'grid-lines-edge']) {
            if (map.getLayer(id)) map.setPaintProperty(id, 'text-color', color);
        }

        this.update();
    }

    /** Recompute the grid for the current view */
    update(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const source = map.getSource(GRID_LINES_SOURCE) as mapgl.GeoJSONSource | undefined;
        if (!source) return;

        if (!GridLines.state.visible) {
            this.lines = [];
            this.labels = [];
            source.setData(EMPTY);
            (map.getSource(GRID_LINES_EDGE_SOURCE) as mapgl.GeoJSONSource | undefined)?.setData(EMPTY);
            return;
        }

        const b = map.getBounds();
        const view = padBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, PAD);
        const lat = map.getCenter().lat;
        const mpp = metersPerPixel(map.getZoom(), lat);
        const type = GridLines.state.type;

        const grid = type === 'MGRS'
            ? mgrsGrid(view, mpp)
            : graticule(view, type, graticuleStep(type, mpp, lat));

        this.lines = grid.lines;
        this.labels = grid.labels;
        this.corner = type === 'MGRS' && mgrsSquareLabels(mpp);
        source.setData(gridGeoJSON(grid));
        this.updateEdges();
    }

    /** Move the line labels to where the lines now enter the screen */
    updateEdges(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const source = map.getSource(GRID_LINES_EDGE_SOURCE) as mapgl.GeoJSONSource | undefined;
        if (!source) return;

        if (!GridLines.state.visible || !this.lines.length) {
            source.setData(EMPTY);
            return;
        }

        const canvas = map.getCanvas();
        const project = (p: LngLat): [number, number] => {
            const pt = map.project(p);
            return [pt.x, pt.y];
        };
        const unproject = (xy: [number, number]): LngLat => map.unproject(xy).toArray() as LngLat;

        const labels = edgeLabels(this.lines, project, unproject, canvas.clientWidth, canvas.clientHeight);

        if (this.corner) {
            const corner = squareCornerLabel(this.labels, project, unproject, canvas.clientWidth, canvas.clientHeight);
            if (corner) labels.push(corner);
        }

        source.setData({
            type: 'FeatureCollection',
            features: labels.map((label) => ({
                type: 'Feature',
                // The square's name wins over line numbers that would cover it
                properties: { text: label.text, anchor: label.anchor, priority: label.anchor === 'bottom-left' ? 0 : 1 },
                geometry: { type: 'Point', coordinates: label.at }
            }))
        });
    }

    /** Keep the grid above basemap, overlays and rubber sheets, below fire grids and map features */
    restack(): void {
        if (!this.initialized) return;
        const map = this.mapStore.map;

        const order = map.getLayersOrder();
        const anchor = order.find((id) => id.startsWith(FIRE_GRID_PREFIX))
            ?? order.find((id) => id.startsWith('cloudtak-history'))
            ?? order.find((id) => id === '-1' || id.startsWith('-1-'));
        if (!anchor) return;

        for (const id of GRID_LINES_LAYERS) {
            if (map.getLayer(id)) map.moveLayer(id, anchor);
        }
    }

    destroy(): void {
        if (this.stop) this.stop();
        this.stop = null;

        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;

        if (!this.initialized) return;
        this.initialized = false;
        this.lines = [];
        this.labels = [];

        const map = this.mapStore._map as mapgl.Map | undefined;
        if (!map) return;

        try {
            map.off('moveend', this.onMoveEnd);
            map.off('move', this.onMove);

            for (const id of GRID_LINES_LAYERS) {
                if (map.getLayer(id)) map.removeLayer(id);
            }

            for (const id of [GRID_LINES_SOURCE, GRID_LINES_EDGE_SOURCE]) {
                if (map.getSource(id)) map.removeSource(id);
            }
        } catch (err) {
            console.error('Failed to remove grid line layers', err);
        }
    }
}
