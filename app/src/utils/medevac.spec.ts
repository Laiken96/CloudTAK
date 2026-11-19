import { describe, it, expect } from 'vitest';
import { CoTParser } from '@tak-ps/node-cot';
import {
    MEDEVAC_TYPE,
    MANAGED_ATTRIBUTES,
    READOUT_HEADER,
    isMedevac,
    isMedevacType,
    medevacDetail,
    hasZMist,
    emptyMedevacForm,
    formFromDetail,
    detailFromForm,
    toggleChoice,
    totalPatients,
    lineThree,
    lineFour,
    lineFive,
    lineSix,
    lineSeven,
    lineEight,
    lineNine,
    medevacReadout,
    medevacCallsign,
    type MedevacDetail,
} from './medevac.ts';

/*
 * A MEDEVAC as ATAK (MedicalDetailHandler._handleMedLineProperties) writes
 * it - all values invented for the test
 */
const ATAK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="medevac-test-0001" type="b-r-f-h-c" time="2026-11-19T10:15:00.000Z" start="2026-11-19T10:15:00.000Z" stale="2026-11-20T10:15:00.000Z" how="h-g-i-g-o">
    <point lat="46.5" lon="7.5" hae="600.0" ce="9999999.0" le="9999999.0"/>
    <detail>
        <status readiness="false"/>
        <archive/>
        <contact callsign="TEST.19.101500"/>
        <link uid="ANDROID-0000000000000000" production_time="2026-11-19T10:15:00.000Z" type="a-f-G-U-C" parent_callsign="TEST" relation="p-p"/>
        <_flow-tags_ AndroidMedicalLine="2026-11-19T10:15:00.000Z"/>
        <_medevac_ casevac="false" title="TEST.19.101500" medline_remarks="Test medline remark" freq="40.500" urgent="1" urgent_surgical="1" priority="2" hoist="true" equipment_other="true" equipment_detail="Test equipment" litter="2" ambulatory="2" security="1" hlz_marking="4" hlz_other="Test marking" us_military="3" epw="1" terrain_slope="true" terrain_other="true" terrain_other_detail="Wires &amp; poles &lt;10m" terrain_slope_dir="W" zone_prot_selection="0" zone_protected_coord="32T MN 00000 00000" marked_by="Test marking" obstacles="Test obstacles" winds_are_from="SW 5kt" friendlies="Test friendlies" enemy="Possible enemy troops in area" hlz_remarks="Test &quot;remark&quot;" future_attribute="kept">
            <zMistsMap>
                <zMist title="ZMIST1" z="Z1" m="M1" i="I1" s="S1" t="T1"/>
                <zMist title="ZMIST2" z="Z2" m="M2" i="I2" s="S2" t="T2"/>
            </zMistsMap>
            <futureChild a="b"/>
        </_medevac_>
        <remarks>Test remarks</remarks>
    </detail>
</event>`;

/** The `_medevac_` element of a parsed CoT (node-cot does not type it) */
function rawMedevac(cot: ReturnType<typeof CoTParser.from_xml>): unknown {
    return (cot.raw.event.detail as Record<string, unknown> | undefined)?._medevac_;
}

/** The detail as parsed from the XML - independent of the node-cot patch */
function atakDetail(): MedevacDetail {
    return JSON.parse(JSON.stringify(rawMedevac(CoTParser.from_xml(ATAK_XML))));
}

async function atakFeature() {
    const cot = CoTParser.from_xml(ATAK_XML);
    // What the browser receives from the API over the WebSocket
    const feat = JSON.parse(JSON.stringify(await CoTParser.to_geojson(cot, { normalize2525: true })));
    return { cot, feat };
}

describe('node-cot _medevac_ pass-through (app/patches/@tak-ps+node-cot)', () => {
    it('surfaces the ATAK detail unchanged as properties.medevac', async () => {
        const { cot, feat } = await atakFeature();

        expect(feat.properties.type).toBe(MEDEVAC_TYPE);
        expect(feat.properties.medevac).toEqual(JSON.parse(JSON.stringify(rawMedevac(cot))));
        expect(feat.properties.medevac.zMistsMap.zMist).toHaveLength(2);
    });

    it('round trips ATAK XML -> GeoJSON -> XML without losing the detail', async () => {
        const { cot, feat } = await atakFeature();
        const original = JSON.parse(JSON.stringify(rawMedevac(cot)));

        const xml = CoTParser.to_xml(await CoTParser.from_geojson(feat));
        expect(xml).toContain('<_medevac_ ');
        expect(xml).toContain('<zMist title="ZMIST1"');
        expect(xml).toContain('terrain_other_detail="Wires &amp; poles &lt;10m"');

        const reparsed = CoTParser.from_xml(xml);
        expect(rawMedevac(reparsed)).toEqual(original);
        expect(reparsed.type()).toBe(MEDEVAC_TYPE);
        expect(reparsed.callsign()).toBe('TEST.19.101500');
    });

    it('keeps ZMIST & unknown parts through an edit in CloudTAK', async () => {
        const { feat } = await atakFeature();

        const form = formFromDetail(feat.properties.medevac);
        form.precedence.routine = 4;
        form.security = 3;

        feat.properties.medevac = detailFromForm(form, feat.properties.medevac);

        const xml = CoTParser.to_xml(await CoTParser.from_geojson(feat));
        const medevac = rawMedevac(CoTParser.from_xml(xml)) as MedevacDetail;

        expect(medevac._attributes).toMatchObject({
            routine: '4',
            security: '3',
            medline_remarks: 'Test medline remark',
            zone_prot_selection: '0',
            zone_protected_coord: '32T MN 00000 00000',
            future_attribute: 'kept',
        });
        expect(medevac.zMistsMap).toEqual(feat.properties.medevac.zMistsMap);
        expect(medevac.futureChild).toEqual({ _attributes: { a: 'b' } });
    });

    it('leaves Features without a MEDEVAC alone', async () => {
        const cot = await CoTParser.from_geojson({
            type: 'Feature',
            properties: { type: 'a-f-G', callsign: 'X' },
            geometry: { type: 'Point', coordinates: [7.5, 46.5] }
        });

        expect(rawMedevac(cot)).toBeUndefined();
        expect((await CoTParser.to_geojson(cot)).properties).not.toHaveProperty('medevac');
    });
});

describe('MEDEVAC detection', () => {
    it('matches b-r-f-h-c and its subtypes like ATAK', () => {
        expect(isMedevacType('b-r-f-h-c')).toBe(true);
        expect(isMedevacType('b-r-f-h-c-x')).toBe(true);
        expect(isMedevacType('a-f-G')).toBe(false);
        expect(isMedevacType(undefined)).toBe(false);
    });

    it('also recognises a detail on another type', () => {
        expect(isMedevac({ type: 'a-f-G', medevac: { _attributes: {} } })).toBe(true);
        expect(isMedevac({ type: 'a-f-G' })).toBe(false);
        expect(isMedevac(undefined)).toBe(false);
    });

    it('ignores malformed details', () => {
        expect(medevacDetail({ medevac: 'x' })).toBeUndefined();
        expect(medevacDetail({ medevac: [] })).toBeUndefined();
        expect(medevacDetail({})).toBeUndefined();
    });

    it('only reports the presence of ZMIST', () => {
        expect(hasZMist({ _attributes: {}, zMistsMap: {} })).toBe(true);
        expect(hasZMist({ _attributes: {} })).toBe(false);
        expect(hasZMist(undefined)).toBe(false);
    });
});

describe('MEDEVAC form', () => {
    it('reads the ATAK detail', () => {
        const form = formFromDetail(atakDetail());

        expect(form.title).toBe('TEST.19.101500');
        expect(form.freq).toBe('40.500');
        expect(form.precedence).toEqual({ urgent: 1, urgent_surgical: 1, priority: 2, routine: 0, convenience: 0 });
        expect(form.equipment).toEqual({ equipment_none: false, hoist: true, extraction_equipment: false, ventilator: false, equipment_other: true });
        expect(form.equipment_detail).toBe('Test equipment');
        expect(form.patients).toEqual({ litter: 2, ambulatory: 2 });
        expect(form.security).toBe(1);
        expect(form.hlz_marking).toBe(4);
        expect(form.hlz_other).toBe('Test marking');
        expect(form.nationality).toEqual({ us_military: 3, us_civilian: 0, nonus_military: 0, nonus_civilian: 0, epw: 1, child: 0 });
        expect(form.terrain).toEqual({ terrain_none: false, terrain_slope: true, terrain_rough: false, terrain_loose: false, terrain_other: true });
        expect(form.terrain_slope_dir).toBe('W');
        expect(form.terrain_other_detail).toBe('Wires & poles <10m');
        expect(form.hlz.winds_are_from).toBe('SW 5kt');
        expect(totalPatients(form)).toBe(4);
    });

    it('accepts string flags as written by ATAK and falls back on bad values', () => {
        const form = formFromDetail({
            _attributes: { hoist: 'TRUE', security: '9', hlz_marking: 'x', urgent: '-2', priority: 'abc', terrain_slope_dir: 'Q' }
        });

        expect(form.equipment.hoist).toBe(true);
        expect(form.security).toBe(0);
        expect(form.hlz_marking).toBe(3);
        expect(form.precedence.urgent).toBe(0);
        expect(form.precedence.priority).toBe(0);
        expect(form.terrain_slope_dir).toBe('N');
    });

    it('starts empty with the ATAK defaults', () => {
        const form = emptyMedevacForm('ALPHA.19.101500');

        expect(form.title).toBe('ALPHA.19.101500');
        expect(form.equipment.equipment_none).toBe(true);
        expect(form.terrain.terrain_none).toBe(true);
        expect(form.security).toBe(0);
        expect(form.hlz_marking).toBe(3);

        expect(detailFromForm(form)).toEqual({
            _attributes: {
                casevac: false,
                title: 'ALPHA.19.101500',
                equipment_none: true,
                security: '0',
                hlz_marking: '3',
                terrain_none: true,
            }
        });
    });

    it('writes attributes the way MedicalDetailHandler does', () => {
        const form = emptyMedevacForm('T');
        form.freq = ' 40.500 ';
        form.precedence.urgent = 2;
        form.precedence.routine = 0;
        form.equipment = toggleChoice(form.equipment, 'ventilator', true, 'equipment_none');
        form.equipment_detail = '';
        form.patients.litter = 1;
        form.nationality.child = 1;
        form.terrain = toggleChoice(form.terrain, 'terrain_rough', true, 'terrain_none');
        form.terrain_slope_dir = 'E';
        form.hlz.friendlies = '  ';

        const attrs = detailFromForm(form)._attributes;

        expect(attrs).toEqual({
            casevac: false,
            title: 'T',
            freq: '40.500',
            urgent: '2',
            ventilator: true,
            litter: '1',
            security: '0',
            hlz_marking: '3',
            child: '1',
            terrain_rough: true,
        });
    });

    it('writes the slope direction only with sloping terrain', () => {
        const form = emptyMedevacForm();
        form.terrain = toggleChoice(form.terrain, 'terrain_slope', true, 'terrain_none');
        form.terrain_slope_dir = 'S';

        expect(detailFromForm(form)._attributes).toMatchObject({ terrain_slope: true, terrain_slope_dir: 'S' });
        expect(detailFromForm(form)._attributes).not.toHaveProperty('terrain_none');

        form.terrain = toggleChoice(form.terrain, 'terrain_slope', false, 'terrain_none');
        expect(detailFromForm(form)._attributes).not.toHaveProperty('terrain_slope_dir');
        expect(detailFromForm(form)._attributes).toMatchObject({ terrain_none: true });
    });

    it('removes cleared values and keeps unmanaged ones', () => {
        const base: MedevacDetail = {
            _attributes: { casevac: true, urgent: '3', hoist: true, medline_remarks: 'x', zone_prot_marker: '1,2' },
            zMistsMap: { zMist: { _attributes: { title: 'ZMIST1' } } }
        };

        const form = formFromDetail(base);
        form.precedence.urgent = 0;
        form.equipment = toggleChoice(form.equipment, 'hoist', false, 'equipment_none');

        const detail = detailFromForm(form, base);

        expect(detail._attributes).not.toHaveProperty('urgent');
        expect(detail._attributes).not.toHaveProperty('hoist');
        expect(detail._attributes).toMatchObject({ casevac: true, equipment_none: true, medline_remarks: 'x', zone_prot_marker: '1,2' });
        expect(detail.zMistsMap).toEqual(base.zMistsMap);
        // The input is not modified
        expect(base._attributes).toHaveProperty('urgent', '3');
    });

    it('owns no attribute twice', () => {
        expect(new Set(MANAGED_ATTRIBUTES).size).toBe(MANAGED_ATTRIBUTES.length);
    });
});

describe('MEDEVAC choice groups (Line 4 & 9)', () => {
    const none = { equipment_none: true, hoist: false, extraction_equipment: false, ventilator: false, equipment_other: false };

    it('a choice clears None', () => {
        expect(toggleChoice(none, 'hoist', true, 'equipment_none')).toMatchObject({ equipment_none: false, hoist: true });
    });

    it('None clears the choices', () => {
        const chosen = { ...none, equipment_none: false, hoist: true, ventilator: true };
        expect(toggleChoice(chosen, 'equipment_none', true, 'equipment_none')).toEqual(none);
    });

    it('clearing the last choice falls back to None', () => {
        const chosen = { ...none, equipment_none: false, hoist: true };
        expect(toggleChoice(chosen, 'hoist', false, 'equipment_none')).toEqual(none);
    });

    it('None cannot be cleared on its own', () => {
        expect(toggleChoice(none, 'equipment_none', false, 'equipment_none')).toEqual(none);
    });
});

describe('MEDEVAC readout (GenerateReadout)', () => {
    it('reads out lines like ATAK', () => {
        const form = formFromDetail(atakDetail());

        expect(lineThree(form)).toBe('1xA, 1xB, 2xC');
        expect(lineFour(form)).toBe('B - Hoist\nOther (Specify)');
        expect(lineFive(form)).toBe('Litter x 2, Ambulatory x 2');
        expect(lineSix(form)).toBe('P - Possible enemy troops in area');
        expect(lineSeven(form)).toBe('E - Other (Specify)');
        expect(lineEight(form)).toBe('3xA, 1xE');
        expect(lineNine(form)).toBe('Sloping terrain to the W\nOther (Specify)');

        expect(medevacReadout({ location: '32T MN 12345 67890', callsign: 'TEST.19.101500', form })).toBe([
            READOUT_HEADER,
            '',
            '1. 32T MN 12345 67890',
            '2. Call Sign: TEST.19.101500 Freq: 40.500',
            '3. 1xA, 1xB, 2xC',
            '4. B - Hoist\nOther: Test equipment',
            '5. Litter x 2, Ambulatory x 2',
            '6. P - Possible enemy troops in area',
            '7. Test marking',
            '8. 3xA, 1xE',
            '9. Sloping terrain to the W\nOther: Wires & poles <10m',
            ''
        ].join('\n'));
    });

    it('reads out an empty 9-Line with the ATAK placeholders', () => {
        const readout = medevacReadout({ location: '32T MN 12345 67890', callsign: 'ALPHA.19.101500', form: emptyMedevacForm() });

        expect(readout.startsWith('(AIRCRAFT CALLSIGN), ADVISE WHEN READY FOR GAME PLAN.\n\nADVISE WHEN READY FOR 9-LINE.\n\n1. ')).toBe(true);
        expect(readout).toContain('\n2. Call Sign: ALPHA.19.101500 Freq: \n');
        expect(readout).toContain('\n3. Patient by Precedence\n');
        expect(readout).toContain('\n4. A - None\n');
        expect(readout).toContain('\n5. Patient by Type\n');
        expect(readout).toContain('\n6. N - No enemy troops in area\n');
        expect(readout).toContain('\n7. D - None\n');
        expect(readout).toContain('\n8. Patients by Nationality\n');
        expect(readout).toContain('\n9. None\n');
    });
});

describe('MEDEVAC callsign', () => {
    it('follows the ATAK pattern in UTC', () => {
        expect(medevacCallsign('ALPHA', new Date('2026-11-09T07:05:03Z'))).toBe('ALPHA.09.070503');
    });

    it('falls back without an own callsign', () => {
        expect(medevacCallsign('  ', new Date('2026-11-19T23:59:59Z'))).toBe('med9line.19.235959');
        expect(medevacCallsign(undefined, new Date('2026-11-19T23:59:59Z'))).toBe('med9line.19.235959');
    });
});
