import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import ms from 'milsymbol';
import Type2525 from '@tak-ps/node-cot/2525';
import { CoTParser } from '@tak-ps/node-cot';
import {
    SWISS_FORMATIONS,
    SWISS_CHAPTERS,
    SWISS_ECHELONS,
    NO_ECHELON,
    defaultTerm,
    groupSwissFormations,
    searchSwissFormations,
    swissChoiceOf,
    swissFormation,
    swissFormationLabel,
    swissFormationSidc,
    swissFormationsOf,
    type SwissFormation,
} from './swiss-formations.ts';
import { ECHELONS, amplifierOf, hqTfDummyOf } from './appearance.ts';
import { renderedIcon } from '../base/cot.ts';
import { signatureFeature } from '../base/signature-placement.ts';
import { db } from '../database.ts';
import FavoriteSignatures, { signatureOf } from '../base/favorite-signatures.ts';

interface MilStdEntry {
    Code: string;
    Entity?: string;
    'First Modifier'?: string;
    'Second Modifier'?: string;
}

interface MilStdSet {
    mainIcon: MilStdEntry[];
    modifier1: MilStdEntry[];
    modifier2: MilStdEntry[];
}

// The 2525E tables CloudTAK's API serves (a node-cot dependency without types)
const MILSTANDARD_E = 'milstandard-e';
const { ms2525e } = await import(/* @vite-ignore */ MILSTANDARD_E) as { ms2525e: Record<string, MilStdSet> };
const LAND_UNIT = ms2525e['10'];

const disused = (entry: MilStdEntry | undefined) => !entry || Object.values(entry).some((value) => String(value).includes('{Disused}'));

function e2525(table: MilStdEntry[], code: string): MilStdEntry | undefined {
    return table.find((entry) => entry.Code === code);
}

function svg(sidc: string): string {
    return new ms.Symbol(sidc, { size: 30 }).asSVG();
}

function byId(id: string): SwissFormation {
    const formation = swissFormation(id);
    if (!formation) throw new Error(`No formation ${id}`);
    return formation;
}

const PRIMARY_AFFILIATIONS = ['f', 'h', 'n', 'u'];

describe('Swiss formations: data', () => {
    it('has a unique id and name for every formation, in a known section', () => {
        const ids = SWISS_FORMATIONS.map((formation) => formation.id);
        const names = SWISS_FORMATIONS.map((formation) => formation.name);

        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(names).size).toBe(names.length);

        for (const formation of SWISS_FORMATIONS) {
            expect(SWISS_CHAPTERS.map((chapter) => chapter.id), formation.id).toContain(formation.chapter);
            expect(formation.entity, formation.id).toMatch(/^\d{6}$/);
            if (formation.mod1) expect(formation.mod1, formation.id).toMatch(/^\d{2}$/);
            if (formation.mod2) expect(formation.mod2, formation.id).toMatch(/^\d{2}$/);
            if (formation.match !== 'exact') expect(formation.note, `${formation.id} explains the deviation`).toBeTruthy();
            expect(formation.name, 'Swiss spelling').not.toContain('ß');
        }
    });

    it('covers every section of chapter 2.2', () => {
        expect(groupSwissFormations(SWISS_FORMATIONS).map((group) => group.id)).toEqual(SWISS_CHAPTERS.map((chapter) => chapter.id));
        expect(SWISS_FORMATIONS.length).toBeGreaterThanOrEqual(130);
    });

    it('uses only 2525E land unit entities and modifiers that are in use', () => {
        for (const formation of SWISS_FORMATIONS) {
            const entity = e2525(LAND_UNIT.mainIcon, formation.entity);
            expect(disused(entity), `${formation.id} entity ${formation.entity}`).toBe(false);

            if ((formation.version ?? '13') !== '13') continue;

            if (formation.mod1) expect(disused(e2525(LAND_UNIT.modifier1, formation.mod1)), `${formation.id} mod1`).toBe(false);
            if (formation.mod2) expect(disused(e2525(LAND_UNIT.modifier2, formation.mod2)), `${formation.id} mod2`).toBe(false);
        }
    });

    it('falls back to 2525D only for a modifier 2525E has withdrawn', () => {
        const d = SWISS_FORMATIONS.filter((formation) => formation.version === '10');
        expect(d.map((formation) => formation.id)).toEqual(['geb-inf', 'pont', 'fsch-aufkl', 'kz-gebd', 'geb-spez']);

        for (const formation of d) {
            const withdrawn = (formation.mod1 && disused(e2525(LAND_UNIT.modifier1, formation.mod1)))
                || (formation.mod2 && disused(e2525(LAND_UNIT.modifier2, formation.mod2)));
            expect(withdrawn, formation.id).toBeTruthy();
        }
    });

    it('turns every formation into a valid SIDC the map renders, in every affiliation', () => {
        for (const formation of SWISS_FORMATIONS) {
            for (const affiliation of PRIMARY_AFFILIATIONS) {
                const sidc = swissFormationSidc(formation, { affiliation, echelon: '14' });

                expect(Type2525.isNumericSIDCConvertable(sidc), `${formation.id} ${sidc}`).toBe(true);

                const valid = new ms.Symbol(sidc).isValid(true) as unknown as { icon: boolean; affiliation: string; dimension: string };
                expect(valid.icon, `${formation.id} ${sidc} has an icon`).toBe(true);
                expect(valid.dimension, sidc).toBe('Ground');

                // What the map and every list draw for it
                expect(renderedIcon({ type: sidc } as never)).toBe(`2525E:${sidc}`);
            }
        }
    });

    it('draws the sector modifiers - they are not silently dropped', () => {
        for (const formation of SWISS_FORMATIONS.filter((formation) => formation.mod1 || formation.mod2)) {
            const plain = swissFormationSidc({ ...formation, mod1: undefined, mod2: undefined });
            expect(svg(swissFormationSidc(formation)), formation.id).not.toBe(svg(plain));
        }
    });

    it('lists formations without a 2525 equivalent as nearest', () => {
        const nearest = SWISS_FORMATIONS.filter((formation) => formation.match === 'nearest').map((formation) => formation.id);

        // The examples of the order: military justice, competence centres, text-only command formations
        expect(nearest).toEqual(expect.arrayContaining(['mil-ger', 'mkg', 'oa', 'kz-vet', 'swissint', 'hka', 'a-stab', 'ter']));
        expect(nearest).not.toContain('pz');
    });
});

describe('Swiss formations: signs of the Reglement', () => {
    // Spot checks against Reglement 52.003 chapter 2.2 (sign -> 2525 icon)
    it.each([
        ['inf', '121100', 'a-f-G-U-C-I'], // Kreuz
        ['pz', '120500', 'a-f-G-U-C-A'], // Oval
        ['mech', '121102', 'a-f-G-U-C-I-Z'], // Kreuz + Oval
        ['aufkl', '120501', 'a-f-G-U-C-R-V-A'], // Oval + Schrägstrich
        ['art', '130300', 'a-f-G-U-C-F'], // Punkt
        ['geb-inf', '121100', 'a-f-G-U-C-I-O'], // Kreuz + Berg
        ['genie', '140700', 'a-f-G-U-C-E'],
        ['pz-sap', '140701', 'a-f-G-U-C-E-C-T'],
        ['fu', '111000', 'a-f-G-U-U-S'], // Blitz
        ['abc', '140100', 'a-f-G-U-U-A'],
        ['san', '161300', 'a-f-G-U-S-M'], // Kreuz geteilt
        ['mp', '141200', 'a-f-G-U-U-L-M'],
        ['flab-lwf', '130102', 'a-f-G-U-C-D-M'], // Kuppel
        ['transport', '163600', 'a-f-G-U-S-T'], // Rad
        ['pzaw', '120400', 'a-f-G-U-C-A-A'], // Panzerabwehr
        ['mot-inf', '121104', 'a-f-G-U-C-I-M'], // Kreuz + mobil
        ['fl-starr', '120800', 'a-f-G-U-C-V-F'],
        ['fl-rot', '120600', 'a-f-G-U-C-V'],
    ])('%s is entity %s, older clients see %s', (id, entity, cotType) => {
        const formation = byId(id);
        expect(formation.entity).toBe(entity);

        // Clients without the SIDC detail draw the CoT type node-cot derives
        expect(Type2525.cotTypeFromNumericSIDC(swissFormationSidc(formation, { echelon: '14' }))).toBe(cotType);
    });

    it('draws the mountain of Gebirgsinfanterie and the bridge of Pontoniere (2525D modifiers)', () => {
        expect(swissFormationSidc(byId('geb-inf'))).toBe('10031000001211000027');
        expect(swissFormationSidc(byId('pont'))).toBe('10031000001407000600');
        expect(svg(swissFormationSidc(byId('geb-inf')))).not.toBe(svg(swissFormationSidc(byId('inf'))));
    });
});

describe('Swiss formations: echelon (2.1.4)', () => {
    it('maps the hierarchy signs onto the 2525 echelons with the same sign', () => {
        const codes = Object.fromEntries(SWISS_ECHELONS.flatMap((level) => level.terms.map((term) => [term, level.code])));

        expect(codes).toMatchObject({
            Trupp: '12', // ● squad
            Gruppe: '13', // ●● section
            Zug: '14', // ●●● platoon
            Kompanie: '15', Batterie: '15', Staffel: '15', Kolonne: '15', // I
            Bataillon: '16', Abteilung: '16', Geschwader: '16', // II
            Regiment: '17', Kampfgruppe: '17', Schule: '17', // III
            Brigade: '18', Lehrverband: '18', // X
            Division: '21', // XX
            Armeekorps: '22',
            Armee: '23',
            Armeegruppe: '24',
        });

        for (const level of SWISS_ECHELONS) {
            expect(ECHELONS.map((option) => option.value), level.code).toContain(level.code);
        }
    });

    it('carries the echelon in the SIDC and draws it', () => {
        const pz = byId('pz');

        const platoon = swissFormationSidc(pz, { echelon: '14' });
        expect(platoon).toBe('13031000141205000000');
        expect(amplifierOf(platoon)).toBe('14');
        expect(svg(platoon)).not.toBe(svg(swissFormationSidc(pz)));

        expect(amplifierOf(swissFormationSidc(pz))).toBe(NO_ECHELON);
        // An unknown level is ignored rather than written into the SIDC
        expect(amplifierOf(swissFormationSidc(pz, { echelon: '99' }))).toBe(NO_ECHELON);
    });

    it('prefers the Swiss term of the branch', () => {
        expect(defaultTerm(byId('art'), '15')).toBe('Batterie');
        expect(defaultTerm(byId('art'), '16')).toBe('Abteilung');
        expect(defaultTerm(byId('fl-starr'), '15')).toBe('Staffel');
        expect(defaultTerm(byId('pz'), '15')).toBe('Kompanie');
        expect(defaultTerm(byId('pz'), '99')).toBeUndefined();
    });
});

describe('Swiss formations: affiliation and indicators', () => {
    it.each([
        ['f', '3', 'a-f-G-U-C-A'],
        ['h', '6', 'a-h-G-U-C-A'],
        ['n', '4', 'a-n-G-U-C-A'],
        ['u', '1', 'a-u-G-U-C-A'],
    ])('affiliation %s is standard identity %s', (affiliation, identity, cotType) => {
        const sidc = swissFormationSidc(byId('pz'), { affiliation, echelon: '14' });

        expect(sidc[3]).toBe(identity);
        expect(Type2525.cotTypeFromNumericSIDC(sidc)).toBe(cotType);
        expect(swissChoiceOf(sidc)).toMatchObject({ affiliation, echelon: '14' });
    });

    it('sets Stab as headquarters, Einsatzverband as task force and the exercise context', () => {
        const sidc = swissFormationSidc(byId('pz'), { echelon: '16', headquarters: true, taskForce: true, context: '1' });

        expect(hqTfDummyOf(sidc)).toEqual({ headquarters: true, taskForce: true, dummy: false });
        expect(sidc[2]).toBe('1');
        expect(swissChoiceOf(sidc)).toEqual({
            affiliation: 'f',
            context: '1',
            echelon: '16',
            headquarters: true,
            taskForce: true,
        });
    });

    it('finds the formations a SIDC was made from', () => {
        const sidc = swissFormationSidc(byId('mkg'), { affiliation: 'h', echelon: '15' });

        // All military courts share the JAG symbol
        expect(swissFormationsOf(sidc).map((formation) => formation.id)).toEqual(['mil-ger', 'oa', 'mkg', 'mag', 'ur-reg', 'aud-reg', 'mj-lw']);
        expect(swissFormationsOf(swissFormationSidc(byId('geb-inf'))).map((formation) => formation.id)).toEqual(['geb-inf']);
        expect(swissFormationsOf('a-f-G-U-C-A')).toEqual([]);
        expect(swissFormationsOf(undefined)).toEqual([]);
    });
});

describe('Swiss formations: labels', () => {
    it.each([
        ['pz', { echelon: '14' }, 'Pz Zug'],
        ['pz', { echelon: '15' }, 'Pz Kp'],
        ['pz', { echelon: '16', headquarters: true }, 'Stab Pz Bat'],
        ['art', { echelon: '16' }, 'Art Abt'],
        ['art', { echelon: '15' }, 'Art Bttr'],
        ['art', { echelon: '15', term: 'Kompanie' }, 'Art Kp'],
        ['art', { echelon: '15', term: 'Zug' }, 'Art Bttr'],
        ['aufkl', { echelon: '16' }, 'Aufkl Bat'],
        ['lvb-inf', { echelon: '18' }, 'LVb Inf'],
        ['san', {}, 'San'],
        ['mkg', { echelon: '17' }, 'MKG Rgt'],
        ['transport', { echelon: '15', term: 'Kolonne' }, 'Transportformation Kolonne'],
    ])('%s %o is "%s"', (id, choice, label) => {
        expect(swissFormationLabel(byId(id), choice)).toBe(label);
    });
});

describe('Swiss formations: search', () => {
    it('lists all formations without a query', () => {
        expect(searchSwissFormations('  ')).toHaveLength(SWISS_FORMATIONS.length);
    });

    it('finds by name, designation and Truppengattung, best match first', () => {
        expect(searchSwissFormations('Panzer')[0].id).toBe('pz');
        expect(searchSwissFormations('pz')[0].id).toBe('pz');
        expect(searchSwissFormations('pz gren')[0].id).toBe('mech');
        expect(searchSwissFormations('Panzergrenadier').map((formation) => formation.id)).toContain('mech');
        expect(searchSwissFormations('Sanitätstruppen').map((formation) => formation.id)).toEqual(['san', 'spit']);
        expect(searchSwissFormations('mkg')[0].id).toBe('mkg');
    });

    it('ignores case and umlauts', () => {
        expect(searchSwissFormations('AUFKLARUNG')[0].id).toBe('aufkl');
        expect(searchSwissFormations('morser')[0].id).toBe('moerser');
        expect(searchSwissFormations('gebirgsschutzen')[0].id).toBe('geb-inf');
    });

    it('finds nothing for an unknown word', () => {
        expect(searchSwissFormations('xyzzy')).toEqual([]);
        expect(groupSwissFormations([])).toEqual([]);
    });
});

describe('Swiss formations: CoT for ATAK', () => {
    const PLATOON = swissFormationSidc(byId('pz'), { affiliation: 'f', echelon: '14' });

    async function cotOf(sidc: string) {
        const feature = signatureFeature({ type: sidc }, 'Pz Zug', [7.45, 46.95], {
            id: 'swiss-formation-test-1',
            now: new Date('2026-11-20T08:05:00Z'),
        });

        return await CoTParser.from_geojson(JSON.parse(JSON.stringify(feature)));
    }

    it('sends the CoT type for older clients and the SIDC with echelon in __milsym and __milicon', async () => {
        const xml = CoTParser.to_xml(await cotOf(PLATOON));

        expect(xml).toContain('type="a-f-G-U-C-A"');
        expect(xml).toContain(`<__milsym id="${PLATOON}"/>`);
        expect(xml).toContain(`<__milicon id="${PLATOON}"/>`);
        // A 2525 symbol must not carry a usericon - it would suppress the symbol in ATAK
        expect(xml).not.toContain('usericon');
    });

    it('comes back as the same symbol with echelon', async () => {
        const xml = CoTParser.to_xml(await cotOf(PLATOON));

        // Mission Sync & CoT queries: type a-f-G-U-C-A, the SIDC in milicon
        const plain = await CoTParser.to_geojson(CoTParser.from_xml(xml));
        expect(plain.properties.type).toBe('a-f-G-U-C-A');
        expect(plain.properties.milicon?.id).toBe(PLATOON);
        expect(renderedIcon(plain.properties as never)).toBe(`2525E:${PLATOON}`);

        // The live stream normalises the SIDC back onto the type
        const normalized = await CoTParser.to_geojson(CoTParser.from_xml(xml), { normalize2525: true });
        expect(normalized.properties.type).toBe(PLATOON);
    });

    it('keeps a hostile 2525D formation intact', async () => {
        const sidc = swissFormationSidc(byId('geb-inf'), { affiliation: 'h', echelon: '15' });
        const xml = CoTParser.to_xml(await cotOf(sidc));

        expect(xml).toContain('type="a-h-G-U-C-I-O"');
        expect(xml).toContain(`<__milicon id="${sidc}"/>`);
    });
});

describe('Swiss formations: favourites and placement', () => {
    beforeEach(async () => {
        await db.favorite_signature.clear();
        FavoriteSignatures.state.loaded = false;
        FavoriteSignatures.state.items = [];
    });

    it('keeps the echelon in a favourite and places it with the Swiss label', async () => {
        const sidc = swissFormationSidc(byId('pz'), { echelon: '14' });
        await FavoriteSignatures.add({ type: sidc }, 'Pz Zug');

        FavoriteSignatures.state.loaded = false;
        const [fav] = await FavoriteSignatures.load({ reload: true });
        expect(fav.label).toBe('Pz Zug');
        expect(signatureOf(fav)).toEqual({ type: sidc });

        const feature = signatureFeature(signatureOf(fav), fav.label, [7.45, 46.95], { now: new Date(2026, 10, 20, 9, 5) });
        expect(feature.properties.type).toBe(sidc);
        expect(feature.properties.callsign).toBe('Pz Zug 09:05');
        expect(amplifierOf(String(feature.properties.type))).toBe('14');
    });
});
