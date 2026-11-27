import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { publishToNewMission } = vi.hoisted(() => ({
    publishToNewMission: vi.fn<(opts: { name: string; groups: string[]; password?: string; withPackage: boolean }) => Promise<string>>(async () => 'neu-guid'),
}));

vi.mock('../../../stores/map.ts', () => ({ useMapStore: () => ({}) }));
vi.mock('../../../base/subscription.ts', () => ({ default: { localList: vi.fn(async () => new Set()) } }));

vi.mock('./planning.ts', () => ({
    planning: { path: '/Planung/Angriff Nord', count: 2, dialog: 'share' },
    planName: (path: string) => path.split('/').pop(),
    planFeatures: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]),
    publishToMission: vi.fn(),
    publishToNewMission,
}));

vi.mock('../util/Share.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../util/ShareToPackage.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../util/EmptyInfo.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../util/GroupSelect.vue', () => ({
    default: {
        props: ['modelValue'],
        emits: ['update:modelValue'],
        template: '<button data-testid="pick-channel" @click="$emit(\'update:modelValue\', [\'Bat\'])" />',
    }
}));

import PlanningShare from './PlanningShare.vue';

async function openNewMission() {
    const wrapper = mount(PlanningShare, {
        // TablerModal teleports to the body - render it in place
        global: { stubs: { teleport: true } },
    });
    await flushPromises();
    await wrapper.find('[data-testid="planning-share-new-mission"]').trigger('click');
    return wrapper;
}

describe('PlanningShare - into a new Data Sync', () => {
    beforeEach(() => {
        publishToNewMission.mockClear();
    });

    it('takes the name of the plan, ticks the data package and waits for a channel', async () => {
        const wrapper = await openNewMission();

        expect((wrapper.find('[data-testid="planning-new-name"] input').element as HTMLInputElement).value).toBe('Angriff Nord');
        expect((wrapper.find('[data-testid="planning-new-package"] input').element as HTMLInputElement).checked).toBe(true);
        expect(wrapper.find('[data-testid="planning-new-create"]').attributes('disabled')).toBeDefined();

        await wrapper.find('[data-testid="pick-channel"]').trigger('click');
        expect(wrapper.find('[data-testid="planning-new-create"]').attributes('disabled')).toBeUndefined();

        await wrapper.find('[data-testid="planning-new-create"]').trigger('click');
        await flushPromises();

        expect(publishToNewMission).toHaveBeenCalledWith({ name: 'Angriff Nord', groups: ['Bat'], password: undefined, withPackage: true });
        expect(wrapper.emitted('close')).toBeTruthy();
        wrapper.unmount();
    });

    it('creates no data package when the tick is removed', async () => {
        const wrapper = await openNewMission();

        await wrapper.find('[data-testid="pick-channel"]').trigger('click');
        await wrapper.find('[data-testid="planning-new-package"] input').setValue(false);
        await wrapper.find('[data-testid="planning-new-create"]').trigger('click');
        await flushPromises();

        expect(publishToNewMission).toHaveBeenCalledWith(expect.objectContaining({ withPackage: false }));
        wrapper.unmount();
    });

    it('stays open and shows the error when the TAK Server refuses', async () => {
        publishToNewMission.mockRejectedValueOnce(new Error('Name vergeben'));
        const wrapper = await openNewMission();

        await wrapper.find('[data-testid="pick-channel"]').trigger('click');
        await wrapper.find('[data-testid="planning-new-create"]').trigger('click');
        await flushPromises();

        expect(wrapper.emitted('close')).toBeFalsy();
        expect(wrapper.text()).toContain('Name vergeben');
        wrapper.unmount();
    });
});
