/**
 * Render-only features of a tactical graphic, computed in the map worker
 * from the drawn line or area (see base/cot/derived.ts).
 *
 * Everything with a size in pixels - arcs, ticks, arrow heads, symbols and
 * labels - is a point or a line pattern placed on the map, so it keeps its
 * size when zooming and needs no recomputation. Only graphics that stand for
 * ground (broad arrows, corridors, brackets) are built in metres.
 */
import pointOnFeature from '@turf/point-on-feature';
import type { Feature as GeoJSONFeature, Geometry, Position } from 'geojson';
import type { Feature } from '../../types.ts';
import { tacticalOf, type TacticalModel } from './model.ts';
import { spriteId, casingColor, hexColor } from './sprite-id.ts';
import {
    plane, dedupe, length, along, spriteRotation,
    type Plane, type XY, type Along,
} from './geometry.ts';
import { RECIPES } from './recipes/index.ts';
import { SPRITES } from './sprites.ts';

export const DERIVED_TACTICAL = 'tg';

/** Default colour when a tactical graphic carries no stroke */
export const DEFAULT_COLOR = '#80e0ff';

export type DerivedFeature = GeoJSONFeature<Geometry, Record<string, unknown>>;

export type Dash = 'solid' | 'dashed' | 'dotted';

/** Kinds of derived features, each drawn by its own map layer (styles.ts) */
export type DerivedKind = 'fill' | 'fillp' | 'line' | 'pat' | 'icon' | 'tmap' | 'tview' | 'rtext';

export type Recipe = (c: RenderContext) => void;

/** Upright rotation for text: never upside down, flag whether it flipped */
function upright(rotation: number): { rot: number; flipped: boolean } {
    const r = ((rotation % 360) + 360) % 360;
    return r > 90 && r < 270 ? { rot: r - 180, flipped: true } : { rot: r, flipped: false };
}

export class RenderContext {
    readonly feature: Feature;
    readonly model: TacticalModel;
    readonly color: string;
    readonly casing: string;
    readonly width: number;
    readonly plane: Plane;
    /** The drawn line, or the outer ring of the drawn area (closed) */
    readonly pts: XY[];
    readonly isArea: boolean;

    readonly out: DerivedFeature[] = [];

    private readonly vectorId: (id: string) => number;

    constructor(feature: Feature, model: TacticalModel, vectorId: (id: string) => number) {
        this.feature = feature;
        this.model = model;
        this.vectorId = vectorId;

        this.color = `#${hexColor(feature.properties.stroke) ?? DEFAULT_COLOR.slice(1)}`;
        this.casing = casingColor(this.color);

        const width = Number(feature.properties['stroke-width']);
        this.width = Number.isFinite(width) && width > 0 ? Math.min(width, 8) : 3;

        const coords = coordinatesOf(feature.geometry);
        this.isArea = feature.geometry.type === 'Polygon';
        this.plane = plane(coords[0] ?? [0, 0]);
        this.pts = dedupe(coords.map((p) => this.plane.toXY(p)));
    }

    get planned(): boolean { return !!this.model.planned; }

    /** Dash of the main outline - regulation 1.3: planned is dashed */
    get dash(): Dash { return this.planned ? 'dashed' : 'solid'; }

    get total(): number { return length(this.pts); }

    at(d: number): Along { return along(this.pts, d); }

    get start(): Along { return along(this.pts, 0); }

    get end(): Along { return along(this.pts, this.total); }

    get mid(): Along { return along(this.pts, this.total / 2); }

    sprite(name: string, color = this.color): string {
        return spriteId(name, color);
    }

    rotation(dir: XY): number {
        return spriteRotation([0, 0], dir);
    }

    private push(kind: DerivedKind, geometry: Geometry, props: Record<string, unknown>): void {
        const n = this.out.length;
        const feature: DerivedFeature = {
            id: this.vectorId(`${this.feature.id}.${DERIVED_TACTICAL}.${n}`),
            type: 'Feature',
            properties: {
                id: this.feature.id,
                path: this.feature.path || '/',
                derived: DERIVED_TACTICAL,
                tgk: kind,
                ...props,
            },
            geometry,
        };

        for (const key of ['minzoom', 'maxzoom']) {
            if (this.feature.properties[key] !== undefined) feature.properties[key] = this.feature.properties[key];
        }

        this.out.push(feature);
    }

    private lineGeometry(xy: XY[]): Geometry {
        return { type: 'LineString', coordinates: xy.map((p) => this.plane.toLonLat(p)) };
    }

    private pointGeometry(p: XY): Geometry {
        return { type: 'Point', coordinates: this.plane.toLonLat(p) };
    }

    /** A stroked line; `off` shifts it sideways in pixels (positive right) */
    line(xy: XY[], o: { dash?: Dash; width?: number; color?: string; off?: number } = {}): void {
        if (xy.length < 2) return;
        const color = o.color ?? this.color;
        this.push('line', this.lineGeometry(xy), {
            color,
            cas: casingColor(color),
            w: o.width ?? this.width,
            dash: o.dash ?? 'solid',
            off: o.off ?? 0,
        });
    }

    /** The drawn line or area outline itself */
    outline(dash: Dash = this.dash): void {
        this.line(this.pts, { dash });
    }

    fill(ring: XY[], o: { color?: string; opacity?: number } = {}): void {
        if (ring.length < 4) return;
        this.push('fill', { type: 'Polygon', coordinates: [ring.map((p) => this.plane.toLonLat(p))] }, {
            color: o.color ?? this.color,
            op: o.opacity ?? 0.35,
        });
    }

    fillPattern(ring: XY[], name: string, color = this.color): void {
        if (ring.length < 4) return;
        this.push('fillp', { type: 'Polygon', coordinates: [ring.map((p) => this.plane.toLonLat(p))] }, {
            pat: this.sprite(name, color),
        });
    }

    /** A line drawn with a repeating sprite (the line is as wide as the sprite is high) */
    pattern(xy: XY[], name: string, color = this.color): void {
        if (xy.length < 2) return;
        this.push('pat', this.lineGeometry(xy), { pat: this.sprite(name, color), pw: SPRITES[name]?.h ?? 16 });
    }

    /** A sprite drawn along +x, turned to `rotation` (see spriteRotation) */
    icon(p: XY, name: string, rotation = 0, color = this.color): void {
        this.push('icon', this.pointGeometry(p), { icon: this.sprite(name, color), rot: rotation });
    }

    /**
     * Text turned with the line it belongs to, kept upright. `oy` moves it
     * across the line in ems, negative to the left of the direction of travel
     */
    textAlong(p: XY, txt: string, rotation: number, o: { oy?: number; size?: number; color?: string } = {}): void {
        if (!txt) return;
        const color = o.color ?? this.color;
        const { rot, flipped } = upright(rotation);
        const oy = o.oy ?? 0;
        this.push('tmap', this.pointGeometry(p), {
            txt, rot, color, cas: casingColor(color),
            size: o.size ?? 13,
            tof: [0, flipped ? -oy : oy],
        });
    }

    /** Text facing the reader, anchored at a point */
    text(p: XY, txt: string, o: { anchor?: string; ox?: number; oy?: number; size?: number; color?: string } = {}): void {
        if (!txt) return;
        const color = o.color ?? this.color;
        this.push('tview', this.pointGeometry(p), {
            txt, color, cas: casingColor(color),
            size: o.size ?? 13,
            anchor: o.anchor ?? 'center',
            tof: [o.ox ?? 0, o.oy ?? 0],
        });
    }

    /** Text repeated along a line (`M` of a mined area) */
    repeatText(xy: XY[], txt: string, o: { spacing?: number; color?: string } = {}): void {
        if (xy.length < 2 || !txt) return;
        const color = o.color ?? this.color;
        this.push('rtext', this.lineGeometry(xy), {
            txt, color, cas: casingColor(color), sp: o.spacing ?? 160,
        });
    }

    /** A point inside the drawn area for its label or symbol */
    inside(): XY {
        if (!this.isArea) return this.mid.point;
        try {
            return this.plane.toXY(pointOnFeature(this.feature.geometry as Geometry).geometry.coordinates);
        } catch {
            return this.mid.point;
        }
    }
}

function coordinatesOf(geometry: Geometry): Position[] {
    if (geometry.type === 'LineString') return geometry.coordinates;
    if (geometry.type === 'Polygon') return geometry.coordinates[0] ?? [];
    return [];
}

/** Plain outline with the designation - for signatures this version does not know */
const FALLBACK: Recipe = (c) => {
    c.outline();
    if (c.model.t) {
        if (c.isArea) c.text(c.inside(), c.model.t);
        else c.textAlong(c.mid.point, c.model.t, c.rotation(c.mid.dir), { oy: -1.1 });
    }
};

/**
 * Derived features of a tactical graphic Feature - empty for anything else
 */
export function tacticalDerived(feature: Feature, vectorId: (id: string) => number): DerivedFeature[] {
    if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'Polygon') return [];

    const model = tacticalOf(feature.properties);
    if (!model) return [];

    const c = new RenderContext(feature, model, vectorId);
    if (c.pts.length < 2) return [];

    const recipe = RECIPES[model.sig] ?? FALLBACK;

    try {
        recipe(c);
        return c.out;
    } catch (err) {
        console.error('Tactical graphic could not be drawn', model.sig, err);
        const plain = new RenderContext(feature, model, vectorId);
        FALLBACK(plain);
        return plain.out;
    }
}
