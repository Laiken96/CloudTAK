import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const route = reactive({ params: { uid: 'medevac-1' } });
const dbGet = vi.fn();

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        callsign: 'ALPHA',
        worker: { db: { get: dbGet } }
    })
}));

vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => ({ push: vi.fn() })
}));

vi.mock('../../../base/cot.ts', () => ({
    OriginMode: { CONNECTION: 'Connection', MISSION: 'Mission' }
}));

vi.mock('../../../base/subscription.ts', () => ({
    default: { from: vi.fn() }
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

vi.mock('../util/Share.vue', () => ({
    default: { template: '<div class="share-stub" />' }
}));

vi.mock('../util/CopyButton.vue', () => ({
    default: { props: ['text', 'title', 'size'], template: '<button class="copy-stub" />' }
}));

import MedevacView from './MedevacView.vue';

type Properties = Record<string, unknown>;

// A MEDEVAC as received from ATAK (invented values) - booleans already
// normalised by node-cot
const ATAK_MEDEVAC = {
    _attributes: {
        casevac: false,
        title: 'TEST.19.101500',
        freq: '40.500',
        urgent: '1',
        urgent_surgical: '1',
        priority: '2',
        hoist: true,
        litter: '2',
        ambulatory: '2',
        security: '1',
        hlz_marking: '2',
        us_military: '3',
        epw: '1',
        terrain_rough: true,
        zone_prot_selection: '0',
    },
    zMistsMap: {
        zMist: [
            { _attributes: { title: 'ZMIST1', z: 'zap-test', m: 'mechanism-test', i: 'injury-test', s: 'signs-test', t: 'treatment-test' } },
        ]
    }
};

function fakeCot(properties: Properties, opts: { editable?: boolean } = {}) {
    const cot = reactive({
        id: 'medevac-1',
        is_editable: opts.editable !== false,
        origin: { mode: 'Connection' },
        properties: {
            id: 'medevac-1',
            type: 'b-r-f-h-c',
            center: [7.5, 46.5],
            ...properties
        } as Properties,
        geometry: { type: 'Point', coordinates: [7.5, 46.5] },
        _liveQuerySubscription: null,
        reactivity: vi.fn(),
        as_feature: () => ({}),
        update: vi.fn(async (update: { properties: Properties }) => {
            cot.properties = update.properties;
            return false;
        }),
    });

    return cot;
}

async function render(cot: ReturnType<typeof fakeCot>) {
    dbGet.mockResolvedValue(cot);
    const wrapper = mount(MedevacView);
    await flushPromises();
    return wrapper;
}

function lastProperties(cot: ReturnType<typeof fakeCot>): Properties {
    const calls = cot.update.mock.calls;
    return calls[calls.length - 1][0].properties;
}

describe('MedevacView', () => {
    beforeEach(() => {
        dbGet.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows a MEDEVAC received from ATAK without writing it back', async () => {
        const cot = fakeCot({ callsign: 'TEST.19.101500', medevac: ATAK_MEDEVAC });
        const wrapper = await render(cot);

        expect(cot.reactivity).toHaveBeenCalled();
        expect(cot.update).not.toHaveBeenCalled();

        const readout = wrapper.find('pre.medevac-readout').text();
        expect(readout).toContain('2. Call Sign: TEST.19.101500 Freq: 40.500');
        expect(readout).toContain('3. 1xA, 1xB, 2xC');
        expect(readout).toContain('6. P - Possible enemy troops in area');
        expect(readout).toContain('7. C - Smoke');
        expect(readout).toContain('9. Rough terrain');
        expect(readout).toMatch(/1\. 32T \w\w \d{5} \d{5}/);

        expect((wrapper.findAll('select')[0].element as HTMLSelectElement).value).toBe('1');
        expect(wrapper.text()).toContain('Patient details (ZMIST) from ATAK are passed on unchanged but not shown.');

        // ZMIST content is never rendered
        for (const value of ['ZMIST1', 'zap-test', 'mechanism-test', 'injury-test', 'signs-test', 'treatment-test']) {
            expect(wrapper.html()).not.toContain(value);
        }
    });

    it('writes the ATAK defaults and callsign for a new MEDEVAC', async () => {
        const cot = fakeCot({ callsign: 'New Feature' });
        await render(cot);

        expect(cot.update).toHaveBeenCalledTimes(1);

        const properties = lastProperties(cot);
        expect(properties.callsign).toMatch(/^ALPHA\.\d{2}\.\d{6}$/);
        expect(properties.medevac).toEqual({
            _attributes: {
                casevac: false,
                title: properties.callsign,
                equipment_none: true,
                security: '0',
                hlz_marking: '3',
                terrain_none: true,
            }
        });
    });

    it('applies edits after a short pause and keeps ZMIST', async () => {
        const cot = fakeCot({ callsign: 'TEST.19.101500', medevac: ATAK_MEDEVAC });
        const wrapper = await render(cot);

        vi.useFakeTimers();

        await wrapper.find('[aria-label="E - Convenience +1"]').trigger('click');
        await wrapper.findAll('select')[0].setValue('3');
        expect(cot.update).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);

        expect(cot.update).toHaveBeenCalledTimes(1);
        const medevac = lastProperties(cot).medevac as typeof ATAK_MEDEVAC;
        expect(medevac._attributes).toMatchObject({ convenience: '1', security: '3', urgent: '1', zone_prot_selection: '0' });
        expect(medevac.zMistsMap).toEqual(ATAK_MEDEVAC.zMistsMap);
    });

    it('renames the MEDEVAC through the Line 2 callsign', async () => {
        const cot = fakeCot({ callsign: 'TEST.19.101500', medevac: ATAK_MEDEVAC });
        const wrapper = await render(cot);

        vi.useFakeTimers();

        const inputs = wrapper.findAll('input[type="text"]');
        // Title, Callsign, Frequency
        await inputs[1].setValue('MEDIC 1');
        await vi.advanceTimersByTimeAsync(500);

        expect(lastProperties(cot).callsign).toBe('MEDIC 1');
        expect(wrapper.find('pre.medevac-readout').text()).toContain('2. Call Sign: MEDIC 1 Freq: 40.500');

        // The title (ATAK's marker label) followed the callsign it was equal to
        expect((lastProperties(cot).medevac as typeof ATAK_MEDEVAC)._attributes.title).toBe('MEDIC 1');
    });

    it('keeps a title that differs from the callsign', async () => {
        const medevac = { ...ATAK_MEDEVAC, _attributes: { ...ATAK_MEDEVAC._attributes, title: 'Pick-up site' } };
        const cot = fakeCot({ callsign: 'TEST.19.101500', medevac });
        const wrapper = await render(cot);

        vi.useFakeTimers();

        await wrapper.findAll('input[type="text"]')[1].setValue('MEDIC 1');
        await vi.advanceTimersByTimeAsync(500);

        expect((lastProperties(cot).medevac as typeof ATAK_MEDEVAC)._attributes.title).toBe('Pick-up site');
    });

    it('is read only when the MEDEVAC cannot be edited', async () => {
        const cot = fakeCot({ callsign: 'New Feature' }, { editable: false });
        const wrapper = await render(cot);

        expect(cot.update).not.toHaveBeenCalled();
        expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined();
        expect(wrapper.text()).toContain('Read only');

        // No proposed callsign for a MEDEVAC that is not stored
        expect(wrapper.find('pre.medevac-readout').text()).toContain('2. Call Sign: New Feature Freq: ');
    });

    it('shows nothing for an unknown id', async () => {
        dbGet.mockResolvedValue(undefined);
        const wrapper = mount(MedevacView);
        await flushPromises();

        expect(wrapper.find('pre.medevac-readout').exists()).toBe(false);
    });
});
