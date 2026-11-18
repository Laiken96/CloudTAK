import { describe, expect, it } from 'vitest';
import type { LineString } from 'geojson';
import {
    argbToHex,
    gpxBounds,
    gpxFeatures,
    gpxFileName,
    hexToArgb,
    parseGpx,
    routeToGpx,
} from './gpx.ts';

// An ATAK route export: red, 5 wide, with a point repeated within 1 m
const ATAK_ROUTE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ATAK" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tak="http://tak.gov">
  <rte>
    <name>Route Nord</name>
    <desc>Marschachse #MERKUR</desc>
    <extensions>
      <tak:LineColor>-65536</tak:LineColor>
      <tak:LineWidth>5.0</tak:LineWidth>
    </extensions>
    <rtept lat="47.4508" lon="7.0536"><ele>425.0</ele></rtept>
    <rtept lat="47.450805" lon="7.053605"><ele>425.0</ele></rtept>
    <rtept lat="47.4600" lon="7.0700"><ele>440.0</ele></rtept>
    <rtept lat="47.4700" lon="7.0900"><ele>460.0</ele></rtept>
  </rte>
</gpx>`;

// A Garmin track in two segments, a waypoint and a route of a single point
const GARMIN = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">
  <metadata><name>Übung FURY</name></metadata>
  <wpt lat="47.4550" lon="7.0600"><ele>430</ele><name>Brücke</name><desc>Tragfähigkeit prüfen</desc></wpt>
  <wpt lat="47.4560" lon="7.0610"></wpt>
  <wpt lat="abc" lon="7.0610"></wpt>
  <rte><name>Einzelpunkt</name><rtept lat="47.45" lon="7.05"/></rte>
  <trk>
    <extensions><gpxx:TrackExtension><gpxx:DisplayColor>DarkBlue</gpxx:DisplayColor></gpxx:TrackExtension></extensions>
    <trkseg>
      <trkpt lat="47.40" lon="7.00"/>
      <trkpt lat="47.41" lon="7.01"/>
    </trkseg>
    <trkseg>
      <trkpt lat="47.42" lon="7.02"/>
    </trkseg>
  </trk>
</gpx>`;

describe('parseGpx', () => {
    it('reads an ATAK route with its colour and width, dropping points within 1 m', () => {
        const doc = parseGpx(ATAK_ROUTE);

        expect(doc.paths).toHaveLength(1);
        expect(doc.skipped).toEqual(1);

        const [route] = doc.paths;
        expect(route).toMatchObject({ kind: 'rte', name: 'Route Nord', desc: 'Marschachse #MERKUR', color: '#ff0000', width: 5 });
        expect(route.points.map((p) => [p.lng, p.lat, p.ele])).toEqual([
            [7.0536, 47.4508, 425],
            [7.07, 47.46, 440],
            [7.09, 47.47, 460]
        ]);
    });

    it('joins the segments of a track into one route and keeps Garmin colours', () => {
        const doc = parseGpx(GARMIN);

        expect(doc.name).toEqual('Übung FURY');
        expect(doc.paths).toHaveLength(1);
        expect(doc.paths[0]).toMatchObject({ kind: 'trk', name: 'GPX Track 1', color: '#00008b' });
        expect(doc.paths[0].points).toHaveLength(3);
    });

    it('reads standalone waypoints and skips broken ones', () => {
        const doc = parseGpx(GARMIN);

        expect(doc.waypoints).toEqual([
            { lng: 7.06, lat: 47.455, ele: 430, name: 'Brücke', desc: 'Tragfähigkeit prüfen' },
            { lng: 7.061, lat: 47.456 }
        ]);
    });

    it('rejects what is no GPX', () => {
        expect(() => parseGpx('<kml xmlns="http://www.opengis.net/kml/2.2"/>')).toThrow('Not a GPX file');
        expect(() => parseGpx('no xml at all')).toThrow('Not a GPX file');
    });
});

describe('gpxFeatures', () => {
    const now = new Date('2026-11-18T08:00:00.000Z');
    let n = 0;
    const id = () => `gpx-${++n}`;

    it('turns routes into TAK routes and waypoints into spot markers', () => {
        n = 0;
        const features = gpxFeatures(parseGpx(GARMIN), { now, id });

        expect(features.map((f) => [f.id, f.properties.type, f.properties.callsign])).toEqual([
            ['gpx-1', 'b-m-r', 'GPX Track 1'],
            ['gpx-2', 'b-m-p-s-m', 'Brücke'],
            ['gpx-3', 'b-m-p-s-m', 'GPX Waypoint 2']
        ]);

        const [route, bridge] = features;
        expect(route.properties).toMatchObject({
            how: 'h-e',
            archived: true,
            stroke: '#00008b',
            'stroke-width': 3,
            time: '2026-11-18T08:00:00.000Z',
            stale: '2026-11-18T10:00:00.000Z'
        });
        expect(route.geometry).toEqual({ type: 'LineString', coordinates: [[7, 47.4], [7.01, 47.41], [7.02, 47.42]] });

        expect(bridge.properties).toMatchObject({ remarks: 'Tragfähigkeit prüfen', 'marker-color': '#ffffff', center: [7.06, 47.455] });
        expect(bridge.geometry).toEqual({ type: 'Point', coordinates: [7.06, 47.455, 430] });
    });

    it('imports only what is asked for', () => {
        const doc = parseGpx(GARMIN);
        expect(gpxFeatures(doc, { waypoints: false }).map((f) => f.properties.type)).toEqual(['b-m-r']);
        expect(gpxFeatures(doc, { routes: false }).map((f) => f.properties.type)).toEqual(['b-m-p-s-m', 'b-m-p-s-m']);
    });

    it('gives every feature its own id', () => {
        const features = gpxFeatures(parseGpx(GARMIN));
        expect(new Set(features.map((f) => f.id)).size).toEqual(features.length);
        for (const f of features) expect(f.properties.id).toEqual(f.id);
    });

    it('measures the area to show after an import', () => {
        expect(gpxBounds(gpxFeatures(parseGpx(GARMIN)))).toEqual([7, 47.4, 7.061, 47.456]);
        expect(gpxBounds([])).toBeNull();
    });
});

describe('routeToGpx', () => {
    it('writes a route that reads back the same, with ATAK colour and width', () => {
        const [route] = gpxFeatures(parseGpx(ATAK_ROUTE), { waypoints: false });
        route.properties.callsign = 'Route <Nord> & "Süd"';

        const gpx = routeToGpx({ properties: route.properties, geometry: route.geometry as LineString });
        expect(gpx).toContain('<tak:LineColor>-65536</tak:LineColor>');
        expect(gpx).toContain('<tak:LineWidth>5.0</tak:LineWidth>');
        expect(gpx).toContain('<name>Route &lt;Nord&gt; &amp; &quot;Süd&quot;</name>');

        const back = parseGpx(gpx);
        expect(back.paths).toHaveLength(1);
        expect(back.paths[0]).toMatchObject({ name: 'Route <Nord> & "Süd"', desc: 'Marschachse #MERKUR', color: '#ff0000', width: 5 });
        expect(back.paths[0].points.map((p) => [p.lng, p.lat, p.ele])).toEqual(
            (route.geometry as LineString).coordinates
        );
    });

    it('writes plain points when the route has no heights', () => {
        const gpx = routeToGpx({
            properties: { callsign: 'Patrouille' },
            geometry: { type: 'LineString', coordinates: [[7, 47], [7.1, 47.1]] }
        });

        expect(gpx).toContain('<rtept lat="47.0000000" lon="7.0000000"/>');
        expect(gpx).toContain('<tak:LineColor>-1</tak:LineColor>');
        expect(gpx).not.toContain('<desc>');
    });
});

describe('helpers', () => {
    it('converts colours between ATAK integers and hex', () => {
        expect(argbToHex(-1)).toEqual('#ffffff');
        expect(argbToHex(-65536)).toEqual('#ff0000');
        expect(hexToArgb('#ffffff')).toEqual(-1);
        expect(hexToArgb('#00008b')).toEqual(-16777077);
        expect(argbToHex(hexToArgb('#12ab34'))).toEqual('#12ab34');
    });

    it('names the exported file after the route', () => {
        expect(gpxFileName('Route Nord/Süd')).toEqual('Route-Nord-Sud.gpx');
        expect(gpxFileName('***')).toEqual('route.gpx');
    });
});
