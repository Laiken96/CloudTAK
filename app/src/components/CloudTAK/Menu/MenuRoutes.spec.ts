import { Blob as NodeBlob } from 'node:buffer';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbAdd = vi.fn(async () => undefined);
const dbFilter = vi.fn(async (): Promise<unknown[]> => []);
const refresh = vi.fn(async () => undefined);
const fitBounds = vi.fn();

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        map: { fitBounds },
        worker: { db: { add: dbAdd, filter: dbFilter, remove: vi.fn() } },
        refresh
    })
}));

vi.mock('../../../std.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../std.ts')>()),
    server: { GET: vi.fn(async () => ({ data: { route: { enabled: false } } })) }
}));

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() })
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

import MenuRoutes from './MenuRoutes.vue';

const FURY = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Übung FURY</name></metadata>
  <wpt lat="47.4550" lon="7.0600"><name>Brücke</name></wpt>
  <wpt lat="47.4560" lon="7.0610"><name>Furt</name></wpt>
  <trk><name>Patrouille</name><trkseg>
    <trkpt lat="47.40" lon="7.00"/><trkpt lat="47.41" lon="7.01"/>
  </trkseg></trk>
</gpx>`;

async function render() {
    const wrapper = mount(MenuRoutes);
    await flushPromises();
    return wrapper;
}

/** Choose a file in the hidden file input */
async function choose(wrapper: Awaited<ReturnType<typeof render>>, name: string, text: string) {
    const input = wrapper.find('[data-test="gpx-file"]');
    Object.defineProperty(input.element, 'files', { value: [{ name, text: async () => text }], configurable: true });
    await input.trigger('change');
    await flushPromises();
}

describe('MenuRoutes GPX', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dbFilter.mockResolvedValue([]);
        vi.stubGlobal('Blob', NodeBlob);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('offers what a GPX file holds and imports it as routes and markers', async () => {
        const wrapper = await render();
        await choose(wrapper, 'fury.gpx', FURY);

        const panel = wrapper.find('[data-test="gpx-import"]');
        expect(panel.text()).toContain('fury.gpx');
        expect(panel.text()).toContain('Übung FURY: 1 route or track, 2 waypoints');

        await wrapper.find('[data-test="gpx-import-run"]').trigger('click');
        await flushPromises();

        expect(dbAdd).toHaveBeenCalledTimes(3);
        const added = dbAdd.mock.calls.map((call) => (call as unknown[])[0] as { properties: { type: string; callsign: string } });
        expect(added.map((f) => [f.properties.type, f.properties.callsign])).toEqual([
            ['b-m-r', 'Patrouille'],
            ['b-m-p-s-m', 'Brücke'],
            ['b-m-p-s-m', 'Furt']
        ]);
        for (const call of dbAdd.mock.calls) expect((call as unknown[])[1]).toEqual({ authored: true });

        expect(refresh).toHaveBeenCalled();
        expect(fitBounds).toHaveBeenCalledWith([[7, 47.4], [7.061, 47.456]], { padding: 60, maxZoom: 16 });
        expect(wrapper.find('[data-test="gpx-message"]').text()).toEqual('Imported 1 route and 2 waypoints from fury.gpx');
        expect(wrapper.find('[data-test="gpx-import"]').exists()).toBe(false);
    });

    it('leaves the waypoints out when asked', async () => {
        const wrapper = await render();
        await choose(wrapper, 'fury.gpx', FURY);

        const toggles = wrapper.findAll('[data-test="gpx-import"] input[type="checkbox"]');
        await toggles[1].setValue(false);
        await wrapper.find('[data-test="gpx-import-run"]').trigger('click');
        await flushPromises();

        expect(dbAdd).toHaveBeenCalledTimes(1);
        expect(wrapper.find('[data-test="gpx-message"]').text()).toEqual('Imported 1 route and 0 waypoints from fury.gpx');
    });

    it('says when a file is no GPX', async () => {
        const wrapper = await render();
        await choose(wrapper, 'lage.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"/>');

        expect(wrapper.find('[data-test="gpx-error"]').text()).toEqual('Not a GPX file');
        expect(wrapper.find('[data-test="gpx-import"]').exists()).toBe(false);
        expect(dbAdd).not.toHaveBeenCalled();
    });

    it('exports a route as GPX', async () => {
        dbFilter.mockResolvedValue([{
            id: 'route-1',
            properties: { callsign: 'Route Nord', stroke: '#ff0000', 'stroke-width': 3 },
            geometry: { type: 'LineString', coordinates: [[7.0536, 47.4508], [7.07, 47.46]] },
            length: () => 1.6
        }]);

        let blob: NodeBlob | undefined;
        URL.createObjectURL = vi.fn((b: NodeBlob) => {
            blob = b;
            return 'blob:gpx';
        }) as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = vi.fn();

        const downloads: string[] = [];
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            downloads.push(this.download);
        });

        const wrapper = await render();
        await wrapper.find('[title="Export Route Nord as GPX"]').trigger('click');

        expect(downloads).toEqual(['Route-Nord.gpx']);
        const text = await blob!.text();
        expect(text).toContain('<name>Route Nord</name>');
        expect(text).toContain('<tak:LineColor>-65536</tak:LineColor>');
        expect(text).toContain('<rtept lat="47.4508000" lon="7.0536000"/>');

        click.mockRestore();
    });
});
