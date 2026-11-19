/**
 * MEDEVAC 9-Line request, compatible with the ATAK MedLine
 * (com.atakmap.android.medline in ATAK-CIV 5.5: MedLineView,
 * MedicalDetailHandler & GenerateReadout).
 *
 * A MEDEVAC is a Point of CoT type `b-r-f-h-c`. Its 9-Line travels in the
 * `<_medevac_ …/>` detail which (patched) node-cot surfaces unchanged as
 * `properties.medevac` in xml-js compact form: attributes in `_attributes`,
 * child elements (eg the ZMIST patient details in `zMistsMap`) as they arrived.
 *
 * Attribute names & values follow MedicalDetailHandler 1:1 - counts are
 * strings and only written when > 0, flags only when set, Line 6 & 7 are
 * the index of the selected entry.
 *
 * Data minimisation: ZMIST entries (injuries of individual patients) are
 * health data. They are never read, shown or edited here - only carried
 * along unchanged so a MEDEVAC edited in CloudTAK loses nothing ATAK sent.
 * Unknown attributes & child elements are kept the same way.
 */

export const MEDEVAC_TYPE = 'b-r-f-h-c';

/** Callsign draw.ts & the context menu give a fresh Point */
export const NEW_FEATURE_CALLSIGN = 'New Feature';

export type MedevacAttributeValue = string | number | boolean;

/** The `_medevac_` detail in xml-js compact form */
export interface MedevacDetail {
    _attributes?: Record<string, MedevacAttributeValue>;
    [element: string]: unknown;
}

// --- Option lists ----------------------------------------------------------
// `text` is the ATAK string (used verbatim in the radio readout), `label` the
// UI text - `label` is translated by the i18n script transform, `text` never

export const PRECEDENCE = [
    { key: 'urgent', letter: 'A', text: 'A - Urgent', label: 'A - Urgent' },
    { key: 'urgent_surgical', letter: 'B', text: 'B - Urgent Surgical', label: 'B - Urgent Surgical' },
    { key: 'priority', letter: 'C', text: 'C - Priority', label: 'C - Priority' },
    { key: 'routine', letter: 'D', text: 'D - Routine', label: 'D - Routine' },
    { key: 'convenience', letter: 'E', text: 'E - Convenience', label: 'E - Convenience' },
] as const;

export const EQUIPMENT = [
    { key: 'equipment_none', text: 'A - None', label: 'A - None' },
    { key: 'hoist', text: 'B - Hoist', label: 'B - Hoist' },
    { key: 'extraction_equipment', text: 'C - Extraction Equipment', label: 'C - Extraction Equipment' },
    { key: 'ventilator', text: 'D - Ventilator', label: 'D - Ventilator' },
    { key: 'equipment_other', text: 'Other (Specify)', label: 'Other (Specify)' },
] as const;

export const PATIENT_TYPE = [
    { key: 'litter', letter: 'L', text: 'Litter', label: 'L - Litter' },
    { key: 'ambulatory', letter: 'A', text: 'Ambulatory', label: 'A - Ambulatory' },
] as const;

export const SECURITY = [
    { code: 'N', text: 'N - No enemy troops in area', label: 'N - No enemy troops in area' },
    { code: 'P', text: 'P - Possible enemy troops in area', label: 'P - Possible enemy troops in area' },
    { code: 'E', text: 'E - Enemy Troops, approach with caution', label: 'E - Enemy Troops, approach with caution' },
    { code: 'X', text: 'X - Enemy Troops, armed escort required', label: 'X - Enemy Troops, armed escort required' },
] as const;

export const HLZ_MARKING = [
    { code: 'A', text: 'A - Panels', label: 'A - Panels' },
    { code: 'B', text: 'B - Pyrotechnic signal', label: 'B - Pyrotechnic signal' },
    { code: 'C', text: 'C - Smoke', label: 'C - Smoke' },
    { code: 'D', text: 'D - None', label: 'D - None' },
    { code: 'E', text: 'E - Other (Specify)', label: 'E - Other (Specify)' },
] as const;

/** Index of `E - Other (Specify)` in HLZ_MARKING */
export const HLZ_MARKING_OTHER = 4;

export const NATIONALITY = [
    { key: 'us_military', letter: 'A', text: 'A - Coalition Military', label: 'A - Coalition Military' },
    { key: 'us_civilian', letter: 'B', text: 'B - Coalition Civilian', label: 'B - Coalition Civilian' },
    { key: 'nonus_military', letter: 'C', text: 'C - Noncoalition forces', label: 'C - Noncoalition forces' },
    { key: 'nonus_civilian', letter: 'D', text: 'D - Noncoalition citizen', label: 'D - Noncoalition citizen' },
    { key: 'epw', letter: 'E', text: 'E - Opposing force or detainee', label: 'E - Opposing force or detainee' },
    { key: 'child', letter: 'F', text: 'F - Child', label: 'F - Child' },
] as const;

export const TERRAIN = [
    { key: 'terrain_none', text: 'None', label: 'None' },
    { key: 'terrain_slope', text: 'Sloping terrain to the', label: 'Sloping terrain to the' },
    { key: 'terrain_rough', text: 'Rough terrain', label: 'Rough terrain' },
    { key: 'terrain_loose', text: 'Loose sand/dirt', label: 'Loose sand/dirt' },
    { key: 'terrain_other', text: 'Other (Specify)', label: 'Other (Specify)' },
] as const;

export const SLOPE_DIRECTIONS = ['N', 'E', 'S', 'W'] as const;

/** Optional HLZ brief (ATAK HLZView) - free text, written only when filled in */
export const HLZ_FIELDS = [
    { key: 'marked_by', label: 'Marked by' },
    { key: 'obstacles', label: 'Obstacles' },
    { key: 'winds_are_from', label: 'Winds are from' },
    { key: 'friendlies', label: 'Friendlies' },
    { key: 'enemy', label: 'Enemy' },
    { key: 'hlz_remarks', label: 'Remarks' },
] as const;

export type PrecedenceKey = typeof PRECEDENCE[number]['key'];
export type EquipmentKey = typeof EQUIPMENT[number]['key'];
export type PatientTypeKey = typeof PATIENT_TYPE[number]['key'];
export type NationalityKey = typeof NATIONALITY[number]['key'];
export type TerrainKey = typeof TERRAIN[number]['key'];
export type HlzKey = typeof HLZ_FIELDS[number]['key'];

/** ATAK MedLineView defaults for a 9-Line that was never filled in */
export const DEFAULT_SECURITY = 0;
export const DEFAULT_HLZ_MARKING = 3;
export const DEFAULT_SLOPE_DIRECTION = 'N';

/** Placeholders ATAK shows (and reads out) for an empty Line 3, 5 & 8 */
export const EMPTY_LINE_THREE = 'Patient by Precedence';
export const EMPTY_LINE_FIVE = 'Patient by Type';
export const EMPTY_LINE_EIGHT = 'Patients by Nationality';

/** ATAK readout header (readout_text1 + readout_text4) */
export const READOUT_HEADER = '(AIRCRAFT CALLSIGN), ADVISE WHEN READY FOR GAME PLAN.\n\nADVISE WHEN READY FOR 9-LINE.';

export interface MedevacForm {
    title: string;
    /** Line 2 */
    freq: string;
    /** Line 3 */
    precedence: Record<PrecedenceKey, number>;
    /** Line 4 */
    equipment: Record<EquipmentKey, boolean>;
    equipment_detail: string;
    /** Line 5 */
    patients: Record<PatientTypeKey, number>;
    /** Line 6 - index into SECURITY */
    security: number;
    /** Line 7 - index into HLZ_MARKING */
    hlz_marking: number;
    hlz_other: string;
    /** Line 8 */
    nationality: Record<NationalityKey, number>;
    /** Line 9 */
    terrain: Record<TerrainKey, boolean>;
    terrain_slope_dir: string;
    terrain_other_detail: string;
    /** HLZ brief */
    hlz: Record<HlzKey, string>;
}

/**
 * Every `_medevac_` attribute the form owns. Anything else (medline_remarks,
 * zone_* of the HLZ protected zone, attributes of newer ATAK versions) is
 * passed through untouched
 */
export const MANAGED_ATTRIBUTES: ReadonlyArray<string> = [
    'casevac',
    'title',
    'freq',
    ...PRECEDENCE.map((p) => p.key),
    ...EQUIPMENT.map((e) => e.key),
    'equipment_detail',
    ...PATIENT_TYPE.map((p) => p.key),
    'security',
    'hlz_marking',
    'hlz_other',
    ...NATIONALITY.map((n) => n.key),
    ...TERRAIN.map((t) => t.key),
    'terrain_slope_dir',
    'terrain_other_detail',
    ...HLZ_FIELDS.map((h) => h.key),
];

// --- Detection --------------------------------------------------------------

/** ATAK attaches the 9-Line to every type below b-r-f-h-c */
export function isMedevacType(type: unknown): boolean {
    return typeof type === 'string' && type.startsWith(MEDEVAC_TYPE);
}

/** The `_medevac_` detail of a Feature, if it carries a well formed one */
export function medevacDetail(properties: Record<string, unknown> | undefined): MedevacDetail | undefined {
    const medevac = properties ? properties.medevac : undefined;
    if (!medevac || typeof medevac !== 'object' || Array.isArray(medevac)) return undefined;
    return medevac as MedevacDetail;
}

export function isMedevac(properties: Record<string, unknown> | undefined): boolean {
    return !!properties && (isMedevacType(properties.type) || medevacDetail(properties) !== undefined);
}

/**
 * Whether the detail carries ZMIST patient details - only ever counted so the
 * UI can say they are passed on, never read
 */
export function hasZMist(detail: MedevacDetail | undefined): boolean {
    return !!detail && detail.zMistsMap !== undefined;
}

// --- Parsing & serialising -------------------------------------------------

function str(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value);
}

function flag(value: unknown): boolean {
    return value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
}

function count(value: unknown): number {
    const n = parseInt(str(value), 10);
    return isNaN(n) || n < 0 ? 0 : n;
}

function index(value: unknown, length: number, fallback: number): number {
    const n = parseInt(str(value), 10);
    return isNaN(n) || n < 0 || n >= length ? fallback : n;
}

function record<K extends string, V>(keys: ReadonlyArray<{ key: K }>, value: (key: K) => V): Record<K, V> {
    const out = {} as Record<K, V>;
    for (const { key } of keys) out[key] = value(key);
    return out;
}

/** The empty 9-Line ATAK opens for a new MEDEVAC */
export function emptyMedevacForm(title = ''): MedevacForm {
    return formFromDetail(undefined, title);
}

/**
 * Read a `_medevac_` detail into the form - with the defaults of
 * MedLineView.loadData for anything that is missing
 */
export function formFromDetail(detail: MedevacDetail | undefined, fallbackTitle = ''): MedevacForm {
    const attrs: Record<string, unknown> = detail && detail._attributes && typeof detail._attributes === 'object'
        ? detail._attributes
        : {};

    const equipment = record(EQUIPMENT, (key) => flag(attrs[key]));
    if (!Object.values(equipment).some(Boolean)) equipment.equipment_none = true;

    const terrain = record(TERRAIN, (key) => flag(attrs[key]));
    if (!Object.values(terrain).some(Boolean)) terrain.terrain_none = true;

    const slope = str(attrs.terrain_slope_dir);

    return {
        title: str(attrs.title) || fallbackTitle,
        freq: str(attrs.freq),
        precedence: record(PRECEDENCE, (key) => count(attrs[key])),
        equipment,
        equipment_detail: str(attrs.equipment_detail),
        patients: record(PATIENT_TYPE, (key) => count(attrs[key])),
        security: index(attrs.security, SECURITY.length, DEFAULT_SECURITY),
        hlz_marking: index(attrs.hlz_marking, HLZ_MARKING.length, DEFAULT_HLZ_MARKING),
        hlz_other: str(attrs.hlz_other),
        nationality: record(NATIONALITY, (key) => count(attrs[key])),
        terrain,
        terrain_slope_dir: (SLOPE_DIRECTIONS as ReadonlyArray<string>).includes(slope) ? slope : DEFAULT_SLOPE_DIRECTION,
        terrain_other_detail: str(attrs.terrain_other_detail),
        hlz: record(HLZ_FIELDS, (key) => str(attrs[key])),
    };
}

/**
 * Write the form into a `_medevac_` detail the way MedicalDetailHandler does.
 * `base` is the detail as received - its unmanaged attributes and all child
 * elements (ZMIST) are carried over unchanged
 */
export function detailFromForm(form: MedevacForm, base?: MedevacDetail): MedevacDetail {
    const detail: MedevacDetail = base && typeof base === 'object' && !Array.isArray(base)
        ? JSON.parse(JSON.stringify(base))
        : {};

    const previous: Record<string, MedevacAttributeValue> = detail._attributes && typeof detail._attributes === 'object'
        ? detail._attributes
        : {};

    const attrs: Record<string, MedevacAttributeValue> = {};

    // ATAK always writes casevac (false unless a plugin flagged the marker)
    attrs.casevac = flag(previous.casevac);

    if (form.title.trim()) attrs.title = form.title.trim();
    if (form.freq.trim()) attrs.freq = form.freq.trim();

    for (const { key } of PRECEDENCE) {
        if (form.precedence[key] > 0) attrs[key] = String(form.precedence[key]);
    }

    for (const { key } of EQUIPMENT) {
        if (form.equipment[key]) attrs[key] = true;
    }
    if (form.equipment_detail.trim()) attrs.equipment_detail = form.equipment_detail.trim();

    for (const { key } of PATIENT_TYPE) {
        if (form.patients[key] > 0) attrs[key] = String(form.patients[key]);
    }

    attrs.security = String(form.security);
    attrs.hlz_marking = String(form.hlz_marking);
    if (form.hlz_other.trim()) attrs.hlz_other = form.hlz_other.trim();

    for (const { key } of NATIONALITY) {
        if (form.nationality[key] > 0) attrs[key] = String(form.nationality[key]);
    }

    for (const { key } of TERRAIN) {
        if (form.terrain[key]) attrs[key] = true;
    }
    if (form.terrain_other_detail.trim()) attrs.terrain_other_detail = form.terrain_other_detail.trim();
    if (form.terrain.terrain_slope) attrs.terrain_slope_dir = form.terrain_slope_dir;

    for (const { key } of HLZ_FIELDS) {
        if (form.hlz[key].trim()) attrs[key] = form.hlz[key].trim();
    }

    for (const [key, value] of Object.entries(previous)) {
        if (!MANAGED_ATTRIBUTES.includes(key)) attrs[key] = value;
    }

    detail._attributes = attrs;

    return detail;
}

/**
 * Toggle one of a "None + choices" checkbox group (Line 4 & 9): None clears
 * the choices, a choice clears None, and clearing everything falls back to
 * None - the state ATAK writes for a line nobody filled in
 */
export function toggleChoice<F extends Record<string, boolean>>(
    flags: F,
    key: keyof F & string,
    value: boolean,
    noneKey: keyof F & string
): F {
    const next: Record<string, boolean> = { ...flags, [key]: value };

    if (key === noneKey && value) {
        for (const k of Object.keys(next)) {
            if (k !== noneKey) next[k] = false;
        }
    } else if (key !== noneKey && value) {
        next[noneKey] = false;
    }

    if (!Object.values(next).some(Boolean)) next[noneKey] = true;

    return next as F;
}

// --- Line texts & readout (MedLineView.loadData / GenerateReadout) ---------

export function totalPatients(form: MedevacForm): number {
    return Object.values(form.precedence).reduce((sum, n) => sum + n, 0);
}

/** `1xA, 2xC` */
export function lineThree(form: MedevacForm): string {
    return PRECEDENCE
        .filter(({ key }) => form.precedence[key] > 0)
        .map(({ key, letter }) => `${form.precedence[key]}x${letter}`)
        .join(', ');
}

/** One entry per line, `A - None` when nothing is required */
export function lineFour(form: MedevacForm): string {
    const chosen = EQUIPMENT.filter(({ key }) => form.equipment[key]).map(({ text }) => text);
    return chosen.length ? chosen.join('\n') : EQUIPMENT[0].text;
}

/** `Litter x 2, Ambulatory x 1` */
export function lineFive(form: MedevacForm): string {
    return PATIENT_TYPE
        .filter(({ key }) => form.patients[key] > 0)
        .map(({ key, text }) => `${text} x ${form.patients[key]}`)
        .join(', ');
}

export function lineSix(form: MedevacForm): string {
    return SECURITY[form.security].text;
}

export function lineSeven(form: MedevacForm): string {
    return HLZ_MARKING[form.hlz_marking].text;
}

/** `3xA, 1xE` */
export function lineEight(form: MedevacForm): string {
    return NATIONALITY
        .filter(({ key }) => form.nationality[key] > 0)
        .map(({ key, letter }) => `${form.nationality[key]}x${letter}`)
        .join(', ');
}

/** One entry per line, `None` for flat & clear terrain */
export function lineNine(form: MedevacForm): string {
    const chosen = TERRAIN
        .filter(({ key }) => key !== 'terrain_none' && form.terrain[key])
        .map(({ key, text }) => key === 'terrain_slope' ? `${text} ${form.terrain_slope_dir}` : text);

    return chosen.length ? chosen.join('\n') : TERRAIN[0].text;
}

/** ATAK's "Other (Specify)" handling in GenerateReadout for Line 4 & 9 */
function withOther(line: string, other: string): string {
    if (!line.includes('Other')) return line;
    return line.split(' (Specify)').join(': ') + other;
}

/**
 * The radio readout of GenerateReadout.create9LineReadout - English as in
 * ATAK, it is read out on the net
 */
export function medevacReadout(opts: {
    location: string;
    callsign: string;
    form: MedevacForm;
}): string {
    const { form } = opts;

    const seven = form.hlz_marking === HLZ_MARKING_OTHER ? form.hlz_other : lineSeven(form);

    return [
        READOUT_HEADER,
        '',
        `1. ${opts.location}`,
        `2. Call Sign: ${opts.callsign} Freq: ${form.freq}`,
        `3. ${lineThree(form) || EMPTY_LINE_THREE}`,
        `4. ${withOther(lineFour(form), form.equipment_detail)}`,
        `5. ${lineFive(form) || EMPTY_LINE_FIVE}`,
        `6. ${lineSix(form)}`,
        `7. ${seven}`,
        `8. ${lineEight(form) || EMPTY_LINE_EIGHT}`,
        `9. ${withOther(lineNine(form), form.terrain_other_detail)}`,
        ''
    ].join('\n');
}

// --- New MEDEVAC -------------------------------------------------------------

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/**
 * Callsign ATAK gives a new MEDEVAC: `<own callsign>.<day>.<HHmmss>` in UTC
 * (MedicalLineBroadcastReceiver.createMarker)
 */
export function medevacCallsign(own: string | undefined, now = new Date()): string {
    const prefix = own && own.trim() ? own.trim() : 'med9line';
    const stamp = `${pad2(now.getUTCDate())}.${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
    return `${prefix}.${stamp}`;
}
