import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const { push, startTactical } = vi.hoisted(() => ({ push: vi.fn(), startTactical: vi.fn() }));

vi.mock('vue-router', () => ({
    useRouter: () => ({ push })
}));

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => ({ draw: {} })
}));

vi.mock('./tactical-draw.ts', () => ({ startTactical }));

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

vi.mock('./TacticalPreview.vue', () => ({
    default: { props: ['entry'], template: '<div class="preview-stub" />' }
}));

import TacticalPicker from './TacticalPicker.vue';
import { CATALOG } from '../../../utils/tactical-graphics/catalog.ts';

describe('TacticalPicker', () => {
    it('lists every signature of the catalogue', () => {
        const wrapper = mount(TacticalPicker);
        expect(wrapper.findAll('[data-testid^="tactical-entry-"]')).toHaveLength(CATALOG.length);
    });

    it('filters by name and abbreviation', async () => {
        const wrapper = mount(TacticalPicker);
        await wrapper.find('[data-testid="tactical-picker-search"] input').setValue('phl');
        const entries = wrapper.findAll('[data-testid^="tactical-entry-"]');
        expect(entries.map((e) => e.attributes('data-testid'))).toEqual(['tactical-entry-phase-line']);
    });

    it('closes the menu and starts drawing', async () => {
        const wrapper = mount(TacticalPicker);
        await wrapper.find('[data-testid="tactical-entry-flot"]').trigger('click');
        await flushPromises();
        expect(push).toHaveBeenCalledWith('/');
        expect(startTactical).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'flot' }));
    });
});
