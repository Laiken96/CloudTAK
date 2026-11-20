import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../stores/modules/feature-visibility.ts', () => ({
    FeatureVisibility: { apply: vi.fn(async () => undefined) }
}));

import HashtagHiddenHint from './HashtagHiddenHint.vue';
import HiddenHashtags from '../../../stores/modules/hidden-hashtags.ts';

describe('HashtagHiddenHint', () => {
    beforeEach(() => {
        HiddenHashtags.state.tags = [];
    });

    it('says nothing for a Feature on the map', () => {
        const wrapper = mount(HashtagHiddenHint, { props: { remarks: '#Zug1 Pz Kp 2' } });

        expect(wrapper.text()).toEqual('');
    });

    it('names the hidden tag as written in the remarks of the Feature', async () => {
        await HiddenHashtags.setHidden('#ZUG1', true);
        const wrapper = mount(HashtagHiddenHint, { props: { remarks: '#FURY #Zug1 Pz Kp 2' } });

        expect(wrapper.text()).toEqual('Hidden via #Zug1');
    });

    it('goes away once the tag is shown again', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        const wrapper = mount(HashtagHiddenHint, { props: { remarks: '#Zug1' } });

        await HiddenHashtags.setHidden('#Zug1', false);
        await flushPromises();

        expect(wrapper.text()).toEqual('');
    });

    it('says nothing for a Feature without remarks', async () => {
        await HiddenHashtags.setHidden('#Zug1', true);
        const wrapper = mount(HashtagHiddenHint, { props: { remarks: undefined } });

        expect(wrapper.text()).toEqual('');
    });
});
