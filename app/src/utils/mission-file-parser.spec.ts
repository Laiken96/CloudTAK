import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { CoTParser } from '@tak-ps/node-cot';
import { xml2js } from '@tak-ps/xml-js';
import { cotXmlToFeatures, parseMissionFile } from './mission-file-parser.ts';
import { MISSION_FILE_MAX_BYTES, MissionFileError, missionFileKind } from './mission-file-kind.ts';
import { xmlToCompact, normalizeBooleanAttributes } from './xml-compact.ts';
import { kmlToFeatures } from './kml-features.ts';
import type { Feature } from '../types.ts';

// Invented test data - places, callsigns and UIDs are made up

const AREA_UID = '7f3c2a10-0000-4000-8000-00000000a001';
const MARKER_UID = '7f3c2a10-0000-4000-8000-00000000a002';
const LINE_UID = '7f3c2a10-0000-4000-8000-00000000a003';

const AREA_COT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="${AREA_UID}" type="u-d-f" time="2026-11-20T08:00:00.000Z" start="2026-11-20T08:00:00.000Z" stale="2027-11-20T08:00:00.000Z" how="h-e">
    <point lat="46.9500" lon="7.4400" hae="9999999.0" ce="9999999.0" le="9999999.0"/>
    <detail>
        <link point="46.9500,7.4400,540.0"/>
        <link point="46.9510,7.4420,541.0"/>
        <link point="46.9525,7.4405,542.0"/>
        <link point="46.9500,7.4400,540.0"/>
        <strokeColor value="-65536"/>
        <strokeWeight value="4.0"/>
        <fillColor value="1358889216"/>
        <contact callsign="Übungsraum Ost"/>
        <remarks>Testfläche &amp; Sperrzone #UEBUNG</remarks>
        <archive/>
        <labels_on value="false"/>
        <color value="-65536"/>
        <creator uid="ANDROID-test-0001" callsign="ADLER 3" time="2026-11-20T08:00:00.000Z" type="a-f-G-U-C"/>
    </detail>
</event>`;

const MARKER_COT = `<event version="2.0" uid="${MARKER_UID}" type="a-h-G-U-C-A" time="2026-11-20T09:00:00.000Z" start="2026-11-20T09:00:00.000Z" stale="2026-11-21T09:00:00.000Z" how="m-g">
    <point lat="46.9612" lon="7.4733" hae="551.2" ce="10" le="10"/>
    <detail>
        <contact callsign="FEIND 1"/>
        <remarks>Beobachtet bei Waldrand</remarks>
        <usericon iconsetpath="COT_MAPPING_2525B/a-h/a-h-G"/>
        <precisionlocation altsrc="DTED0"/>
        <_flow-tags_ TAK-Server-0000="2026-11-20T09:00:01Z"/>
        <archive/>
    </detail>
</event>`;

const LINE_COT = `<event version="2.0" uid="${LINE_UID}" type="u-d-f" time="2026-11-20T10:00:00.000Z" start="2026-11-20T10:00:00.000Z" stale="2027-11-20T10:00:00.000Z" how="h-e">
    <point lat="46.94" lon="7.43" hae="0" ce="9999999" le="9999999"/>
    <detail>
        <link point="46.9400,7.4300,0"/>
        <link point="46.9410,7.4350,0"/>
        <link point="46.9390,7.4410,0"/>
        <strokeColor value="-16776961"/>
        <strokeWeight value="3.0"/>
        <contact callsign="Sperrlinie Nord"/>
        <labels_on value="true"/>
    </detail>
</event>`;

/** The GeoJSON the server delivers for a mission object (node-cot in Node) */
async function serverGeoJSON(xml: string): Promise<Feature> {
    const feature = JSON.parse(JSON.stringify(await CoTParser.to_geojson(CoTParser.from_xml(xml)))) as Feature;
    // from_xml stamps its own flow tag on the event
    for (const key of Object.keys(feature.properties.flow ?? {})) {
        if (key.startsWith('NodeCoT')) delete (feature.properties.flow as Record<string, unknown>)[key];
    }
    if (feature.properties.flow && !Object.keys(feature.properties.flow).length) delete feature.properties.flow;
    return feature;
}

async function single(xml: string): Promise<Feature> {
    const result = await cotXmlToFeatures(xml, { idPrefix: 'file' });
    expect(result).not.toBeNull();
    expect(result!.features).toHaveLength(1);
    return result!.features[0];
}

function bytes(text: string): Uint8Array {
    return strToU8(text);
}

describe('xml-compact', () => {
    it('builds the same tree as xml-js', () => {
        for (const xml of [AREA_COT, MARKER_COT, LINE_COT]) {
            const expected = xml2js(xml, { compact: true }) as Record<string, unknown>;
            delete expected._declaration;
            normalizeBooleanAttributes(expected);

            const actual = xmlToCompact(xml);
            normalizeBooleanAttributes(actual);

            expect(actual).toEqual(expected);
        }
    });

    it('keeps text and CDATA as xml-js does', () => {
        const xml = '<event><detail><remarks>a <![CDATA[<b>]]> c</remarks><link a="1"/><link a="2"/></detail></event>';
        const expected = xml2js(xml, { compact: true });

        expect(xmlToCompact(xml)).toEqual(expected);
    });
});

describe('mission file kinds', () => {
    it('knows the map files by name or MIME type', () => {
        expect(missionFileKind('Freihand 1.cot')).toBe('cot');
        expect(missionFileKind('ZEICHNUNG.XML')).toBe('cot');
        expect(missionFileKind('Gelände.kml')).toBe('kml');
        expect(missionFileKind('Gelände.KMZ')).toBe('kmz');
        expect(missionFileKind('Übung.zip')).toBe('package');
        expect(missionFileKind('noext', 'application/vnd.google-earth.kml+xml')).toBe('kml');

        expect(missionFileKind('Foto.jpg', 'image/jpeg')).toBeNull();
        expect(missionFileKind('Befehl.pdf')).toBeNull();
        expect(missionFileKind('noext')).toBeNull();
    });
});

describe('CoT files', () => {
    it('reads a single drawing exactly as the server reads a mission object', async () => {
        const feature = await single(AREA_COT);

        expect(feature).toEqual(await serverGeoJSON(AREA_COT));
        expect(feature.id).toBe(AREA_UID);
        expect(feature.geometry.type).toBe('Polygon');
        expect(feature.properties.callsign).toBe('Übungsraum Ost');
        expect(feature.properties.remarks).toBe('Testfläche & Sperrzone #UEBUNG');
        expect(feature.properties.archived).toBe(true);
        expect(feature.properties.labels).toBe(false);
        expect(feature.properties['stroke-width']).toBe(4);
    });

    it('reads markers and lines exactly as the server does', async () => {
        const marker = await single(MARKER_COT);
        expect(marker).toEqual(await serverGeoJSON(MARKER_COT));
        expect(marker.properties.flow).toEqual({ 'TAK-Server-0000': '2026-11-20T09:00:01Z' });

        const line = await single(LINE_COT);
        expect(line).toEqual(await serverGeoJSON(LINE_COT));
        expect(line.geometry.type).toBe('LineString');
    });

    it('reads several events, skips chats and counts broken ones', async () => {
        const xml = `<events>
            ${MARKER_COT}
            ${LINE_COT}
            <event version="2.0" uid="chat-1" type="b-t-f" time="2026-11-20T10:00:00Z" start="2026-11-20T10:00:00Z" stale="2026-11-20T11:00:00Z" how="h-g-i-g-o">
                <point lat="0" lon="0" hae="0" ce="0" le="0"/>
                <detail><remarks>Hallo</remarks></detail>
            </event>
            <event version="2.0" uid="broken-1" type="a-f-G" time="2026-11-20T10:00:00Z" start="2026-11-20T10:00:00Z" stale="2026-11-20T11:00:00Z" how="m-g">
                <detail/>
            </event>
        </events>`;

        const result = await cotXmlToFeatures(xml, { idPrefix: 'file' });

        expect(result!.features.map((f) => f.id)).toEqual([MARKER_UID, LINE_UID]);
        expect(result!.invalid).toBe(1);
    });

    it('gives an event without UID the same id on every read', async () => {
        const xml = MARKER_COT.replace(` uid="${MARKER_UID}"`, '');

        const a = await parseMissionFile('cot', bytes(xml), { idPrefix: 'abcdef' });
        const b = await parseMissionFile('cot', bytes(xml), { idPrefix: 'abcdef' });

        expect(a[0].id).toBe('abcdef-1');
        expect(b[0].id).toBe('abcdef-1');
    });

    it('refuses a broken, an empty and a non-CoT file', async () => {
        await expect(parseMissionFile('cot', bytes('<event uid="x"><point'), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('cot', new Uint8Array(), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('cot', bytes('<config><a/></config>'), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('cot', bytes(MARKER_COT.replace(/<point[^>]*\/>/, '')), { idPrefix: 'p' }))
            .rejects.toBeInstanceOf(MissionFileError);
    });

    it('reads an empty event list as a file without objects', async () => {
        expect(await parseMissionFile('cot', bytes('<events></events>'), { idPrefix: 'p' })).toEqual([]);
    });

    it('refuses files above the size limit', async () => {
        const big = new Uint8Array(MISSION_FILE_MAX_BYTES + 1);

        await expect(parseMissionFile('cot', big, { idPrefix: 'p' })).rejects.toMatchObject({ reason: 'too-large' });
    });
});

describe('data packages', () => {
    const MANIFEST = `<MissionPackageManifest version="2">
        <Configuration>
            <Parameter name="uid" value="pkg-0001"/>
            <Parameter name="name" value="Übung Ost"/>
        </Configuration>
        <Contents>
            <Content ignore="false" zipEntry="${AREA_UID}/${AREA_UID}.cot"><Parameter name="uid" value="${AREA_UID}"/></Content>
            <Content ignore="false" zipEntry="b/marker.cot"/>
            <Content ignore="true" zipEntry="old/line.cot"/>
            <Content ignore="false" zipEntry="foto.jpg"/>
        </Contents>
    </MissionPackageManifest>`;

    it('reads the CoT of a data package and ignores everything else', async () => {
        const zip = zipSync({
            'MANIFEST/manifest.xml': strToU8(MANIFEST),
            [`${AREA_UID}/${AREA_UID}.cot`]: strToU8(AREA_COT),
            'b/marker.cot': strToU8(MARKER_COT),
            'old/line.cot': strToU8(LINE_COT),
            'foto.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
            'prefs/settings.xml': strToU8('<preferences><entry key="a">b</entry></preferences>'),
        });

        const features = await parseMissionFile('package', zip, { idPrefix: 'p' });

        expect(features.map((f) => f.id).sort()).toEqual([AREA_UID, MARKER_UID].sort());
        expect(features.find((f) => f.id === AREA_UID)).toEqual(await serverGeoJSON(AREA_COT));
    });

    it('keeps the first of two objects with the same UID', async () => {
        const zip = zipSync({
            'a.cot': strToU8(MARKER_COT),
            'b.cot': strToU8(MARKER_COT.replace('FEIND 1', 'FEIND 2')),
        });

        const features = await parseMissionFile('package', zip, { idPrefix: 'p' });

        expect(features).toHaveLength(1);
        expect(features[0].properties.callsign).toBe('FEIND 1');
    });

    it('skips a broken entry and reads the others', async () => {
        const zip = zipSync({
            'a.cot': strToU8('<event uid="x"'),
            'b.cot': strToU8(MARKER_COT),
        });

        const features = await parseMissionFile('package', zip, { idPrefix: 'p' });
        expect(features.map((f) => f.id)).toEqual([MARKER_UID]);
    });

    it('refuses a zip that is not readable or holds only broken CoT', async () => {
        await expect(parseMissionFile('package', bytes('not a zip'), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });

        const broken = zipSync({ 'a.cot': strToU8('<event') });
        await expect(parseMissionFile('package', broken, { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
    });

    it('reads a data package without CoT as a file without objects', async () => {
        const zip = zipSync({ 'foto.jpg': new Uint8Array([1, 2, 3]) });
        expect(await parseMissionFile('package', zip, { idPrefix: 'p' })).toEqual([]);
    });
});

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
    <Style id="rot"><LineStyle><color>ff0000ff</color><width>5</width></LineStyle></Style>
    <Style id="blau-normal"><LineStyle><color>80ff0000</color></LineStyle><PolyStyle><color>4000ff00</color></PolyStyle></Style>
    <StyleMap id="blau">
        <Pair><key>normal</key><styleUrl>#blau-normal</styleUrl></Pair>
        <Pair><key>highlight</key><styleUrl>#rot</styleUrl></Pair>
    </StyleMap>
    <Folder>
        <name>Ordner</name>
        <Placemark id="pm-punkt">
            <name>Treffpunkt ALPHA</name>
            <description><![CDATA[<b>Sammeln</b> um 0600]]></description>
            <Style><IconStyle><color>ff00ffff</color></IconStyle></Style>
            <Point><coordinates>7.4501,46.9480,560</coordinates></Point>
        </Placemark>
        <Placemark>
            <name>Achse</name>
            <styleUrl>#rot</styleUrl>
            <LineString><coordinates>
                7.40,46.90 7.41,46.91
                7.42,46.90
            </coordinates></LineString>
        </Placemark>
    </Folder>
    <Placemark>
        <name>Raum</name>
        <styleUrl>#blau</styleUrl>
        <Polygon>
            <outerBoundaryIs><LinearRing><coordinates>7.30,46.80 7.32,46.80 7.32,46.82 7.30,46.82 7.30,46.80</coordinates></LinearRing></outerBoundaryIs>
            <innerBoundaryIs><LinearRing><coordinates>7.305,46.805 7.31,46.805 7.31,46.81</coordinates></LinearRing></innerBoundaryIs>
        </Polygon>
    </Placemark>
    <Placemark id="pm-multi">
        <name>Zwei Teile</name>
        <Style><PolyStyle><color>ff123456</color><fill>0</fill></PolyStyle></Style>
        <MultiGeometry>
            <Point><coordinates>7.5,46.9</coordinates></Point>
            <Polygon><outerBoundaryIs><LinearRing><coordinates>7.5,46.9 7.6,46.9 7.6,47.0 7.5,46.9</coordinates></LinearRing></outerBoundaryIs></Polygon>
        </MultiGeometry>
    </Placemark>
    <Placemark><name>Ohne Geometrie</name></Placemark>
    <GroundOverlay><name>Bild</name></GroundOverlay>
</Document>
</kml>`;

describe('KML', () => {
    it('reads Placemarks with names, descriptions and styles', () => {
        const features = kmlToFeatures(KML, { idPrefix: 'kml' });

        expect(features.map((f) => f.id)).toEqual(['pm-punkt', 'kml-2', 'kml-3', 'pm-multi-1', 'pm-multi-2']);

        const [point, line, area, multiPoint, multiArea] = features;

        expect(point.geometry).toEqual({ type: 'Point', coordinates: [7.4501, 46.948, 560] });
        expect(point.properties).toMatchObject({
            type: 'u-d-p',
            callsign: 'Treffpunkt ALPHA',
            remarks: 'Sammeln um 0600',
            archived: true,
            'marker-color': '#ffff00',
            'marker-opacity': 1,
        });

        expect(line.geometry.type).toBe('LineString');
        expect(line.properties).toMatchObject({
            type: 'u-d-f',
            callsign: 'Achse',
            stroke: '#ff0000',
            'stroke-opacity': 1,
            'stroke-width': 5,
        });

        expect(area.geometry.type).toBe('Polygon');
        expect((area.geometry as GeoJSON.Polygon).coordinates).toHaveLength(2);
        // The hole is closed
        expect((area.geometry as GeoJSON.Polygon).coordinates[1]).toHaveLength(4);
        expect(area.properties).toMatchObject({
            stroke: '#0000ff',
            'stroke-opacity': 0.5,
            fill: '#00ff00',
            'fill-opacity': 0.25,
        });

        expect(multiPoint.geometry.type).toBe('Point');
        expect(multiArea.properties).toMatchObject({ fill: '#563412', 'fill-opacity': 0 });
    });

    it('reads the same ids every time', () => {
        expect(kmlToFeatures(KML, { idPrefix: 'kml' })).toEqual(kmlToFeatures(KML, { idPrefix: 'kml' }));
    });

    it('reads a KML file and a KMZ with doc.kml', async () => {
        expect(await parseMissionFile('kml', bytes(KML), { idPrefix: 'kml' })).toHaveLength(5);

        const kmz = zipSync({
            'files/other.kml': strToU8('<kml><Document/></kml>'),
            'doc.kml': strToU8(KML),
            'files/icon.png': new Uint8Array([1, 2, 3]),
        });

        expect(await parseMissionFile('kmz', kmz, { idPrefix: 'kml' })).toHaveLength(5);
    });

    it('reads the first KML of a KMZ without doc.kml', async () => {
        const kmz = zipSync({ 'b.kml': strToU8('<kml><Document/></kml>'), 'a.kml': strToU8(KML) });

        expect(await parseMissionFile('kmz', kmz, { idPrefix: 'kml' })).toHaveLength(5);
    });

    it('refuses broken KML and KMZ', async () => {
        await expect(parseMissionFile('kml', bytes('<kml><Placemark>'), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('kml', bytes('<gpx/>'), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('kmz', zipSync({ 'a.txt': strToU8('x') }), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
        await expect(parseMissionFile('kml', new Uint8Array(), { idPrefix: 'p' }))
            .rejects.toMatchObject({ reason: 'invalid' });
    });
});
