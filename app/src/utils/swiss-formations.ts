import {
    affiliation as affiliationOption,
    withAffiliation,
    withContext,
    withHqTfDummy,
    contextOf,
    affiliationOf,
    amplifierOf,
    hqTfDummyOf,
} from './appearance.ts';

/**
 * Swiss military unit symbols (Reglement 52.003 "Signaturen", chapter 2.2
 * "Militärische Formationssignaturen") as MIL-STD-2525 land unit symbols, so
 * a Swiss formation is picked by its Swiss name and placed as a 2525 symbol
 * with echelon and affiliation colours - the "Darstellung in
 * Führungssystemen" of chapter 2.1.2.
 *
 * Only names and codes live here - no graphics of the Reglement. The names
 * are Swiss technical terms and stay German in every UI language.
 *
 * Each formation is a 20 digit numeric SIDC (symbol set 10, land unit).
 * Version 13 (2525E) is the default, like the rest of CloudTAK; version 10
 * (2525D) is used where the Swiss sign needs a sector modifier that 2525E has
 * withdrawn (mountain, bridging, airborne). ATAK draws both: it registers a
 * 2525D (10/11) and a 2525E (13) symbology provider.
 *
 * How a formation matches its Swiss sign:
 *  - exact: the 2525 symbol shows the same thing
 *  - close: same meaning, a Swiss detail is missing or drawn differently
 *  - nearest: 2525 has no such unit - the nearest symbol, the designation
 *    (`abbr`) names it in the label and callsign
 */

export type SwissMatch = 'exact' | 'close' | 'nearest';

export interface SwissFormation {
    /** Stable id - kept in favourites only through the SIDC, never shown */
    id: string;
    /** Section of Reglement 52.003, e.g. "2.2.3" */
    chapter: string;
    /** Name as in the Reglement (German) */
    name: string;
    /** Swiss designation used in labels and callsigns, e.g. "Pz" - the name when unset */
    abbr?: string;
    /** 6 digit entity code of symbol set 10 (land unit) */
    entity: string;
    /** Sector 1 modifier */
    mod1?: string;
    /** Sector 2 modifier */
    mod2?: string;
    /** SIDC version - 13 (2525E) unless a 2525D-only modifier is needed */
    version?: '10' | '13';
    match: SwissMatch;
    /** Why the 2525 symbol differs from the Swiss sign (close / nearest) */
    note?: string;
    /** More search words, e.g. the Truppengattung of chapter 2.1.5 */
    aliases?: string[];
    /** Preferred Swiss names of the hierarchy levels, e.g. Batterie / Abteilung for artillery */
    terms?: string[];
}

/** Section headings of chapter 2.2 (and 2.1.6 for the complementary graphics) */
export const SWISS_CHAPTERS: Array<{ id: string; name: string }> = [
    { id: '2.2.1', name: 'Führung' },
    { id: '2.2.2', name: 'Infanterie' },
    { id: '2.2.3', name: 'Panzertruppen' },
    { id: '2.2.4', name: 'Artillerie' },
    { id: '2.2.5', name: 'Fliegertruppen' },
    { id: '2.2.6', name: 'Fliegerabwehrtruppen' },
    { id: '2.2.7', name: 'Genietruppen' },
    { id: '2.2.8', name: 'Führungsunterstützungstruppen' },
    { id: '2.2.9', name: 'Rettungstruppen' },
    { id: '2.2.10', name: 'Logistiktruppen' },
    { id: '2.2.11', name: 'Sanitätstruppen' },
    { id: '2.2.12', name: 'Militärpolizei' },
    { id: '2.2.13', name: 'ABC Abwehrtruppen' },
    { id: '2.2.14', name: 'Spezialkräfte' },
    { id: '2.2.15', name: 'Militärjustiz' },
    { id: '2.2.16', name: 'Ausbildung' },
    { id: '2.2.17', name: 'Fachstäbe, Verwaltungs- und weitere Formationen' },
    { id: '2.1.6', name: 'Ergänzungszeichen' },
];

const ARTILLERY = ['Batterie', 'Abteilung'];
const AIR = ['Staffel', 'Geschwader'];
const SCHOOL = ['Lehrverband'];

const TEXT_ONLY = 'Swiss sign is a text in the frame - 2525 has no such unit';
const STAFF = 'Swiss specialist staff frame - 2525 has none, drawn as headquarters staff element of the branch';
const COMPETENCE = 'Swiss competence centre frame - 2525 has none';
const JUSTICE = 'Swiss scales of justice - nearest 2525 symbol is Judge Advocate General (JAG)';

export const SWISS_FORMATIONS: SwissFormation[] = [
    // 2.2.1 Führung
    { id: 'a-stab', chapter: '2.2.1', name: 'Formation Armeestab', abbr: 'A Stab', entity: '110000', mod1: '98', match: 'nearest', note: TEXT_ONLY },
    { id: 'kdo-op', chapter: '2.2.1', name: 'Formation Kommando Operationen', abbr: 'Kdo Op', entity: '110000', mod1: '49', match: 'nearest', note: TEXT_ONLY },
    { id: 'kdo-ausb', chapter: '2.2.1', name: 'Formation Kommando Ausbildung', abbr: 'Kdo Ausb', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'lba', chapter: '2.2.1', name: 'Formation Logistikbasis der Armee', abbr: 'LBA', entity: '160200', match: 'nearest', note: TEXT_ONLY },
    { id: 'kdo-cyber', chapter: '2.2.1', name: 'Formation Kommando Cyber', abbr: 'Kdo Cyber', entity: '210000', match: 'close', note: 'Swiss sign is the text Cyber - 2525 cyber unit' },
    { id: 'heer', chapter: '2.2.1', name: 'Formation Heer', abbr: 'HE', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'lw', chapter: '2.2.1', name: 'Formation Luftwaffe', abbr: 'LW', entity: '120700', match: 'nearest', note: TEXT_ONLY },
    { id: 'ter', chapter: '2.2.1', name: 'Territorialformation', abbr: 'Ter', entity: '110000', mod1: '02', match: 'nearest', note: 'Swiss circle - 2525 has no territorial unit, drawn as command with area modifier', aliases: ['Territorialdivision'] },
    { id: 'evb', chapter: '2.2.1', name: 'Einsatzverband Boden', abbr: 'EVB', entity: '121000', match: 'nearest', note: TEXT_ONLY },
    { id: 'evl', chapter: '2.2.1', name: 'Einsatzverband Luft', abbr: 'EVL', entity: '120700', match: 'nearest', note: TEXT_ONLY },

    // 2.2.2 Infanterie
    { id: 'inf', chapter: '2.2.2', name: 'Infanterieformation / Schützenformation', abbr: 'Inf', entity: '121100', match: 'exact', aliases: ['Infanterie', 'Schützen'] },
    { id: 'geb-inf', chapter: '2.2.2', name: 'Gebirgsinfanterieformation / Gebirgsschützenformation', abbr: 'Geb Inf', entity: '121100', mod2: '27', version: '10', match: 'exact', aliases: ['Gebirgsinfanterie', 'Gebirgsschützen'] },

    // 2.2.3 Panzertruppen
    { id: 'pz', chapter: '2.2.3', name: 'Panzerformation', abbr: 'Pz', entity: '120500', match: 'exact', aliases: ['Panzertruppen', 'Kampfpanzer'] },
    { id: 'mech', chapter: '2.2.3', name: 'Mechanisierte Formation / Panzergrenadierformation', abbr: 'Pz Gren', entity: '121102', match: 'exact', aliases: ['Mech', 'Panzergrenadiere'] },
    { id: 'aufkl', chapter: '2.2.3', name: 'Aufklärungsformation', abbr: 'Aufkl', entity: '120501', match: 'exact', aliases: ['Aufklärung'] },

    // 2.2.4 Artillerie
    { id: 'art', chapter: '2.2.4', name: 'Artillerieformation', abbr: 'Art', entity: '130300', match: 'close', note: 'Swiss artillery is drawn as self-propelled (armour oval) - 2525E field artillery has no self-propelled unit', aliases: ['Artillerie', 'Panzerartillerie'], terms: ARTILLERY },
    { id: 'ffz', chapter: '2.2.4', name: 'Feuerführungszentrumsformation', entity: '130300', mod1: '25', match: 'close', note: 'Field artillery with fire direction centre modifier', aliases: ['FFZ'], terms: ARTILLERY },
    { id: 'moerser', chapter: '2.2.4', name: 'Mörserformation (Artillerie)', entity: '130800', match: 'exact', aliases: ['Mörser', 'Minenwerfer'], terms: ARTILLERY },

    // 2.2.5 Fliegertruppen
    { id: 'lw-kdo-ei', chapter: '2.2.5', name: 'Formation Kommando Einsatz Luftwaffe', abbr: 'LW Kdo Ei', entity: '120700', mod1: '49', match: 'nearest', note: TEXT_ONLY },
    { id: 'lw-ausb', chapter: '2.2.5', name: 'Formation Ausbildung und Training Luftwaffe', entity: '120700', match: 'nearest', note: 'Swiss training frame - 2525 has none', terms: AIR },
    { id: 'lw-op-zen', chapter: '2.2.5', name: 'Formation Operationszentrale Luftwaffe', abbr: 'LW Op Zen', entity: '120700', mod1: '49', match: 'nearest', note: TEXT_ONLY },
    { id: 'fl', chapter: '2.2.5', name: 'Fliegerformation (Luft)', entity: '120700', match: 'close', note: '2525 aviation composite - the Swiss bow tie is the 2525 rotary wing sign', aliases: ['Fliegertruppen', 'Flieger'], terms: AIR },
    { id: 'fl-starr', chapter: '2.2.5', name: 'Fliegerformation Starrflügel (Luft)', entity: '120800', match: 'exact', aliases: ['Flugzeug', 'Kampfflugzeug'], terms: AIR },
    { id: 'fl-rot', chapter: '2.2.5', name: 'Fliegerformation Rotationsflügel (Luft)', entity: '120600', match: 'exact', aliases: ['Helikopter', 'Hubschrauber'], terms: AIR },
    { id: 'zfl', chapter: '2.2.5', name: 'Zielflugformation', abbr: 'Zfl', entity: '120800', match: 'close', note: 'Fixed wing, designation Zfl', terms: AIR },
    { id: 'ifl', chapter: '2.2.5', name: 'Instrumentenflugformation', abbr: 'Ifl', entity: '120800', match: 'close', note: 'Fixed wing, designation Ifl', terms: AIR },
    { id: 'ltf-starr', chapter: '2.2.5', name: 'Lufttransportformation Starrflügel (Luft)', entity: '120800', match: 'close', note: '2525E has no cargo modifier for fixed wing', aliases: ['Lufttransport'], terms: AIR },
    { id: 'ltf-rot', chapter: '2.2.5', name: 'Lufttransportformation Rotationsflügel (Luft)', entity: '120600', mod2: '56', match: 'close', note: 'Rotary wing with utility modifier', aliases: ['Lufttransport', 'Helikopter'], terms: AIR },
    { id: 'drohnen', chapter: '2.2.5', name: 'Drohnenformation', entity: '121900', match: 'exact', aliases: ['Drohne', 'UAV'], terms: AIR },
    { id: 'flugplatz', chapter: '2.2.5', name: 'Flugplatzformation', entity: '120200', match: 'close', note: '2525 air traffic services / airfield operations', aliases: ['Flugplatz'] },
    { id: 'fl-bereitschaft', chapter: '2.2.5', name: 'Fliegerbereitschaftsformation (Boden)', entity: '120200', match: 'nearest', note: 'Swiss standby arrow - 2525 has no standby unit, drawn as airfield operations' },
    { id: 'fl-starr-boden', chapter: '2.2.5', name: 'Fliegerformation Starrflügel (Boden)', entity: '120800', mod1: '89', match: 'close', note: 'Fixed wing with airfield modifier', terms: AIR },
    { id: 'fl-ih', chapter: '2.2.5', name: 'Flugzeuginstandhaltungsformation', entity: '161100', mod1: '89', match: 'close', note: 'Maintenance with airfield modifier' },
    { id: 'lw-radar', chapter: '2.2.5', name: 'Mobile Radarformation Luftwaffe', abbr: 'LW Radar', entity: '151200', mod1: '50', match: 'close', note: 'Sensor with radar modifier' },
    { id: 'lw-nachrichten', chapter: '2.2.5', name: 'Nachrichtenformation Luftwaffe', abbr: 'LW ND', entity: '151000', match: 'close', note: '2525 military intelligence' },
    { id: 'lw-met', chapter: '2.2.5', name: 'Wetterformation Luftwaffe', abbr: 'LW Met', entity: '130600', match: 'close', note: '2525 meteorological' },
    { id: 'lw-ekf', chapter: '2.2.5', name: 'EKF Formation Luftwaffe', abbr: 'LW EKF', entity: '150500', match: 'close', note: '2525 electronic warfare' },

    // 2.2.6 Fliegerabwehrtruppen
    { id: 'flab-kan', chapter: '2.2.6', name: 'Fliegerabwehrformation mobile Fliegerabwehrkanone', abbr: 'M Flab', entity: '130101', match: 'close', note: 'Air defence main gun system', aliases: ['Fliegerabwehrtruppen', 'Flab', 'Mittlere Flab'], terms: ARTILLERY },
    { id: 'flab-lwf', chapter: '2.2.6', name: 'Fliegerabwehrformation mobile Fliegerabwehrlenkwaffen', abbr: 'Flab Lwf', entity: '130102', match: 'exact', aliases: ['Flab'], terms: ARTILLERY },
    { id: 'flab-lwf-leicht', chapter: '2.2.6', name: 'Fliegerabwehrformation leichte Fliegerabwehrlenkwaffen', abbr: 'L Flab Lwf', entity: '130102', mod2: '23', match: 'close', note: 'Air defence missile with low altitude modifier', aliases: ['Flab'], terms: ARTILLERY },

    // 2.2.7 Genietruppen
    { id: 'genie', chapter: '2.2.7', name: 'Genieformation / Sappeurformation', abbr: 'Genie', entity: '140700', match: 'exact', aliases: ['Genietruppen', 'Sappeure'] },
    { id: 'mot-boot', chapter: '2.2.7', name: 'Motorbootformation', abbr: 'Mot Boot', entity: '140700', mod2: '40', match: 'close', note: 'Engineer with riverine modifier' },
    { id: 'pz-sap', chapter: '2.2.7', name: 'Panzersappeurformation', abbr: 'Pz Sap', entity: '140701', match: 'exact', aliases: ['Panzersappeure'] },
    { id: 'pont', chapter: '2.2.7', name: 'Pontonierformation', abbr: 'Pont', entity: '140700', mod1: '06', version: '10', match: 'exact', aliases: ['Pontoniere', 'Brücke'] },
    { id: 'kamir', chapter: '2.2.7', name: 'Einsatzformation Kampfmittelbeseitigung und Minenräumung', abbr: 'Ei KAMIR', entity: '140800', match: 'close', note: '2525 explosive ordnance disposal', aliases: ['KAMIR', 'EOD'] },

    // 2.2.8 Führungsunterstützungstruppen
    { id: 'fu', chapter: '2.2.8', name: 'Führungsunterstützungsformation', abbr: 'FU', entity: '111000', match: 'exact', aliases: ['Führungsunterstützungstruppen', 'Übermittlung', 'Uem'] },
    { id: 'fu-ik', chapter: '2.2.8', name: 'Führungsunterstützungsformation Informatik', abbr: 'FU Ik', entity: '111000', mod1: '88', match: 'close', note: 'Signal with network operations modifier' },
    { id: 'fu-ssp', chapter: '2.2.8', name: 'Führungsunterstützungsformation Sprachspezialisten', abbr: 'FU Ssp', entity: '165100', match: 'close', note: '2525 interpreter / translator' },
    { id: 'sks', chapter: '2.2.8', name: 'Formation Systeme, Kaderausbildung und Support', abbr: 'SKS', entity: '111000', match: 'nearest', note: TEXT_ONLY },
    { id: 'ffs', chapter: '2.2.8', name: 'Formation Kompetenzzentrum Führungs- und Fachsysteme', abbr: 'FFS', entity: '111000', match: 'nearest', note: TEXT_ONLY },
    { id: 'fis-betr', chapter: '2.2.8', name: 'Betriebsformation FIS', abbr: 'FIS Betr', entity: '111000', match: 'nearest', note: TEXT_ONLY },
    { id: 'fis-ikt', chapter: '2.2.8', name: 'FIS Formation IKT', abbr: 'FIS IKT', entity: '111000', mod1: '88', match: 'nearest', note: 'Signal with network operations modifier, designation FIS IKT' },
    { id: 'fis-kp', chapter: '2.2.8', name: 'FIS Formation KP', abbr: 'FIS KP', entity: '111000', match: 'nearest', note: 'Signal, designation FIS KP' },
    { id: 'hq', chapter: '2.2.8', name: 'Hauptquartierformation', abbr: 'HQ', entity: '110000', mod1: '98', match: 'close', note: 'Command with headquarters staff element modifier', aliases: ['Stabsformation', 'Hauptquartier'] },
    { id: 'ekf', chapter: '2.2.8', name: 'EKF Formation / Elektronikformation', abbr: 'EKF', entity: '150500', match: 'exact', aliases: ['Elektronische Kriegführung', 'EW'] },
    { id: 'cno', chapter: '2.2.8', name: 'CNO Formation', abbr: 'CNO', entity: '210000', match: 'close', note: '2525 cyber unit' },
    { id: 'richtstrahl', chapter: '2.2.8', name: 'Richtstrahlformation', entity: '111002', match: 'exact', aliases: ['Richtstrahl'] },
    { id: 'mrs', chapter: '2.2.8', name: 'MRS Formation', abbr: 'MRS', entity: '111002', match: 'close', note: 'Signal radio relay, designation MRS' },
    { id: 'koord-ter', chapter: '2.2.8', name: 'Formation Koordinationsstelle Territorialformation', abbr: 'Koord Ter', entity: '110500', match: 'nearest', note: '2525 liaison' },

    // 2.2.9 Rettungstruppen
    { id: 'rttg', chapter: '2.2.9', name: 'Rettungsformation', abbr: 'Rttg', entity: '141800', match: 'close', note: '2525 search and rescue - drawn as SAR, not the Swiss double cross', aliases: ['Rettungstruppen', 'Rettung'] },
    { id: 'kata', chapter: '2.2.9', name: 'Katastrophenhilfeformation', entity: '190000', match: 'close', note: '2525 emergency operation', aliases: ['Katastrophenhilfe'] },

    // 2.2.10 Logistiktruppen
    { id: 'log', chapter: '2.2.10', name: 'Logistikformation', abbr: 'Log', entity: '160200', match: 'close', note: '2525 supply (all classes) - the Swiss supply bar plus ALL', aliases: ['Logistiktruppen', 'Logistik', 'Versorgung'] },
    { id: 'vt', chapter: '2.2.10', name: 'Verkehrs- und Transportformation', entity: '163600', match: 'close', note: '2525 transportation (wheel) - the Swiss traffic dots are missing', aliases: ['Verkehr', 'Transport'] },
    { id: 'verkehr', chapter: '2.2.10', name: 'Verkehrsformation', entity: '163600', mod2: '08', match: 'nearest', note: '2525 has no traffic unit - transportation with control modifier', aliases: ['Verkehr'] },
    { id: 'transport', chapter: '2.2.10', name: 'Transportformation', entity: '163600', match: 'exact', aliases: ['Transport'] },
    { id: 'infra', chapter: '2.2.10', name: 'Infrastrukturformation', entity: '140700', mod1: '12', match: 'nearest', note: '2525 has no infrastructure unit - engineer with construction modifier', aliases: ['Infrastruktur'] },
    { id: 'kz-vet', chapter: '2.2.10', name: 'Formation Kompetenzzentrum Veterinärdienst und Armeetiere', entity: '161300', mod2: '50', match: 'nearest', note: `${COMPETENCE} - medical with veterinary modifier` },
    { id: 'vet-tiere', chapter: '2.2.10', name: 'Veterinär- und Armeetiereformation', entity: '161300', mod2: '50', match: 'close', note: 'Medical with veterinary modifier', aliases: ['Armeetiere'] },
    { id: 'train', chapter: '2.2.10', name: 'Trainformation', entity: '163600', mod2: '31', match: 'close', note: 'Transportation with pack animal modifier', aliases: ['Train', 'Säumer', 'Pferde'] },
    { id: 'vet', chapter: '2.2.10', name: 'Veterinärformation', entity: '161300', mod2: '50', match: 'close', note: 'Medical with veterinary modifier', aliases: ['Veterinär'] },
    { id: 'hund', chapter: '2.2.10', name: 'Hundeführerformation', entity: '140500', match: 'exact', note: '2525 dog unit', aliases: ['Hunde'] },

    // 2.2.11 Sanitätstruppen
    { id: 'san', chapter: '2.2.11', name: 'Sanitätsformation', abbr: 'San', entity: '161300', match: 'exact', aliases: ['Sanitätstruppen', 'Sanität', 'Medizin'] },
    { id: 'spit', chapter: '2.2.11', name: 'Sanitätsformation Spital', abbr: 'Spit', entity: '161400', match: 'close', note: '2525 medical treatment facility', aliases: ['Spital'] },

    // 2.2.12 Militärpolizei
    { id: 'mp', chapter: '2.2.12', name: 'Militärpolizeiformation', abbr: 'MP', entity: '141200', match: 'exact', aliases: ['Militärpolizei'] },
    { id: 'mp-ei', chapter: '2.2.12', name: 'Militärpolizeiformation Einsatzkommando', abbr: 'MP Ei', entity: '141200', match: 'close', note: 'Military police, designation Ei' },
    { id: 'mp-fs', chapter: '2.2.12', name: 'Militärpolizeiformation Fahndung und Schutz', abbr: 'MP FS', entity: '141200', match: 'close', note: 'Military police, designation FS' },
    { id: 'mp-sichd', chapter: '2.2.12', name: 'Militärpolizeiformation Sicherheitsdienst', abbr: 'MP Sich D', entity: '141200', match: 'close', note: 'Military police, designation Sich D' },
    { id: 'mp-schutz', chapter: '2.2.12', name: 'Militärpolizeischutzformation', abbr: 'MP Schutz', entity: '141200', match: 'close', note: 'Military police, designation Schutz' },
    { id: 'mp-kripo', chapter: '2.2.12', name: 'Militärpolizeiformation Kriminalpolizei', abbr: 'MP Kripo', entity: '141200', mod1: '86', match: 'exact', aliases: ['Kripo'] },
    { id: 'kz-mp', chapter: '2.2.12', name: 'Formation Kompetenzzentrum Militärpolizei', abbr: 'Kompetenzzentrum MP', entity: '141200', match: 'close', note: COMPETENCE },

    // 2.2.13 ABC Abwehrtruppen
    { id: 'abc', chapter: '2.2.13', name: 'Formation ABC Abwehr', abbr: 'ABC Abw', entity: '140100', match: 'exact', aliases: ['ABC Abwehrtruppen', 'ABC', 'NBC'] },
    { id: 'abc-lab', chapter: '2.2.13', name: 'Formation ABC Abwehrlabor', abbr: 'ABC Lab', entity: '140100', mod2: '20', match: 'exact', aliases: ['Labor'] },
    { id: 'kz-abc-kamir', chapter: '2.2.13', name: 'Formation Kompetenzzentrum ABC-KAMIR', abbr: 'Kompetenzzentrum ABC-KAMIR', entity: '140106', match: 'close', note: `${COMPETENCE} - CBRN and high-yield explosives`, aliases: ['KAMIR'] },

    // 2.2.14 Spezialkräfte
    { id: 'spez', chapter: '2.2.14', name: 'Formation Spezialkräfte', abbr: 'Spez Kr', entity: '121800', match: 'close', note: '2525 special operations forces (SOF) - the Swiss crossed arrows are not drawn', aliases: ['Spezialkräfte', 'SOF'] },
    { id: 'mp-spez', chapter: '2.2.14', name: 'Militärpolizeiformation Spezialkräfte', abbr: 'MP Spez Kr', entity: '121800', match: 'close', note: '2525 special operations forces, designation MP' },
    { id: 'gren', chapter: '2.2.14', name: 'Grenadierformation', abbr: 'Gren', entity: '121800', match: 'close', note: '2525 special operations forces', aliases: ['Grenadiere'] },
    { id: 'armee-aufkl', chapter: '2.2.14', name: 'Armeeaufklärungsformation', abbr: 'A Aufkl', entity: '121300', match: 'close', note: '2525 reconnaissance - the Swiss special forces arrows are not drawn', aliases: ['AAD'] },
    { id: 'fsch-aufkl', chapter: '2.2.14', name: 'Fallschirmaufklärerformation', abbr: 'Fsch Aufkl', entity: '121300', mod2: '01', version: '10', match: 'close', note: 'Reconnaissance with airborne modifier (2525D)', aliases: ['Fallschirm'] },
    { id: 'ausbz-spez', chapter: '2.2.14', name: 'Formation Ausbildungszentrum Spezialkräfte', abbr: 'Ausb Zen Spez Kr', entity: '121800', match: 'nearest', note: 'Swiss training centre frame - 2525 has none' },

    // 2.2.15 Militärjustiz
    { id: 'mil-ger', chapter: '2.2.15', name: 'Militärgericht', abbr: 'Mil Ger', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'oa', chapter: '2.2.15', name: 'Formation Oberauditorat / Oberauditor', abbr: 'OA', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'mkg', chapter: '2.2.15', name: 'Militärkassationsgericht', abbr: 'MKG', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'mag', chapter: '2.2.15', name: 'Militärappellationsgericht', abbr: 'MAG', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'ur-reg', chapter: '2.2.15', name: 'Untersuchungsrichterregion', abbr: 'UR Reg', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'aud-reg', chapter: '2.2.15', name: 'Auditorenregion', abbr: 'Aud Reg', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },
    { id: 'mj-lw', chapter: '2.2.15', name: 'Militärjustiz Luftwaffe', abbr: 'MJ LW', entity: '160800', match: 'nearest', note: JUSTICE, aliases: ['Militärjustiz'] },

    // 2.2.16 Ausbildung
    { id: 'hka', chapter: '2.2.16', name: 'Formation Höhere Kaderausbildung der Armee', abbr: 'HKA', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'op-s', chapter: '2.2.16', name: 'Operative Schulung der Armee', abbr: 'Op S', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'gst-s', chapter: '2.2.16', name: 'Formation Generalstabsschule', abbr: 'Gst S', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'zs', chapter: '2.2.16', name: 'Formation Zentralschule', abbr: 'ZS', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'milak', chapter: '2.2.16', name: 'Formation Militärakademie an der ETHZ', abbr: 'MILAK', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'busa', chapter: '2.2.16', name: 'Formation Berufsunteroffiziersschule der Armee', abbr: 'BUSA', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'lvb-inf', chapter: '2.2.16', name: 'Formation Lehrverband Infanterie', abbr: 'LVb Inf', entity: '121100', match: 'close', note: 'Infantry - the Swiss training unit bar is not drawn', aliases: ['Lehrverband'], terms: SCHOOL },
    { id: 'lvb-pz-art', chapter: '2.2.16', name: 'Formation Lehrverband Panzer/Artillerie', abbr: 'LVb Pz/Art', entity: '120500', match: 'close', note: 'Armour - the Swiss artillery dot and training unit bar are not drawn', aliases: ['Lehrverband'], terms: SCHOOL },
    { id: 'lvb-g-rttg-abc', chapter: '2.2.16', name: 'Formation Lehrverband Genie/Rettung/ABC', abbr: 'LVb G/Rttg/ABC', entity: '140700', match: 'close', note: 'Engineer - rescue and NBC signs and training unit bar are not drawn', aliases: ['Lehrverband'], terms: SCHOOL },
    { id: 'lvb-flab-fu', chapter: '2.2.16', name: 'Formation Lehrverband Fliegerabwehr/Führungsunterstützung', abbr: 'LVb Flab/FU', entity: '130100', match: 'close', note: 'Air defence - the command support sign and training unit bar are not drawn', aliases: ['Lehrverband'], terms: SCHOOL },
    { id: 'lvb-log', chapter: '2.2.16', name: 'Formation Lehrverband Logistik', abbr: 'LVb Log', entity: '160200', match: 'close', note: 'Supply - the training unit bar is not drawn', aliases: ['Lehrverband'], terms: SCHOOL },
    { id: 'ausb-a', chapter: '2.2.16', name: 'Formation Ausbildungszentrum der Armee', abbr: 'Ausb A', entity: '110000', match: 'nearest', note: TEXT_ONLY },
    { id: 'kz-gebd', chapter: '2.2.16', name: 'Formation Kompetenzzentrum Gebirgsdienst der Armee', abbr: 'Kompetenzzentrum Geb D', entity: '110000', mod2: '27', version: '10', match: 'nearest', note: `${COMPETENCE} - command with mountain modifier (2525D)`, aliases: ['Gebirgsdienst'] },
    { id: 'geb-spez', chapter: '2.2.16', name: 'Gebirgsspezialistenformation', abbr: 'Geb Spez', entity: '110000', mod2: '27', version: '10', match: 'nearest', note: 'Command with mountain modifier (2525D) - the specialist star is not drawn', aliases: ['Gebirgsspezialisten'] },
    { id: 'kz-musik', chapter: '2.2.16', name: 'Formation Kompetenzzentrum Militärmusik', abbr: 'Kompetenzzentrum Mil Musik', entity: '160501', match: 'close', note: `${COMPETENCE} - army music`, aliases: ['Militärmusik', 'Musik'] },
    { id: 'spiel', chapter: '2.2.16', name: 'Formation Militärspiel und Armeespiel', abbr: 'Spiel', entity: '160501', match: 'close', note: '2525 army music', aliases: ['Militärmusik', 'Musik', 'Armeespiel'] },

    // 2.2.17 Fachstäbe, Verwaltungs- und weitere Formationen
    { id: 'ing-stab', chapter: '2.2.17', name: 'Ingenieurstab', abbr: 'Ing Stab', entity: '140700', mod1: '98', match: 'nearest', note: STAFF, aliases: ['Fachstab'] },
    { id: 'fst-lw', chapter: '2.2.17', name: 'Fachstab Luftwaffe', abbr: 'Fachstab LW', entity: '120700', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'ing-stab-lw', chapter: '2.2.17', name: 'Ingenieurstab Luftwaffe', abbr: 'Ing Stab LW', entity: '140700', mod1: '98', match: 'nearest', note: STAFF, aliases: ['Fachstab'] },
    { id: 'fst-flusi', chapter: '2.2.17', name: 'Fachstab Flugsicherung', abbr: 'Fachstab Flusi', entity: '120200', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-ih', chapter: '2.2.17', name: 'Fachstab Instandhaltung', abbr: 'Fachstab Ih', entity: '161100', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-tc', chapter: '2.2.17', name: 'Fachstab Telekommunikation', abbr: 'Fachstab Tc', entity: '111000', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-met', chapter: '2.2.17', name: 'Fachstab Wetter', abbr: 'Fachstab Met', entity: '130600', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-sport', chapter: '2.2.17', name: 'Fachstab Sport', abbr: 'Fachstab Sport', entity: '161500', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-sat', chapter: '2.2.17', name: 'Fachstab Schiesswesen und ausserdienstliche Tätigkeiten', abbr: 'Fachstab SAT', entity: '160100', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-as', chapter: '2.2.17', name: 'Fachstab Armeeseelsorge', abbr: 'Fachstab AS', entity: '163100', mod1: '98', match: 'nearest', note: STAFF, aliases: ['Seelsorge'] },
    { id: 'fst-sda', chapter: '2.2.17', name: 'Fachstab Sozialdienst der Armee', abbr: 'Fachstab SDA', entity: '162400', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-ppd', chapter: '2.2.17', name: 'Fachstab psychologisch-pädagogischer Dienst der Armee', abbr: 'Fachstab PPD A', entity: '161300', mod1: '98', mod2: '34', match: 'nearest', note: `${STAFF} - medical with psychological modifier` },
    { id: 'fst-mika', chapter: '2.2.17', name: 'Fachstab Management-, Informations- und Kommunikationsausbildung', abbr: 'Fachstab MIKA', entity: '162800', mod1: '98', match: 'nearest', note: STAFF },
    { id: 'fst-rkd', chapter: '2.2.17', name: 'Fachstab Rotkreuzdienst', abbr: 'Fachstab RKD', entity: '161300', mod1: '98', match: 'nearest', note: STAFF, aliases: ['Rotkreuz'] },
    { id: 'swissint', chapter: '2.2.17', name: 'Formation Kompetenzzentrum SWISSINT', abbr: 'SWISSINT', entity: '110000', mod1: '39', match: 'nearest', note: `${COMPETENCE} - command with multinational modifier` },
    { id: 'mnd', chapter: '2.2.17', name: 'Formation Militärischer Nachrichtendienst', abbr: 'MND', entity: '151000', match: 'close', note: '2525 military intelligence', aliases: ['Nachrichtendienst'] },
    { id: 'dpsa', chapter: '2.2.17', name: 'Formation Dienst für präventiven Schutz der Armee', abbr: 'DPSA', entity: '150200', match: 'close', note: '2525 counterintelligence' },
    { id: 'pers-a', chapter: '2.2.17', name: 'Formation Personelles der Armee', abbr: 'Pers A', entity: '162400', match: 'close', note: '2525 personnel services' },
    { id: 'rekr', chapter: '2.2.17', name: 'Formation Rekrutierung', abbr: 'Pers A Rekr', entity: '162400', match: 'nearest', note: '2525 personnel services, designation Rekr', aliases: ['Rekrutierung'] },
    { id: 'pdg', chapter: '2.2.17', name: 'Formation Patrouille des Glaciers', abbr: 'PdG', entity: '110000', mod1: '02', match: 'nearest', note: 'Swiss territorial circle - drawn like Territorialformation' },
    { id: 'sport-a', chapter: '2.2.17', name: 'Formation Kompetenzzentrum Sport der Armee', abbr: 'Sport A', entity: '161500', match: 'nearest', note: `${COMPETENCE} - morale, welfare and recreation` },
    { id: 'kanton-betr', chapter: '2.2.17', name: 'Betriebsformation Kanton (z. B. AG Betr)', abbr: 'Kanton Betr', entity: '110000', mod1: '02', match: 'nearest', note: 'Swiss canton designation - drawn like Territorialformation', aliases: ['Kanton', 'AG Betr'] },

    // 2.1.6 Ergänzungszeichen - complementary graphics for Swiss and other forces
    { id: 'pzaw', chapter: '2.1.6', name: 'Panzerabwehrformation', entity: '120400', match: 'exact', aliases: ['Panzerabwehr', 'Antitank'] },
    { id: 'mot-inf', chapter: '2.1.6', name: 'Motorisierte Infanterieformation', abbr: 'Mot Inf', entity: '121104', match: 'exact', aliases: ['mobil', 'motorisiert'] },
];

/**
 * Hierarchy levels of chapter 2.1.4 with their Swiss names. The 2525
 * echelon codes draw the same signs: 1-3 dots, I, II, III, X ...
 */
export interface SwissEchelon {
    /** 2525 echelon amplifier (SIDC digits 9-10) */
    code: string;
    /** The hierarchy sign as text */
    sign: string;
    /** Swiss names of this level, most common first */
    terms: string[];
}

export const SWISS_ECHELONS: SwissEchelon[] = [
    { code: '12', sign: '●', terms: ['Trupp'] },
    { code: '13', sign: '●●', terms: ['Gruppe'] },
    { code: '14', sign: '●●●', terms: ['Zug'] },
    { code: '15', sign: 'I', terms: ['Kompanie', 'Batterie', 'Staffel', 'Kolonne'] },
    { code: '16', sign: 'II', terms: ['Bataillon', 'Abteilung', 'Geschwader'] },
    { code: '17', sign: 'III', terms: ['Regiment', 'Kampfgruppe', 'Kompetenzzentrum', 'Koordinationsstelle', 'Schule'] },
    { code: '18', sign: 'X', terms: ['Brigade', 'Lehrverband', 'Oberauditorat'] },
    { code: '21', sign: 'XX', terms: ['Division'] },
    { code: '22', sign: 'XXX', terms: ['Armeekorps'] },
    { code: '23', sign: 'XXXX', terms: ['Armee'] },
    { code: '24', sign: 'XXXXX', terms: ['Armeegruppe'] },
];

/** No echelon amplifier */
export const NO_ECHELON = '00';

/** Swiss abbreviations of the hierarchy levels in unit names ("Pz Bat") */
export const SWISS_TERM_ABBR: Record<string, string> = {
    Kompanie: 'Kp',
    Batterie: 'Bttr',
    Bataillon: 'Bat',
    Abteilung: 'Abt',
    Regiment: 'Rgt',
    Brigade: 'Br',
    Lehrverband: 'LVb',
    Division: 'Div',
};

export function swissFormation(id: string | undefined): SwissFormation | undefined {
    return id ? SWISS_FORMATIONS.find((formation) => formation.id === id) : undefined;
}

export function swissChapterName(id: string): string {
    return SWISS_CHAPTERS.find((chapter) => chapter.id === id)?.name ?? id;
}

export function swissEchelon(code: string | undefined): SwissEchelon | undefined {
    return SWISS_ECHELONS.find((echelon) => echelon.code === code);
}

/**
 * The Swiss name a level takes for a formation - its preferred term
 * (Batterie for artillery) when it has one on that level
 */
export function defaultTerm(formation: SwissFormation | undefined, code: string): string | undefined {
    const echelon = swissEchelon(code);
    if (!echelon) return undefined;

    return echelon.terms.find((term) => formation?.terms?.includes(term)) ?? echelon.terms[0];
}

export interface SwissChoice {
    /** Affiliation code (f, h, n, u ...) */
    affiliation?: string;
    /** 2525E context digit - 0 reality, 1 exercise, 2 simulation */
    context?: string;
    /** Echelon code of SWISS_ECHELONS */
    echelon?: string;
    /** Swiss name of the level - one of the echelon's terms */
    term?: string;
    /** Stab (2.1.3): drawn as the 2525 headquarters staff */
    headquarters?: boolean;
    /** Einsatzverband (2.1.3): drawn as the 2525 task force */
    taskForce?: boolean;
}

/** The 20 digit SIDC a formation is placed as */
export function swissFormationSidc(formation: SwissFormation, choice: SwissChoice = {}): string {
    const echelon = swissEchelon(choice.echelon) ? choice.echelon as string : NO_ECHELON;

    let sidc = [
        formation.version ?? '13',
        '0', // context: reality
        '3', // standard identity: friend
        '10', // symbol set: land unit
        '0', // status: present
        '0', // headquarters / task force / dummy
        echelon,
        formation.entity,
        formation.mod1 ?? '00',
        formation.mod2 ?? '00',
    ].join('');

    if (choice.affiliation && affiliationOption(choice.affiliation)) sidc = withAffiliation(sidc, choice.affiliation);
    if (choice.context) sidc = withContext(sidc, choice.context);

    return withHqTfDummy(sidc, {
        headquarters: !!choice.headquarters,
        taskForce: !!choice.taskForce,
        dummy: false,
    });
}

/**
 * The formations a SIDC was made from - several Swiss formations share one
 * 2525 symbol (all military courts are JAG), so this can be more than one
 */
export function swissFormationsOf(sidc: string | undefined): SwissFormation[] {
    if (!sidc || !/^1[03]\d{18}$/.test(sidc) || sidc.substring(4, 6) !== '10') return [];

    const version = sidc.substring(0, 2);
    const entity = sidc.substring(10, 16);
    const mod1 = sidc.substring(16, 18);
    const mod2 = sidc.substring(18, 20);

    return SWISS_FORMATIONS.filter((formation) => {
        return (formation.version ?? '13') === version
            && formation.entity === entity
            && (formation.mod1 ?? '00') === mod1
            && (formation.mod2 ?? '00') === mod2;
    });
}

/** Affiliation, context, echelon and indicators of a Swiss formation SIDC */
export function swissChoiceOf(sidc: string): SwissChoice {
    const flags = hqTfDummyOf(sidc);
    const echelon = amplifierOf(sidc);

    return {
        affiliation: affiliationOf(sidc) ?? 'u',
        context: contextOf(sidc),
        echelon: swissEchelon(echelon) ? echelon : NO_ECHELON,
        headquarters: flags.headquarters,
        taskForce: flags.taskForce,
    };
}

/**
 * Short Swiss name of a placed formation, used as favourite label and
 * callsign: "Pz Zug", "Art Abt", "Stab Pz Bat", "MKG"
 */
export function swissFormationLabel(formation: SwissFormation, choice: SwissChoice = {}): string {
    const base = formation.abbr ?? formation.name;
    const parts = [base];

    const echelon = swissEchelon(choice.echelon);
    if (echelon) {
        const term = choice.term && echelon.terms.includes(choice.term) ? choice.term : defaultTerm(formation, echelon.code) as string;
        const short = SWISS_TERM_ABBR[term] ?? term;

        // "LVb Inf" is already the Lehrverband
        const words = base.toLowerCase().split(/[\s/]+/);
        if (!words.includes(short.toLowerCase()) && !words.includes(term.toLowerCase())) parts.push(short);
    }

    if (choice.headquarters) parts.unshift('Stab');

    return parts.join(' ');
}

/** Lower case without accents so "Aufklarung" finds "Aufklärung" */
function fold(text: string): string {
    return text
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

function haystack(formation: SwissFormation): string[] {
    return [
        formation.name,
        formation.abbr ?? '',
        swissChapterName(formation.chapter),
        ...(formation.aliases ?? []),
    ].map(fold);
}

/**
 * Formations matching every word of the query, best first: a designation
 * or name starting with the query, then a word starting with it, then the
 * rest in the order of the Reglement. An empty query lists all.
 */
export function searchSwissFormations(query: string, list: SwissFormation[] = SWISS_FORMATIONS): SwissFormation[] {
    const needle = fold(query.trim());
    if (!needle) return [...list];

    const words = needle.split(/\s+/).filter(Boolean);

    const scored = list
        .map((formation, index) => {
            const texts = haystack(formation);
            const joined = texts.join(' ');
            if (!words.every((word) => joined.includes(word))) return undefined;

            let score = 3;
            if (texts.slice(0, 2).some((text) => text.startsWith(needle))) score = 0;
            else if (texts.some((text) => text.startsWith(needle))) score = 1;
            else if (texts.some((text) => text.split(/[\s/(-]+/).some((part) => part.startsWith(words[0])))) score = 2;

            return { formation, index, score };
        })
        .filter((entry): entry is { formation: SwissFormation; index: number; score: number } => !!entry);

    scored.sort((a, b) => a.score - b.score || a.index - b.index);

    return scored.map((entry) => entry.formation);
}

/** Formations grouped by the sections of the Reglement, in its order */
export function groupSwissFormations(list: SwissFormation[]): Array<{ id: string; name: string; formations: SwissFormation[] }> {
    return SWISS_CHAPTERS
        .map((chapter) => ({
            id: chapter.id,
            name: chapter.name,
            formations: list.filter((formation) => formation.chapter === chapter.id),
        }))
        .filter((group) => group.formations.length > 0);
}
