import test from 'node:test';
import assert from 'node:assert';
import { Ajv } from 'ajv';
import { CoTParser } from '@tak-ps/node-cot';
import { FeatureResponse } from '../common/types.js';

/*
 * PzBat12: the ATAK MEDEVAC 9-Line detail (_medevac_) must survive every hop
 * through the API - it depends on app/patches/@tak-ps+node-cot+14.59.0.patch
 * (applied to api/node_modules by the Dockerfile). Values are invented.
 */
const XML = `<event version="2.0" uid="medevac-test-0001" type="b-r-f-h-c" time="2026-11-19T10:15:00.000Z" start="2026-11-19T10:15:00.000Z" stale="2026-11-20T10:15:00.000Z" how="h-g-i-g-o">
    <point lat="46.5" lon="7.5" hae="600.0" ce="9999999.0" le="9999999.0"/>
    <detail>
        <archive/>
        <contact callsign="TEST.19.101500"/>
        <_medevac_ casevac="false" title="TEST.19.101500" freq="40.500" urgent="1" priority="2" hoist="true" litter="1" security="1" hlz_marking="3" terrain_rough="true" hlz_remarks="Wires &amp; poles" future_attribute="kept">
            <zMistsMap>
                <zMist title="ZMIST1" z="Z1" m="M1" i="I1" s="S1" t="T1"/>
            </zMistsMap>
        </_medevac_>
    </detail>
</event>`;

function medevacOf(cot: ReturnType<typeof CoTParser.from_xml>): unknown {
    return (cot.raw.event.detail as Record<string, unknown> | undefined)?._medevac_;
}

test('MEDEVAC: _medevac_ survives TAK -> API -> Browser -> API -> TAK', async () => {
    const original = CoTParser.from_xml(XML);
    const expected = JSON.parse(JSON.stringify(medevacOf(original)));

    // TAK Server -> API (connection pool) -> WebSocket
    const feat = JSON.parse(JSON.stringify(await CoTParser.to_geojson(original, { normalize2525: true })));
    assert.deepStrictEqual(feat.properties.medevac, expected);

    // PUT /profile/feature - batch-schema validates with removeAdditional: 'all'
    const ajv = new Ajv({ strict: false, allErrors: true, useDefaults: true, removeAdditional: 'all', coerceTypes: true });
    const validate = ajv.compile(FeatureResponse);
    const body = { ...feat, path: '/' };
    assert.ok(validate(body), JSON.stringify(validate.errors));
    assert.deepStrictEqual(body.properties.medevac, expected, 'route validation must keep properties.medevac');

    // Browser -> API (WebSocket / Share) -> TAK Server
    const xml = CoTParser.to_xml(await CoTParser.from_geojson(body));
    assert.deepStrictEqual(medevacOf(CoTParser.from_xml(xml)), expected);
});
