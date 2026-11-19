import test from 'node:test';
import assert from 'node:assert';
import { CoTParser } from '@tak-ps/node-cot';
import { withMedevac } from '../src/medevac.js';

// Invented values - modelled on ATAK's MedicalDetailHandler
const XML = `<event version="2.0" uid="medevac-test-0001" type="b-r-f-h-c" time="2026-11-19T10:15:00.000Z" start="2026-11-19T10:15:00.000Z" stale="2026-11-20T10:15:00.000Z" how="h-g-i-g-o">
    <point lat="46.5" lon="7.5" hae="600.0" ce="9999999.0" le="9999999.0"/>
    <detail>
        <contact callsign="TEST.19.101500"/>
        <_medevac_ casevac="false" title="TEST" freq="40.500" urgent="1" equipment_none="true" security="0" hlz_marking="3" terrain_none="true">
            <zMistsMap>
                <zMist title="ZMIST1" z="Z1" m="M1" i="I1" s="S1" t="T1"/>
            </zMistsMap>
        </_medevac_>
    </detail>
</event>`;

test('withMedevac carries the ATAK _medevac_ detail into the Feature', async () => {
    const cot = CoTParser.from_xml(XML);
    const raw = (cot.raw.event.detail as Record<string, unknown>)._medevac_;
    const feat = withMedevac(cot.raw, await CoTParser.to_geojson(cot));
    const medevac = (feat.properties as Record<string, unknown>).medevac as Record<string, unknown>;

    assert.deepStrictEqual(medevac, JSON.parse(JSON.stringify(raw)));
    assert.deepStrictEqual((medevac._attributes as Record<string, unknown>).urgent, '1');
    assert.ok(medevac.zMistsMap, 'ZMIST child elements are kept');

    // A copy - the CoT is not shared with the Feature
    assert.notStrictEqual(medevac, raw);
});

test('withMedevac leaves other CoTs alone', async () => {
    const cot = CoTParser.from_xml(XML.replace(/<_medevac_[\s\S]*<\/_medevac_>/, ''));
    const feat = withMedevac(cot.raw, await CoTParser.to_geojson(cot));

    assert.strictEqual((feat.properties as Record<string, unknown>).medevac, undefined);
    assert.deepStrictEqual(withMedevac(undefined, { properties: {} }), { properties: {} });
});
