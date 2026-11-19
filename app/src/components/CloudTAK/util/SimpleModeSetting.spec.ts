import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SimpleModeSetting from './SimpleModeSetting.vue';
import SimpleModeExit from './SimpleModeExit.vue';
import { isSimpleMode, setSimpleMode, SIMPLE_MODE_STORAGE_KEY } from '../../../stores/modules/simple-mode.ts';

afterEach(() => {
    setSimpleMode(false);
});

describe('SimpleModeSetting', () => {
    it('switches the simple view on and off and stores it on this device', async () => {
        const wrapper = mount(SimpleModeSetting);
        const input = wrapper.find<HTMLInputElement>('[data-testid="simple-mode-switch"]');

        expect(input.element.checked).toBe(false);

        await input.setValue(true);
        expect(isSimpleMode()).toBe(true);
        expect(localStorage.setItem).toHaveBeenLastCalledWith(SIMPLE_MODE_STORAGE_KEY, 'true');

        await input.setValue(false);
        expect(isSimpleMode()).toBe(false);
        expect(localStorage.setItem).toHaveBeenLastCalledWith(SIMPLE_MODE_STORAGE_KEY, 'false');
    });

    it('follows a change made elsewhere', async () => {
        const wrapper = mount(SimpleModeSetting);

        setSimpleMode(true);
        await wrapper.vm.$nextTick();

        expect(wrapper.find<HTMLInputElement>('[data-testid="simple-mode-switch"]').element.checked).toBe(true);
    });
});

describe('SimpleModeExit', () => {
    it('leads back to the full view in one tap', async () => {
        setSimpleMode(true);

        const wrapper = mount(SimpleModeExit);
        await wrapper.find('[data-testid="simple-mode-exit"]').trigger('click');

        expect(isSimpleMode()).toBe(false);
    });
});
