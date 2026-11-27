import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../util/MenuTemplate.vue', () => ({
    default: { template: '<div><slot name="buttons" /><slot /></div>' }
}));

import MenuGridLines from './MenuGridLines.vue';
import KV from '../../../base/kv.ts';
import GridLines, { GRID_LINES_DEFAULTS, GRID_LINES_KEY } from '../../../base/grid-lines.ts';

async function render() {
    const wrapper = mount(MenuGridLines);
    await flushPromises();
    return wrapper;
}

async function stored() {
    return GridLines.parse(await KV.value(GRID_LINES_KEY));
}

describe('MenuGridLines', () => {
    beforeEach(async () => {
        await KV.delete(GRID_LINES_KEY);
        Object.assign(GridLines.state, GRID_LINES_DEFAULTS, { loaded: false });
    });

    it('shows the grid lines and keeps the choice', async () => {
        const wrapper = await render();

        await wrapper.find('[data-test="grid-lines"] input[type="checkbox"]').setValue(true);
        await vi.waitFor(async () => expect((await stored()).visible).toBe(true));
        expect(GridLines.state.visible).toBe(true);
    });

    it('changes the colour like ATAK offers it', async () => {
        const wrapper = await render();

        await wrapper.find('[title="Magenta grid lines"]').trigger('click');
        await vi.waitFor(async () => expect((await stored()).color).toEqual('#ff00ff'));
        expect(wrapper.find('[title="Magenta grid lines"]').attributes('aria-pressed')).toEqual('true');

        await wrapper.find('[data-test="grid-lines-custom-color"]').setValue('#123456');
        await wrapper.find('[data-test="grid-lines-custom-color"]').trigger('change');
        await vi.waitFor(async () => expect((await stored()).color).toEqual('#123456'));
    });

    it('switches to a degree graticule', async () => {
        const wrapper = await render();
        expect(wrapper.text()).toContain('32T LT 53 56');

        await wrapper.find('select').setValue('Decimal Degrees');
        await vi.waitFor(async () => expect((await stored()).type).toEqual('Decimal Degrees'));
        expect(wrapper.text()).toContain('Meridians and parallels');
    });

    it('offers the Swiss grid LV95', async () => {
        const wrapper = await render();
        expect(wrapper.findAll('select option').map((o) => o.text())).toContain('LV95');

        await wrapper.find('select').setValue('LV95');
        await vi.waitFor(async () => expect((await stored()).type).toEqual('LV95'));
        expect(wrapper.text()).toContain('2 600 000 / 1 200 000');
    });
});
