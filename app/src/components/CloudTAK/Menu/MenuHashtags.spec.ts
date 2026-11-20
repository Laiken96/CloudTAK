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

// Hiding a tag re-filters the map layers - there is no map here
vi.mock('../../../stores/modules/feature-visibility.ts', () => ({
    FeatureVisibility: { apply: vi.fn(async () => undefined) }
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
import HiddenHashtags, { HIDDEN_HASHTAGS_KEY } from '../../../stores/modules/hidden-hashtags.ts';

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
        await KV.delete(HIDDEN_HASHTAGS_KEY);
        HiddenHashtags.state.tags = [];
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

    it('hides a tag on the map with the eye and shows it again', async () => {
        const wrapper = await render();

        expect(wrapper.text()).not.toContain('Hidden on the map');

        await wrapper.find('[title="Hide #FURY on the map"]').trigger('click');
        await flushPromises();

        expect(HiddenHashtags.isHidden('#fury')).toBe(true);
        expect(await KV.value(HIDDEN_HASHTAGS_KEY)).toEqual('["#FURY"]');
        expect(wrapper.text()).toContain('Hidden on the map');
        expect(wrapper.text()).toContain('1 hashtag hidden on the map');
        // The other tag of the same feature stays visible
        expect(wrapper.find('[title="Hide #FURYgegner on the map"]').exists()).toBe(true);

        await wrapper.find('[title="Show #FURY on the map"]').trigger('click');
        await flushPromises();

        expect(HiddenHashtags.isHidden('#FURY')).toBe(false);
        expect(wrapper.text()).not.toContain('Hidden on the map');
    });

    it('shows all hidden tags at once', async () => {
        await HiddenHashtags.setHidden('#FURY', true);
        await HiddenHashtags.setHidden('#FURYgegner', true);
        const wrapper = await render();

        expect(wrapper.text()).toContain('2 hashtags hidden on the map');

        const button = wrapper.findAll('button').find((b) => b.text() === 'Show All');
        await button!.trigger('click');
        await flushPromises();

        expect(HiddenHashtags.state.tags).toEqual([]);
        expect(await KV.value(HIDDEN_HASHTAGS_KEY)).toEqual('[]');
        expect(wrapper.findAll('button').some((b) => b.text() === 'Show All')).toBe(false);
    });

    it('keeps listing a hidden tag no feature carries right now', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        const wrapper = await render();

        expect(wrapper.text()).toContain('#Zug1');
        expect(wrapper.text()).toContain('0 Features');

        await wrapper.find('[title="Show #Zug1 on the map"]').trigger('click');
        await flushPromises();

        expect(HiddenHashtags.state.tags).toEqual([]);
        expect(wrapper.text()).not.toContain('#Zug1');
    });

    it('shows the empty list without hashtags and nothing hidden', async () => {
        dbHashtags.mockResolvedValue([]);
        const wrapper = await render();

        expect(wrapper.text()).toContain('No Hashtags in remarks');
        expect(wrapper.text()).not.toContain('Show All');
    });
});
