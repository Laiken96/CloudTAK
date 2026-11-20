/**
 * Map layers of the tactical graphics, added to every CoT source's style
 * (utils/styles.ts). The drawn line or area of a tactical graphic is not
 * styled by the generic layers - everything is drawn from its derived
 * features (derive.ts), one layer per kind.
 */
import type {
    ExpressionSpecification,
    FilterSpecification,
    LayerSpecification,
} from 'maplibre-gl';
import { CHSIG_PROPERTY } from './model.ts';
import { DERIVED_TACTICAL, type DerivedKind } from './derive.ts';

const FONT = ['Open Sans Bold'];

const MIN_MAX: ExpressionSpecification[] = [
    ['any', ['!', ['has', 'maxzoom']], ['<=', ['zoom'], ['get', 'maxzoom']]],
    ['any', ['!', ['has', 'minzoom']], ['<=', ['get', 'minzoom'], ['zoom']]],
];

/** Generic layers that must leave tactical graphics to the layers below */
const GENERIC_SHAPE_LAYERS = ['poly', 'polyline', 'line', 'text-line', 'text-poly'];

/** Generic layers that must not draw derived points (arrow heads, labels …) */
const GENERIC_POINT_LAYERS = ['', 'icon', 'course', 'group', 'text-point'];

function kind(k: DerivedKind, ...more: ExpressionSpecification[]): FilterSpecification {
    return ['all', ['==', ['get', 'derived'], DERIVED_TACTICAL], ['==', ['get', 'tgk'], k], ...more, ...MIN_MAX];
}

function withCondition(filter: FilterSpecification | undefined, condition: ExpressionSpecification): FilterSpecification {
    if (!filter) return condition;
    if (Array.isArray(filter) && filter[0] === 'all') return [...filter, condition] as FilterSpecification;
    return ['all', filter as ExpressionSpecification, condition];
}

const DASH: ExpressionSpecification = [
    'case',
    ['==', ['get', 'dash'], 'dashed'], ['literal', [3, 2]],
    ['==', ['get', 'dash'], 'dotted'], ['literal', [0.1, 2]],
    ['literal', [1, 0]],
];

/** The tactical graphic layers of one source */
export function tacticalLayers(id: string, sourceLayer?: string): LayerSpecification[] {
    const layers: LayerSpecification[] = [{
        id: `${id}-tg-fill`,
        type: 'fill',
        source: id,
        filter: kind('fill'),
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': ['get', 'op'],
        },
    }, {
        id: `${id}-tg-fillp`,
        type: 'fill',
        source: id,
        filter: kind('fillp'),
        paint: {
            'fill-pattern': ['get', 'pat'],
        },
    }, {
        // Contrast casing under solid lines - light 2525 colours on a light map
        id: `${id}-tg-casing`,
        type: 'line',
        source: id,
        filter: kind('line', ['==', ['get', 'dash'], 'solid']),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': ['get', 'cas'],
            'line-width': ['+', ['get', 'w'], 2],
            'line-opacity': 0.6,
            'line-offset': ['get', 'off'],
        },
    }, {
        id: `${id}-tg-line`,
        type: 'line',
        source: id,
        filter: kind('line'),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'w'],
            'line-dasharray': DASH,
            'line-offset': ['get', 'off'],
        },
    }, {
        id: `${id}-tg-pattern`,
        type: 'line',
        source: id,
        filter: kind('pat'),
        layout: { 'line-join': 'round' },
        paint: {
            'line-pattern': ['get', 'pat'],
            'line-width': ['get', 'pw'],
        },
    }, {
        id: `${id}-tg-rtext`,
        type: 'symbol',
        source: id,
        filter: kind('rtext'),
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 140,
            'text-field': ['get', 'txt'],
            'text-font': FONT,
            'text-size': 13,
            'text-keep-upright': true,
            'text-allow-overlap': true,
        },
        paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': ['get', 'cas'],
            'text-halo-width': 1.4,
        },
    }, {
        id: `${id}-tg-icon`,
        type: 'symbol',
        source: id,
        filter: kind('icon'),
        layout: {
            'icon-image': ['get', 'icon'],
            'icon-rotate': ['get', 'rot'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
    }, {
        id: `${id}-tg-text-along`,
        type: 'symbol',
        source: id,
        filter: kind('tmap'),
        layout: {
            'text-field': ['get', 'txt'],
            'text-font': FONT,
            'text-size': ['get', 'size'],
            'text-rotate': ['get', 'rot'],
            'text-rotation-alignment': 'map',
            'text-offset': ['get', 'tof'],
            'text-allow-overlap': true,
        },
        paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': ['get', 'cas'],
            'text-halo-width': 1.6,
        },
    }, {
        id: `${id}-tg-text`,
        type: 'symbol',
        source: id,
        filter: kind('tview'),
        layout: {
            'text-field': ['get', 'txt'],
            'text-font': FONT,
            'text-size': ['get', 'size'],
            'text-anchor': ['get', 'anchor'],
            'text-offset': ['get', 'tof'],
            'text-allow-overlap': true,
        },
        paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': ['get', 'cas'],
            'text-halo-width': 1.6,
        },
    }];

    if (sourceLayer) {
        for (const layer of layers) {
            (layer as { 'source-layer'?: string })['source-layer'] = sourceLayer;
        }
    }

    return layers;
}

/**
 * Hook for utils/styles.ts: keep tactical graphics and their derived points
 * out of the generic layers and add the tactical layers below the point layers
 */
export function withTactical(layers: LayerSpecification[], id: string, opts: { sourceLayer?: string } = {}): LayerSpecification[] {
    const out: LayerSpecification[] = [];
    const tactical = tacticalLayers(id, opts.sourceLayer);
    let inserted = false;

    for (const layer of layers) {
        const suffix = layer.id === id ? '' : layer.id.startsWith(`${id}-`) ? layer.id.slice(id.length + 1) : undefined;

        if (suffix !== undefined && GENERIC_POINT_LAYERS.includes(suffix) && !inserted) {
            out.push(...tactical);
            inserted = true;
        }

        if (suffix !== undefined && 'filter' in layer) {
            if (GENERIC_SHAPE_LAYERS.includes(suffix)) {
                out.push({ ...layer, filter: withCondition(layer.filter, ['!', ['has', CHSIG_PROPERTY]]) } as LayerSpecification);
                continue;
            }
            if (GENERIC_POINT_LAYERS.includes(suffix)) {
                out.push({ ...layer, filter: withCondition(layer.filter, ['!', ['has', 'derived']]) } as LayerSpecification);
                continue;
            }
        }

        out.push(layer);
    }

    if (!inserted) out.push(...tactical);

    return out;
}
