import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

const { planning, appStore } = vi.hoisted(() => ({
    planning: { path: null, count: 0, dialog: null } as { path: string | null; count: number; dialog: string | null },
    appStore: { isMobileDetected: false },
}));

vi.mock('../../../stores/app.ts', () => ({
    useAppStore: () => appStore
}));

vi.mock('./planning.ts', async () => ({
    planning: (await import('vue')).reactive(planning),
    loadPlanning: vi.fn(async () => undefined),
    refreshCount: vi.fn(async () => undefined),
}));

vi.mock('./PlanningBanner.vue', () => ({ default: { props: ['variant'], template: '<div data-testid="banner-stub" :data-variant="variant" />' } }));
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

        expect(wrapper.find('.planning-frame').exists()).toBe(false);
        expect(wrapper.find('[data-testid="banner-stub"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('frames the map; on a larger screen the banner is in the top bar, not over the map', async () => {
        state.path = '/Planung/Angriff Nord';
        appStore.isMobileDetected = false;

        const wrapper = mount(PlanningLayer);
        await flushPromises();

        expect(wrapper.find('.planning-frame').exists()).toBe(true);
        expect(wrapper.find('[data-testid="banner-stub"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it('puts the banner below the top bar on a phone', async () => {
        state.path = '/Planung/Angriff Nord';
        appStore.isMobileDetected = true;

        const wrapper = mount(PlanningLayer);
        await flushPromises();

        expect(wrapper.find('[data-testid="banner-stub"]').attributes('data-variant')).toBe('floating');
        wrapper.unmount();
        appStore.isMobileDetected = false;
    });

    it('opens the dialog the banner asks for', async () => {
        state.path = '/Planung/Angriff Nord';
        const wrapper = mount(PlanningLayer);
        await flushPromises();

        state.dialog = 'share';
        await flushPromises();
        expect(wrapper.find('[data-testid="share-stub"]').exists()).toBe(true);

        state.dialog = 'end';
        await flushPromises();
        expect(wrapper.find('[data-testid="end-stub"]').exists()).toBe(true);

        state.dialog = null;
        wrapper.unmount();
    });
});
