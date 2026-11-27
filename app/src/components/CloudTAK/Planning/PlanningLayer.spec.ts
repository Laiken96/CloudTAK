import { mount, flushPromises } from '@vue/test-utils';
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
    loadPlanning: vi.fn(async () => undefined),
    refreshCount: vi.fn(async () => undefined),
}));

vi.mock('./PlanningStart.vue', () => ({ default: { template: '<div data-testid="start-stub" />' } }));
vi.mock('./PlanningShare.vue', () => ({ default: { template: '<div data-testid="share-stub" />' } }));
vi.mock('./PlanningEnd.vue', () => ({ default: { template: '<div data-testid="end-stub" />' } }));

import PlanningLayer from './PlanningLayer.vue';
// The reactive state the component sees
import { planning as state } from './planning.ts';

describe('PlanningLayer', () => {
    it('shows nothing while not planning', async () => {
        state.path = null;
        const wrapper = mount(PlanningLayer);
        await flushPromises();

        expect(wrapper.find('[data-testid="planning-banner"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('marks the map as a draft and offers share and finish', async () => {
        state.path = '/Planung/Angriff Nord';
        state.count = 3;
        mapStore.mission = { meta: { name: 'Übung FURY' } };

        const wrapper = mount(PlanningLayer);
        await flushPromises();

        expect(wrapper.find('.planning-frame').exists()).toBe(true);
        expect(wrapper.find('[data-testid="planning-name"]').text()).toBe('Angriff Nord');
        const banner = wrapper.find('[data-testid="planning-banner"]').text();
        expect(banner).toContain('PLANNING');
        expect(banner).toContain('Objects: 3');
        expect(banner).toContain('Mission Übung FURY stays untouched');

        await wrapper.find('[data-testid="planning-share"]').trigger('click');
        expect(wrapper.find('[data-testid="share-stub"]').exists()).toBe(true);

        state.dialog = null;
        await wrapper.find('[data-testid="planning-end"]').trigger('click');
        expect(wrapper.find('[data-testid="end-stub"]').exists()).toBe(true);

        state.dialog = null;
        wrapper.unmount();
    });
});
