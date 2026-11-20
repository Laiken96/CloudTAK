/**
 * Catalogue of the line & area signatures of regulation 52.003 (chapters
 * 3.1, 3.3, 3.4 and 4.5) for the drawing tools: names, how they are drawn,
 * the fields the editor shows and - where an equivalent exists - the 2525C
 * tactical graphic ATAK draws in their place.
 *
 * UI side only (labels are translated); the map worker uses recipes/.
 */
import { FAMILY_COLORS } from '../appearance.ts';
import {
    PREFIXES, labelText, echelonSign,
    type Affiliation, type TacticalModel,
} from './model.ts';

/** Fixed colours of regulation chapters 3.4.1 (damage) and 4.5 (topography) */
export const REGULATION_COLORS = {
    damage: '#e8473f',
    water: '#2d6fd2',
    forest: '#1f8a4c',
    black: '#262626',
} as const;

export type DrawKind = 'line' | 'area';

export type FieldKey = 't' | 't1' | 'ech' | 'aff' | 'planned' | 'width' | 'side';

export interface CatalogGroup {
    id: string;
    label: string;
}

export const GROUPS: CatalogGroup[] = [
    { id: 'lines', label: 'Boundaries and control lines' },
    { id: 'movement', label: 'Movement' },
    { id: 'attack', label: 'Attack' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'obstacles', label: 'Obstacles and fortifications' },
    { id: 'areas', label: 'Areas' },
    { id: 'nbc', label: 'NBC' },
    { id: 'damage', label: 'Destruction and damage' },
    { id: 'mines', label: 'Mines and explosive ordnance' },
    { id: 'topo', label: 'Topography' },
];

export interface CatalogEntry {
    /** Picker id - unique */
    id: string;
    /** Stored signature key (recipes/), several entries may share one */
    sig: string;
    label: string;
    group: string;
    /** Regulation chapter and PDF page */
    chapter: string;
    page: number;
    draw: DrawKind;
    /** Shown while drawing */
    hint?: string;
    /** Fields of the editor */
    fields: FieldKey[];
    /** Label of the designation field(s) */
    tLabel?: string;
    t1Label?: string;
    /** Designations name units - the overlay must then be classified (regulation p. 28) */
    unitFields?: boolean;
    /** Defaults of a new graphic */
    defaults?: Partial<TacticalModel>;
    /** Fixed colour (damage, topography) instead of the affiliation colour */
    color?: string;
    /** Fill opacity of the area as other TAK clients see it */
    fillOpacity?: number;
    /** Map label prefix, also used for the callsign */
    prefix?: string;
    /**
     * 2525C tactical graphic: category & function id (`G*<cat>*<fn>…`),
     * sent as `__milsym` only where it is equivalent and our points match
     * its control points
     */
    sidc?: { cat: string; fn: string; echelon?: boolean };
    /** Entries sharing a group of interchangeable signatures (area types) */
    family?: string;
    /** Drawn with exactly this many points (eg centre and radius) */
    points?: 2 | 3;
    /** Shape of the sample in the preview */
    sample?: 'sector' | 'arrow';
}

const LINE_FIELDS: FieldKey[] = ['t', 'aff', 'planned'];
const ARROW_FIELDS: FieldKey[] = ['t', 'aff', 'planned'];
const BROAD_FIELDS: FieldKey[] = ['t', 'aff', 'planned', 'width'];
const AREA_FIELDS: FieldKey[] = ['t', 'aff', 'planned'];

const LINE_HINT = 'Tap the points of the line, then the check mark.';
const ARROW_HINT = 'Draw from the start to the tip.';
const AREA_HINT = 'Tap the corners of the area, then the check mark.';

export const CATALOG: CatalogEntry[] = [
    // --- 3.1 / 3.3 boundaries and control lines ----------------------------
    {
        id: 'boundary', sig: 'boundary', label: 'Sector boundary / control line', group: 'lines', chapter: '3.1', page: 37, draw: 'line',
        hint: LINE_HINT, fields: ['ech', 't', 't1', 'aff', 'planned'], tLabel: 'Unit left', t1Label: 'Unit right', unitFields: true,
        defaults: { ech: 'F' }, sidc: { cat: 'G', fn: 'GLB', echelon: true },
    },
    {
        id: 'flot', sig: 'flot', label: 'Forward line of own troops', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: 'The arcs face the left of the drawing direction.', fields: ['side'], defaults: { aff: 'f' },
        sidc: { cat: 'G', fn: 'GLF' },
    },
    {
        id: 'flet', sig: 'flet', label: 'Forward line of enemy troops', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: 'The arcs face the left of the drawing direction.', fields: ['side'], defaults: { aff: 'h' },
        sidc: { cat: 'G', fn: 'GLF' },
    },
    {
        id: 'phase-line', sig: 'phase-line', label: 'Phase line (PhL)', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: LINE_HINT, fields: LINE_FIELDS, tLabel: 'Name', prefix: PREFIXES.phaseLine, sidc: { cat: 'G', fn: 'GLP' },
    },
    {
        id: 'line-of-departure', sig: 'line-of-departure', label: 'Line of departure (AL)', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: LINE_HINT, fields: LINE_FIELDS, tLabel: 'Name', prefix: PREFIXES.lineOfDeparture, sidc: { cat: 'G', fn: 'OLT' },
    },
    {
        id: 'fire-coordination-line', sig: 'fire-coordination-line', label: 'Fire coordination line (FKL)', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: LINE_HINT, fields: LINE_FIELDS, tLabel: 'Name', prefix: PREFIXES.fireCoordinationLine, sidc: { cat: 'F', fn: 'LCF' },
    },

    {
        id: 'patient-collecting-line', sig: 'patient-collecting-line', label: 'Patient collecting line (Pat SaL)', group: 'lines', chapter: '3.3', page: 40, draw: 'line',
        hint: LINE_HINT, fields: LINE_FIELDS, tLabel: 'Name', prefix: PREFIXES.patientCollectingLine,
    },

    // --- 3.3 movement -------------------------------------------------------
    {
        id: 'movement', sig: 'movement', label: 'Movement, transport, march', group: 'movement', chapter: '3.3', page: 40, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-motorised', sig: 'movement-motorised', label: 'Motorised movement', group: 'movement', chapter: '3.3', page: 40, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-mechanised', sig: 'movement-mechanised', label: 'Mechanised movement', group: 'movement', chapter: '3.3', page: 40, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },

    {
        id: 'movement-air', sig: 'movement-air', label: 'Air transport, fixed wing', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-heli', sig: 'movement-heli', label: 'Air transport, rotary wing', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-rail', sig: 'movement-rail', label: 'Rail transport', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-foot', sig: 'movement-foot', label: 'Movement on foot', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'movement-animals', sig: 'movement-animals', label: 'Movement with animals', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'transport-ship', sig: 'transport-ship', label: 'Transport by ship or ferry', group: 'movement', chapter: '3.3', page: 41, draw: 'line',
        hint: LINE_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },

    // --- 3.3 attack ---------------------------------------------------------
    {
        id: 'main-attack', sig: 'main-attack', label: 'Main attack', group: 'attack', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'supporting-attack', sig: 'supporting-attack', label: 'Supporting attack', group: 'attack', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'feint', sig: 'feint', label: 'Feint', group: 'attack', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'aborted-attack', sig: 'aborted-attack', label: 'Aborted attack', group: 'attack', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'aborted-in-position', sig: 'aborted-in-position', label: 'Aborted attack, in position', group: 'attack', chapter: '3.3', page: 41, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'air-attack', sig: 'air-attack', label: 'Air attack', group: 'attack', chapter: '3.3', page: 42, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'airborne', sig: 'airborne', label: 'Airborne operation', group: 'attack', chapter: '3.3', page: 42, draw: 'line',
        hint: ARROW_HINT, fields: BROAD_FIELDS, tLabel: 'Name',
    },
    {
        id: 'axis-of-attack', sig: 'axis-of-attack', label: 'Axis of attack', group: 'attack', chapter: '3.3', page: 40, draw: 'line',
        hint: 'Draw from the intermediate objective to the objective.', fields: BROAD_FIELDS, tLabel: 'Name',
    },

    // --- 3.3 tasks ----------------------------------------------------------
    {
        id: 'intervene', sig: 'intervene', label: 'Intervene', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'engage', sig: 'engage', label: 'Engage, attrit', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'fire-direction', sig: 'fire-direction', label: 'Direction of fire', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'keep-open', sig: 'keep-open', label: 'Keep open', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: LINE_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'breach', sig: 'breach', label: 'Open (reversible obstacles) or clear (explosive ordnance)', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: 'Three points: one open end, the other open end, then the closed side.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 3, sidc: { cat: 'T', fn: 'H' },
    },
    {
        id: 'canalize', sig: 'canalize', label: 'Canalize', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: 'Three points: one open end, the other open end, then the closed side.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 3, sidc: { cat: 'T', fn: 'C' },
    },
    {
        id: 'clear', sig: 'clear', label: 'Clear an area', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: 'Two points: where the arrow starts and where it ends inside the square.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 2, sample: 'arrow',
    },
    {
        id: 'search', sig: 'search', label: 'Search an area', group: 'tasks', chapter: '3.3', page: 42, draw: 'line',
        hint: 'Two points: where the arrow starts and where it ends inside the square.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 2, sample: 'arrow',
    },
    {
        id: 'delay', sig: 'delay', label: 'Delay', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'withdraw', sig: 'withdraw', label: 'Withdrawal', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'evacuate', sig: 'evacuate', label: 'Evacuate', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: ARROW_HINT, fields: ['aff', 'planned'],
    },
    {
        id: 'reconnaissance', sig: 'reconnaissance', label: 'Reconnoitre', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: ARROW_HINT, fields: ARROW_FIELDS, tLabel: 'Name',
    },
    {
        id: 'ew', sig: 'ew', label: 'Electronic warfare', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff', 'planned'],
    },
    {
        id: 'ew-sensors', sig: 'ew-sensors', label: 'Electronic warfare by sensors', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff', 'planned'],
    },
    {
        id: 'ew-effectors', sig: 'ew-effectors', label: 'Electronic warfare by effectors', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff', 'planned'],
    },
    {
        id: 'fix', sig: 'fix', label: 'Fix', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: 'Draw the arc; the ticks face the left of the drawing direction.', fields: ['aff', 'side'],
    },
    {
        id: 'infiltrate', sig: 'infiltrate', label: 'Infiltrate or exfiltrate', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: ARROW_HINT, fields: ['aff'],
    },
    {
        id: 'surveil', sig: 'surveil', label: 'Surveil', group: 'tasks', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff'],
    },

    // --- 3.3 obstacles ------------------------------------------------------
    {
        id: 'obstacle', sig: 'obstacle', label: 'Obstacle; harden, block', group: 'obstacles', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff'],
    },

    {
        id: 'barrier', sig: 'barrier', label: 'Barrier, flank protection, bridgehead', group: 'obstacles', chapter: '3.3', page: 43, draw: 'line',
        hint: 'The ticks face the left of the drawing direction.', fields: ['t', 'aff', 'side'], tLabel: 'Name',
    },
    {
        id: 'fortified-line', sig: 'fortified-line', label: 'Fortified line', group: 'obstacles', chapter: '3.3', page: 43, draw: 'line',
        hint: LINE_HINT, fields: ['aff', 'side'], sidc: { cat: 'M', fn: 'SL' },
    },

    // --- 3.1 / 3.4 areas ----------------------------------------------------
    {
        id: 'assigned-area', sig: 'assigned-area', label: 'Assigned area', group: 'areas', chapter: '3.1', page: 37, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Responsible unit', unitFields: true,
    },
    {
        id: 'readiness-area', sig: 'readiness-area', label: 'Readiness area', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: AREA_FIELDS, tLabel: 'Name', prefix: PREFIXES.readinessArea, family: 'area-type',
        sidc: { cat: 'G', fn: 'GAA' },
    },
    {
        id: 'assembly-area', sig: 'assembly-area', label: 'Assembly area', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: AREA_FIELDS, tLabel: 'Name', prefix: PREFIXES.assemblyArea, family: 'area-type',
        sidc: { cat: 'G', fn: 'GAA' },
    },
    {
        id: 'attack-position', sig: 'attack-position', label: 'Attack position', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: AREA_FIELDS, tLabel: 'Name', prefix: PREFIXES.attackPosition, family: 'area-type',
        sidc: { cat: 'G', fn: 'OAK' },
    },
    {
        id: 'intermediate-objective', sig: 'intermediate-objective', label: 'Intermediate objective (ZZ)', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: AREA_FIELDS, tLabel: 'Number', prefix: PREFIXES.intermediateObjective, family: 'area-type',
        sidc: { cat: 'G', fn: 'OAO' },
    },
    {
        id: 'objective', sig: 'objective', label: 'Objective (AZ)', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: AREA_FIELDS, tLabel: 'Name', prefix: PREFIXES.objective, family: 'area-type',
        sidc: { cat: 'G', fn: 'OAO' },
    },
    {
        id: 'indirect-fire', sig: 'indirect-fire', label: 'Indirect fire, fired', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff', 'planned'], tLabel: 'Name',
    },
    {
        id: 'indirect-fire-planned', sig: 'indirect-fire', label: 'Indirect fire, planned', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff', 'planned'], tLabel: 'Name', defaults: { planned: true },
    },
    {
        id: 'strong-point', sig: 'strong-point', label: 'Strong point, hold', group: 'areas', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name', sidc: { cat: 'M', fn: 'SP' },
    },

    {
        id: 'zone', sig: 'zone', label: 'Zone (zone of attack)', group: 'areas', chapter: '3.4', page: 44, draw: 'line',
        hint: 'Draw the centre line in the direction of attack.', fields: ['ech', 't', 'aff', 'planned', 'width'], tLabel: 'Responsible unit',
        unitFields: true,
    },
    {
        id: 'air-corridor', sig: 'air-corridor', label: 'Air corridor', group: 'areas', chapter: '3.4', page: 44, draw: 'line',
        hint: 'Draw the centre line of the corridor.', fields: ['t', 'aff', 'planned', 'width'], tLabel: 'Name',
    },
    {
        id: 'isolate', sig: 'isolate', label: 'Isolate', group: 'areas', chapter: '3.4', page: 44, draw: 'line',
        hint: 'Two points: the centre, then the edge of the circle.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 2, sidc: { cat: 'T', fn: 'E' },
    },
    {
        id: 'effect-primary', sig: 'effect-primary', label: 'Area of effect, primary', group: 'areas', chapter: '3.4', page: 45, draw: 'line',
        hint: 'Three points: the position, then the left and the right edge.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 3, sample: 'sector',
    },
    {
        id: 'effect-secondary', sig: 'effect-secondary', label: 'Area of effect, secondary', group: 'areas', chapter: '3.4', page: 45, draw: 'line',
        hint: 'Three points: the position, then the left and the right edge.', fields: ['t', 'aff', 'planned'], tLabel: 'Name',
        points: 3, sample: 'sector',
    },
    {
        id: 'observation-sector', sig: 'observation-sector', label: 'Observation sector', group: 'areas', chapter: '3.4', page: 45, draw: 'line',
        hint: 'Three points: the position, then the left and the right edge.', fields: ['t', 'aff'], tLabel: 'Name',
        points: 3, sample: 'sector',
    },
    {
        id: 'key-terrain', sig: 'key-terrain', label: 'Key terrain', group: 'areas', chapter: '3.4', page: 44, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },
    {
        id: 'guard', sig: 'guard', label: 'Guard', group: 'areas', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },
    {
        id: 'secure', sig: 'secure', label: 'Secure an area', group: 'areas', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },

    // --- 3.4 NBC ------------------------------------------------------------
    {
        id: 'contaminated-n', sig: 'contaminated-n', label: 'Contaminated area, nuclear', group: 'nbc', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['aff'], sidc: { cat: 'M', fn: 'NR' },
    },
    {
        id: 'contaminated-b', sig: 'contaminated-b', label: 'Contaminated area, biological', group: 'nbc', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['aff'], sidc: { cat: 'M', fn: 'NB' },
    },
    {
        id: 'contaminated-c', sig: 'contaminated-c', label: 'Contaminated area, chemical', group: 'nbc', chapter: '3.4', page: 45, draw: 'area',
        hint: AREA_HINT, fields: ['aff'], sidc: { cat: 'M', fn: 'NC' },
    },

    {
        id: 'nbc-zones', sig: 'nbc-zones', label: 'NBC minimum safe distance zones', group: 'nbc', chapter: '3.4', page: 45, draw: 'line',
        hint: 'Two points: the centre, then the edge of the outer circle.', fields: ['aff'], points: 2,
    },

    // --- 3.4.1 destruction and damage --------------------------------------
    {
        id: 'destroyed-zone', sig: 'destroyed-zone', label: 'Destroyed impassable zone', group: 'damage', chapter: '3.4.1', page: 46, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.black,
    },
    {
        id: 'damage-area', sig: 'damage-area', label: 'Damage area', group: 'damage', chapter: '3.4.1', page: 46, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.damage, fillOpacity: 0.5,
    },
    {
        id: 'area-fire', sig: 'area-fire', label: 'Fire of several buildings, area fire', group: 'damage', chapter: '3.4.1', page: 46, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.damage,
    },
    {
        id: 'debris', sig: 'debris', label: 'Debris area', group: 'damage', chapter: '3.4.1', page: 46, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.damage,
    },
    {
        id: 'flooded', sig: 'flooded', label: 'Flooded area', group: 'damage', chapter: '3.4.1', page: 46, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.damage, fillOpacity: 0.5,
    },
    {
        id: 'flow-direction', sig: 'flow-direction', label: 'Direction of outflow or slide', group: 'damage', chapter: '3.4.1', page: 46, draw: 'line',
        hint: ARROW_HINT, fields: [], color: REGULATION_COLORS.damage,
    },

    {
        id: 'landslide', sig: 'landslide', label: 'Landslide area', group: 'damage', chapter: '3.4.1', page: 46, draw: 'line',
        hint: 'The ticks face downhill, to the right of the drawing direction.', fields: ['t', 'side'], tLabel: 'Name', color: REGULATION_COLORS.damage,
    },

    // --- 3.4.2 mines and explosive ordnance ---------------------------------
    {
        id: 'mined-area', sig: 'mined-area', label: 'Mined area', group: 'mines', chapter: '3.4.2', page: 47, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name', sidc: { cat: 'M', fn: 'OFA' },
    },
    {
        id: 'mined-area-ap', sig: 'mined-area-ap', label: 'Mined area, anti-personnel mines', group: 'mines', chapter: '3.4.2', page: 47, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },
    {
        id: 'mined-area-at', sig: 'mined-area-at', label: 'Mined area, anti-tank mines', group: 'mines', chapter: '3.4.2', page: 47, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },
    {
        id: 'explosive-ordnance', sig: 'explosive-ordnance', label: 'Area contaminated by explosive ordnance', group: 'mines', chapter: '3.4.2', page: 47, draw: 'area',
        hint: AREA_HINT, fields: ['t', 'aff'], tLabel: 'Name',
    },

    // --- 4.5 topography -----------------------------------------------------
    {
        id: 'river', sig: 'river', label: 'River with direction of flow', group: 'topo', chapter: '4.5', page: 55, draw: 'line',
        hint: 'Draw in the direction of flow.', fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.water,
    },
    {
        id: 'standing-water', sig: 'standing-water', label: 'Standing water: pond, lake', group: 'topo', chapter: '4.5', page: 55, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.water,
    },
    {
        id: 'swamp', sig: 'swamp', label: 'Swamp', group: 'topo', chapter: '4.5', page: 55, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.water,
    },
    {
        id: 'forest', sig: 'forest', label: 'Forest, covered terrain', group: 'topo', chapter: '4.5', page: 55, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.forest,
    },
    {
        id: 'built-up-area', sig: 'built-up-area', label: 'Town, built-up area', group: 'topo', chapter: '4.5', page: 55, draw: 'area',
        hint: AREA_HINT, fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.black,
    },
    {
        id: 'ford', sig: 'ford', label: 'Ford', group: 'topo', chapter: '4.5', page: 55, draw: 'line',
        hint: 'Draw the crossing, across the river.', fields: [], color: REGULATION_COLORS.black,
    },
    {
        id: 'bridge', sig: 'bridge', label: 'Bridge', group: 'topo', chapter: '4.5', page: 55, draw: 'line',
        hint: 'Draw the bridge, across the river.', fields: ['t'], tLabel: 'Name', color: REGULATION_COLORS.black,
    },
    {
        id: 'railway', sig: 'railway', label: 'Railway', group: 'topo', chapter: '4.5', page: 55, draw: 'line',
        hint: LINE_HINT, fields: [], color: REGULATION_COLORS.black,
    },
];

export function catalogEntry(id: string | undefined): CatalogEntry | undefined {
    return CATALOG.find((entry) => entry.id === id);
}

/**
 * The catalogue entry of a stored model: the first entry of its signature,
 * or the one whose defaults match (indirect fire fired / planned)
 */
export function entryOf(model: TacticalModel): CatalogEntry | undefined {
    const entries = CATALOG.filter((entry) => entry.sig === model.sig);
    return entries.find((entry) => !!entry.defaults?.planned === !!model.planned) ?? entries[0];
}

/** Line colour of an affiliation: the colours of the app's 2525 symbols */
export const AFFILIATION_COLORS: Record<Affiliation, string> = {
    f: FAMILY_COLORS.friendly,
    h: FAMILY_COLORS.hostile,
    n: FAMILY_COLORS.neutral,
    u: FAMILY_COLORS.unknown,
};

export function affiliationOf(entry: CatalogEntry, model: TacticalModel): Affiliation {
    return model.aff ?? entry.defaults?.aff ?? 'f';
}

export function colorOf(entry: CatalogEntry, model: TacticalModel): string {
    return entry.color ?? AFFILIATION_COLORS[affiliationOf(entry, model)];
}

/** A new model for an entry, with its defaults */
export function defaultModel(entry: CatalogEntry): TacticalModel {
    return { sig: entry.sig, ...(entry.defaults ?? {}) };
}

/**
 * The 2525C SIDC ATAK draws the graphic with, or undefined. Status A
 * (anticipated) makes ATAK draw it dashed, like a planned signature
 */
export function sidcOf(entry: CatalogEntry, model: TacticalModel): string | undefined {
    if (!entry.sidc) return undefined;

    const aff = affiliationOf(entry, model).toUpperCase();
    const status = model.planned ? 'A' : 'P';
    const fn = entry.sidc.fn.padEnd(6, '-');

    if (entry.sidc.echelon && model.ech) {
        return `G${aff}${entry.sidc.cat}${status}${fn}-${model.ech}--X`;
    }

    return `G${aff}${entry.sidc.cat}${status}${fn}****X`;
}

/** The callsign: map label of the graphic, or its name */
export function callsignOf(entry: CatalogEntry, model: TacticalModel): string {
    if (entry.sig === 'boundary') {
        return [entry.label, echelonSign(model.ech), [model.t, model.t1].filter(Boolean).join(' | ')]
            .filter((part) => !!part).join(' ');
    }

    if (entry.prefix) return labelText(entry.prefix, model);

    return [entry.label, model.t].filter((part) => !!part).join(' ');
}
