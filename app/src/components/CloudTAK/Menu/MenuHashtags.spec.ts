import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const route = reactive<{ query: Record<string, string> }>({ query: {} });
const selected = new Map<string, unknown>();
const dbHashtags = vi.fn();
const dbGet = vi.fn(async (id: string) => ({ id }));

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({
        selected,
        worker: { db: { hashtags: dbHashtags, get: dbGet } }
    })
}));

vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => ({ push: vi.fn() })
}));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

vi.mock('../util/FeatureRow.vue', () => ({
    default: {
        props: ['feature', 'title', 'detail'],
        template: '<div class="feature-row-stub" v-text="[title || feature.properties.callsign, detail].filter(Boolean).join(\' | \')" />'
    }
}));

import MenuHashtags from './MenuHashtags.vue';
import KV from '../../../base/kv.ts';
import StickyHashtags, { STICKY_HASHTAGS_KEY } from '../../../base/sticky-hashtags.ts';

function feat(id: string, callsign: string, remarks: string) {
    return { id, type: 'Feature', properties: { id, callsign, remarks }, geometry: { type: 'Point', coordinates: [0, 0] } };
}

const INDEX = [
    { tag: '#FURY', key: '#fury', features: [feat('pz', '.', '#FURY #FURYeinheiten Pz Kp 2'), feat('gegner', 'Rot 1', '#FURY #FURYgegner Inf Gruppe')] },
    { tag: '#FURYgegner', key: '#furygegner', features: [feat('gegner', 'Rot 1', '#FURY #FURYgegner Inf Gruppe')] },
];

async function render() {
    const wrapper = mount(MenuHashtags);
    await flushPromises();
    return wrapper;
}

describe('MenuHashtags', () => {
    beforeEach(async () => {
        route.query = {};
        selected.clear();
        dbHashtags.mockResolvedValue(INDEX);
        await KV.delete(STICKY_HASHTAGS_KEY);
    });

    it('lists every tag with its feature count', async () => {
        const wrapper = await render();

        expect(dbHashtags).toHaveBeenCalledWith({ mission: true });
        expect(wrapper.text()).toContain('#FURY');
        expect(wrapper.text()).toContain('2 Features');
        expect(wrapper.text()).toContain('#FURYgegner');
        expect(wrapper.text()).toContain('1 Feature');
        expect(wrapper.findAll('.feature-row-stub')).toHaveLength(0);
    });

    it('selects every feature of a tag for the selection panel', async () => {
        const wrapper = await render();

        await wrapper.find('[title="Select all #FURY Features"]').trigger('click');
        await flushPromises();

        expect(Array.from(selected.keys())).toEqual(['pz', 'gegner']);
    });

    it('opens the tag given in the route, in any case', async () => {
        route.query = { tag: '#fury' };
        const wrapper = await render();

        // A unit with the callsign "." is listed by the designation in its remarks
        expect(wrapper.findAll('.feature-row-stub').map((r) => r.text())).toEqual(['Pz Kp 2', 'Rot 1 | Inf Gruppe']);
    });

    it('filters the tags', async () => {
        const wrapper = await render();

        const search = wrapper.findAll('input').find((input) => !input.element.closest('#hashtags-sticky-new'));
        await search!.setValue('gegner');
        await flushPromises();

        expect(wrapper.text()).toContain('#FURYgegner');
        expect(wrapper.text()).not.toContain('2 Features');
    });

    it('adds a sticky tag', async () => {
        const wrapper = await render();

        await wrapper.find('#hashtags-sticky-new input').setValue('FURYtaktik');
        await wrapper.find('form').trigger('submit');
        await flushPromises();

        expect(await StickyHashtags.list()).toEqual([{ tag: '#FURYtaktik', enabled: true }]);
        expect(wrapper.text()).toContain('#FURYtaktik');
    });
});
