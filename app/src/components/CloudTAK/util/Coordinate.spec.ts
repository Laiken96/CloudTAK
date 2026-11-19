import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const store = reactive({ coordFormat: 'dd' });

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => store
}));

import Coordinate from './Coordinate.vue';

const THIN = '\u2009';

const CopyFieldStub = {
    name: 'CopyField',
    props: ['modelValue', 'display'],
    template: '<div />',
    emits: ['submit', 'update:modelValue']
};

function mountCoordinate(props: { modelValue: number[], modes?: string[] }) {
    return mount(Coordinate, {
        props: { edit: true, ...props },
        global: {
            directives: {
                tooltip: () => undefined
            },
            stubs: {
                CopyField: CopyFieldStub,
                IconLabel: true
            }
        }
    });
}

describe('Coordinate', () => {
    afterEach(() => {
        store.coordFormat = 'dd';
    });

    it('emits a single model update when submit follows an input update', async () => {
        const wrapper = mountCoordinate({ modelValue: [-104.990251, 39.739236] });

        const input = '39.739236, -104.990251';
        const copyField = wrapper.getComponent({ name: 'CopyField' });

        copyField.vm.$emit('update:modelValue', input);
        copyField.vm.$emit('submit', input);
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
        expect(wrapper.emitted('submit')).toEqual([[input]]);
    });

    it('starts in the coordinate format of the Display Preferences', () => {
        store.coordFormat = 'lv95';
        const wrapper = mountCoordinate({ modelValue: [7.438637222222222, 46.95108111111111] });

        const copyField = wrapper.getComponent({ name: 'CopyField' });
        expect(copyField.props('display')).toBe(`2${THIN}600${THIN}000 / 1${THIN}200${THIN}000`);
        expect(copyField.props('modelValue')).toBe('2600000 1200000');
        expect(wrapper.find('[data-test="coordinate-fallback"]').exists()).toBe(false);
    });

    it('keeps its first mode when the field does not offer the preferred one', () => {
        store.coordFormat = 'lv95';
        const wrapper = mountCoordinate({ modelValue: [7.438637222222222, 46.95108111111111], modes: ['dd'] });

        const copyField = wrapper.getComponent({ name: 'CopyField' });
        expect(copyField.props('modelValue')).toBe('46.95108111111111, 7.438637222222222');
        expect(copyField.props('display')).toBeUndefined();
    });

    it('moves the point to typed LV95 coordinates', async () => {
        store.coordFormat = 'lv95';
        const wrapper = mountCoordinate({ modelValue: [7.438637222222222, 46.95108111111111] });

        wrapper.getComponent({ name: 'CopyField' }).vm.$emit('update:modelValue', "2'570'958 / 1'255'625");
        await wrapper.vm.$nextTick();

        const [[lngLat]] = wrapper.emitted('update:modelValue') as [[number[]]];
        expect(lngLat[0]).toBeCloseTo(7.053562823310347, 5);
        expect(lngLat[1]).toBeCloseTo(47.45077000975388, 5);
    });

    it('shows MGRS with a hint outside Switzerland', () => {
        store.coordFormat = 'lv95';
        const wrapper = mountCoordinate({ modelValue: [2.3522, 48.8566] });

        const copyField = wrapper.getComponent({ name: 'CopyField' });
        expect(copyField.props('modelValue')).toMatch(/^31U /);
        expect(wrapper.find('[data-test="coordinate-fallback"]').text()).toBe('Outside the LV95 area, shown in MGRS');
    });
});
