import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const { planning, mapStore } = vi.hoisted(() => ({
    planning: { path: null, count: 0, dialog: null } as { path: string | null; count: number; dialog: string | null },
    mapStore: {} as { mission?: { meta: { name: string } } },
}));

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => mapStore
}));

vi.mock('./planning.ts', async () => ({
    planning: (await import('vue')).reactive(planning),
    planName: (path: string) => path.split('/').pop(),
}));

import PlanningBanner from './PlanningBanner.vue';
// The reactive state the component sees
import { planning as state } from './planning.ts';

describe('PlanningBanner', () => {
    it('renders nothing while not planning', () => {
        state.path = null;
        const wrapper = mount(PlanningBanner, { props: { variant: 'topbar' } });

        expect(wrapper.find('[data-testid="planning-banner"]').exists()).toBe(false);
    });

    it('names the plan, counts its objects and offers share and finish', async () => {
        state.path = '/Planung/Angriff Nord';
        state.count = 3;
        mapStore.mission = { meta: { name: 'Übung FURY' } };

        const wrapper = mount(PlanningBanner, { props: { variant: 'topbar' } });

        const banner = wrapper.find('[data-testid="planning-banner"]');
        expect(banner.classes()).toContain('planning-banner--topbar');
        expect(wrapper.find('[data-testid="planning-name"]').text()).toBe('Angriff Nord');
        expect(banner.text()).toContain('PLANNING');
        expect(banner.text()).toContain('Objects: 3');
        expect(banner.text()).toContain('Mission Übung FURY stays untouched');

        await wrapper.find('[data-testid="planning-share"]').trigger('click');
        expect(state.dialog).toBe('share');

        await wrapper.find('[data-testid="planning-end"]').trigger('click');
        expect(state.dialog).toBe('end');

        state.dialog = null;
    });
});
