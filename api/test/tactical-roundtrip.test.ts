import test from 'node:test';
import assert from 'node:assert';
import { Ajv } from 'ajv';
import { CoTParser } from '@tak-ps/node-cot';
import { FeatureResponse } from '../common/types.js';

/*
 * PzBat12: tactical graphics of regulation 52.003 (app/src/utils/tactical-graphics)
 * travel as a u-d-f shape with the __chsig detail and, where 2525C has an
 * equivalent, a __milsym 2525 graphic with <unitmodifier> children. Both must
 * survive every hop through the API - it depends on
 * app/patches/@tak-ps+node-cot+14.59.0.patch (applied to api/node_modules by
 * the Dockerfile). Values are invented.
 */
const XML = `<event version="2.0" uid="tg-test-0001" type="u-d-f" time="2026-11-20T10:15:00.000Z" start="2026-11-20T10:15:00.000Z" stale="2026-11-21T10:15:00.000Z" how="h-g-i-g-o">
    <point lat="47.0" lon="7.45" hae="0.0" ce="9999999.0" le="9999999.0"/>
    <detail>
        <archive/>
        <link point="47.0,7.40"/>
        <link point="47.005,7.42"/>
        <link point="47.0,7.44"/>
        <contact callsign="PhL GELB"/>
        <strokeColor value="-8331009"/>
        <strokeWeight value="3"/>
        <strokeStyle value="dashed"/>
        <labels_on value="true"/>
        <__milsym id="GFGAGLP---****X"><unitmodifier code="T">GELB</unitmodifier></__milsym>
        <__chsig sig="phase-line" t="GELB" planned="true" future_attribute="kept"/>
    </detail>
</event>`;

function detailOf(cot: ReturnType<typeof CoTParser.from_xml>): Record<string, unknown> {
    return (cot.raw.event.detail ?? {}) as Record<string, unknown>;
}

test('Tactical graphic: __chsig & __milsym/unitmodifier survive TAK -> API -> Browser -> API -> TAK', async () => {
    const original = CoTParser.from_xml(XML);
    const expectedChsig = JSON.parse(JSON.stringify(detailOf(original).__chsig));

    // TAK Server -> API (connection pool) -> WebSocket
    const feat = JSON.parse(JSON.stringify(await CoTParser.to_geojson(original, { normalize2525: true })));
    assert.deepStrictEqual(feat.properties.chsig, expectedChsig);
    assert.deepStrictEqual(feat.properties.milsym, {
        id: 'GFGAGLP---****X',
        unitmodifier: [{ _attributes: { code: 'T' }, _text: 'GELB' }],
    });

    // PUT /profile/feature - batch-schema validates with removeAdditional: 'all'
    const ajv = new Ajv({ strict: false, allErrors: true, useDefaults: true, removeAdditional: 'all', coerceTypes: true });
    const validate = ajv.compile(FeatureResponse);
    const body = { ...feat, path: '/' };
    assert.ok(validate(body), JSON.stringify(validate.errors));
    assert.deepStrictEqual(body.properties.chsig, expectedChsig, 'route validation must keep properties.chsig');
    assert.deepStrictEqual(body.properties.milsym.unitmodifier, [{ _attributes: { code: 'T' }, _text: 'GELB' }], 'route validation must keep the unit modifiers');

    // Browser -> API (WebSocket / Share) -> TAK Server
    const xml = CoTParser.to_xml(await CoTParser.from_geojson(body));
    const detail = detailOf(CoTParser.from_xml(xml));
    assert.deepStrictEqual(detail.__chsig, expectedChsig);
    assert.deepStrictEqual(detail.__milsym, {
        _attributes: { id: 'GFGAGLP---****X' },
        unitmodifier: { _attributes: { code: 'T' }, _text: 'GELB' },
    });
    // ATAK writes __milsym only for a multipoint graphic
    assert.strictEqual(detail.__milicon, undefined);
});

test('Tactical graphic drawn in CloudTAK: line without 2525 equivalent', async () => {
    const xml = CoTParser.to_xml(await CoTParser.from_geojson({
        id: 'tg-test-0002',
        type: 'Feature',
        path: '/',
        properties: {
            'id': 'tg-test-0002',
            'type': 'u-d-f',
            'how': 'h-g-i-g-o',
            'callsign': 'Mechanisierte Verschiebung 1. Kp',
            'time': '2026-11-20T10:15:00.000Z',
            'start': '2026-11-20T10:15:00.000Z',
            'stale': '2026-11-21T10:15:00.000Z',
            'center': [7.42, 47.0],
            'stroke': '#80E0FF',
            'stroke-style': 'solid',
            'stroke-width': 3,
            'labels': true,
            'chsig': { _attributes: { sig: 'movement-mechanised', t: '1. Kp', aff: 'f' } },
        },
        geometry: { type: 'LineString', coordinates: [[7.40, 47.0], [7.44, 47.0]] },
    } as Parameters<typeof CoTParser.from_geojson>[0]));

    const cot = CoTParser.from_xml(xml);
    const detail = detailOf(cot);
    assert.strictEqual(cot.raw.event._attributes.type, 'u-d-f');
    assert.deepStrictEqual(detail.__chsig, { _attributes: { sig: 'movement-mechanised', t: '1. Kp', aff: 'f' } });
    assert.strictEqual(detail.__milsym, undefined);
    assert.deepStrictEqual(detail.labels_on, { _attributes: { value: true } });
});

test('Points keep their __milicon', async () => {
    const xml = CoTParser.to_xml(await CoTParser.from_geojson({
        id: 'pt-test-0003',
        type: 'Feature',
        path: '/',
        properties: {
            id: 'pt-test-0003', type: 'a-f-G', how: 'h-g-i-g-o', callsign: 'P',
            time: '2026-11-20T10:15:00.000Z', start: '2026-11-20T10:15:00.000Z', stale: '2026-11-21T10:15:00.000Z',
            center: [7.42, 47.0],
            milsym: { id: 'GFGPGPP---****X' },
        },
        geometry: { type: 'Point', coordinates: [7.42, 47.0] },
    } as Parameters<typeof CoTParser.from_geojson>[0]));
    assert.ok(detailOf(CoTParser.from_xml(xml)).__milicon);
});
