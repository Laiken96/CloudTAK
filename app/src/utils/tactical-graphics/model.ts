/**
 * Tactical graphics (line & area signatures) of the Swiss Army regulation
 * 52.003 "Signaturen" - the data model shared by the map worker (rendering)
 * and the UI (drawing & editing).
 *
 * A tactical graphic is an ordinary line or polygon Feature (CoT `u-d-f`)
 * carrying the `chsig` property. It travels as the `<__chsig …/>` CoT detail,
 * passed through unchanged by the patched node-cot in xml-js compact form:
 * `{ _attributes: { sig, t, t1, ech, aff, planned, width } }`. ATAK keeps
 * unknown details as opaque details and sends them back on re-share.
 */

/** 2525 standard identity, as the second character of a 2525C SIDC */
export type Affiliation = 'f' | 'h' | 'n' | 'u';

export const AFFILIATIONS: Affiliation[] = ['f', 'h', 'n', 'u'];

export interface TacticalModel {
    /** Signature key - see catalog.ts */
    sig: string;
    /** Designation, eg the name of a phase line or the unit left of a boundary */
    t?: string;
    /** Second designation, eg the unit right of a boundary */
    t1?: string;
    /** Echelon of a boundary as 2525C echelon letter (D … K) */
    ech?: string;
    /** Standard identity - decides the colour and the 2525C SIDC */
    aff?: Affiliation;
    /** Planned (dashed) rather than executed (solid), regulation 1.3 */
    planned?: boolean;
    /** Width in metres of broad arrows, corridors & zones */
    width?: number;
}

/** Feature property holding the `__chsig` detail */
export const CHSIG_PROPERTY = 'chsig';

/**
 * Hierarchy signs of regulation 3.1 with their 2525C echelon letter
 * (position 12 of a tactical graphic SIDC), highest first
 */
export const ECHELONS: Array<{ code: string; sign: string }> = [
    { code: 'K', sign: 'XXXX' },
    { code: 'J', sign: 'XXX' },
    { code: 'I', sign: 'XX' },
    { code: 'H', sign: 'X' },
    { code: 'G', sign: 'III' },
    { code: 'F', sign: 'II' },
    { code: 'E', sign: 'I' },
    { code: 'D', sign: '●●●' },
];

export function echelonSign(code: string | undefined): string | undefined {
    return ECHELONS.find((e) => e.code === code)?.sign;
}

function attributesOf(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const attrs = (value as Record<string, unknown>)._attributes;
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined;
    return attrs as Record<string, unknown>;
}

function text(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * The tactical graphic a Feature's properties describe, if any. Values arrive
 * from the wire as strings (XML attributes) and are validated here
 */
export function tacticalOf(properties: Record<string, unknown> | undefined): TacticalModel | undefined {
    if (!properties) return undefined;

    const raw = properties[CHSIG_PROPERTY];
    const attrs = attributesOf(Array.isArray(raw) ? raw[0] : raw);
    if (!attrs) return undefined;

    const sig = text(attrs.sig);
    if (!sig) return undefined;

    const model: TacticalModel = { sig };

    const t = text(attrs.t);
    if (t) model.t = t;
    const t1 = text(attrs.t1);
    if (t1) model.t1 = t1;

    const ech = text(attrs.ech);
    if (ech && ECHELONS.some((e) => e.code === ech)) model.ech = ech;

    const aff = text(attrs.aff);
    if (aff && (AFFILIATIONS as string[]).includes(aff)) model.aff = aff as Affiliation;

    if (attrs.planned === true || attrs.planned === 'true') model.planned = true;

    const width = Number(attrs.width);
    if (attrs.width !== undefined && Number.isFinite(width) && width > 0) model.width = width;

    return model;
}

/** Is the Feature a tactical graphic */
export function isTactical(properties: Record<string, unknown> | undefined): boolean {
    return !!tacticalOf(properties);
}

/**
 * The `chsig` property value (xml-js compact form) for a model. Attributes
 * other than the model's are kept so a newer client's additions survive
 */
export function chsigOf(model: TacticalModel, previous?: unknown): Record<string, unknown> {
    const kept = { ...(attributesOf(Array.isArray(previous) ? previous[0] : previous) ?? {}) };

    for (const key of ['sig', 't', 't1', 'ech', 'aff', 'planned', 'width']) delete kept[key];

    const attrs: Record<string, string> = { sig: model.sig };
    if (model.t) attrs.t = model.t;
    if (model.t1) attrs.t1 = model.t1;
    if (model.ech) attrs.ech = model.ech;
    if (model.aff) attrs.aff = model.aff;
    if (model.planned) attrs.planned = 'true';
    if (model.width && model.width > 0) attrs.width = String(Math.round(model.width));

    return { _attributes: { ...kept, ...attrs } };
}

/**
 * Map label prefixes - the one place the regulation abbreviations live.
 * The full names of the three areas without an agreed abbreviation are used
 * until one is decided (change the value here, nothing else)
 */
export const PREFIXES = {
    phaseLine: 'PhL',
    lineOfDeparture: 'AL',
    fireCoordinationLine: 'FKL',
    patientCollectingLine: 'Pat SaL',
    evacuate: 'EVAC',
    readinessArea: 'BERRM',
    assemblyArea: 'BSTELRM',
    attackPosition: 'AGS',
    intermediateObjective: 'ZZ',
    objective: 'AZ',
    minedArea: 'M',
    explosiveOrdnance: 'EO',
} as const;

/** Map label text: prefix and designation */
export function labelText(prefix: string | undefined, model: TacticalModel): string {
    return [prefix, model.t].filter((part) => !!part).join(' ');
}
