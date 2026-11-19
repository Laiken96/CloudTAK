import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MedevacRow from './MedevacRow.vue';

function subtitle(properties: Record<string, unknown>): string {
    return mount(MedevacRow, { props: { properties } }).find('.text-secondary').text();
}

describe('MedevacRow', () => {
    it('summarises the patients of Line 3', () => {
        expect(subtitle({ type: 'b-r-f-h-c', medevac: { _attributes: { urgent: '1', priority: '2' } } })).toBe('3 patients · 1xA, 2xC');
        expect(subtitle({ type: 'b-r-f-h-c', medevac: { _attributes: { routine: '1' } } })).toBe('1 patient · 1xD');
    });

    it('says when the 9-Line is empty or missing', () => {
        expect(subtitle({ type: 'b-r-f-h-c', medevac: { _attributes: { security: '0' } } })).toBe('No patients entered');
        expect(subtitle({ type: 'b-r-f-h-c' })).toBe('Not filled in yet');
    });

    it('opens the 9-Line on tap', async () => {
        const wrapper = mount(MedevacRow, { props: { properties: { type: 'b-r-f-h-c' } } });
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('click')).toHaveLength(1);
    });
});
