import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const undo = vi.fn(async () => undefined);
const dismiss = vi.fn();

vi.mock('../../base/feature-drag-map.ts', async () => {
    const { reactive } = await import('vue');
    return {
        UNDO_WINDOW: 8000,
        featureDragStatus: reactive({ phase: 'idle', label: '', kind: 'touch', message: '', until: 0 }),
        undoFeatureMove: () => undo(),
        dismissFeatureMoveStatus: () => dismiss(),
    };
});

import FeatureDragStatus from './FeatureDragStatus.vue';
import { featureDragStatus } from '../../base/feature-drag-map.ts';

afterEach(() => {
    Object.assign(featureDragStatus, { phase: 'idle', label: '', kind: 'touch', message: '', until: 0 });
    undo.mockClear();
    dismiss.mockClear();
});

describe('FeatureDragStatus', () => {
    it('shows nothing while nothing is moved', () => {
        const wrapper = mount(FeatureDragStatus);
        expect(wrapper.find('[data-testid="feature-drag-status"]').exists()).toBe(false);
    });

    it('while dragging: the name, how to drop, touches pass through', async () => {
        const wrapper = mount(FeatureDragStatus);
        Object.assign(featureDragStatus, { phase: 'dragging', label: 'Alpha', kind: 'touch' });
        await nextTick();

        const status = wrapper.find('[data-testid="feature-drag-status"]');
        expect(status.text()).toContain('Alpha');
        expect(wrapper.find('[data-testid="feature-drag-hint"]').text()).toBe('Release to drop, a second finger cancels');
        expect(status.classes()).toContain('feature-drag-status--passive');
        expect(wrapper.find('[data-testid="feature-drag-undo"]').exists()).toBe(false);

        featureDragStatus.kind = 'mouse';
        await nextTick();
        expect(wrapper.find('[data-testid="feature-drag-hint"]').text()).toBe('Release to drop, Esc cancels');
    });

    it('after the drop: Undo', async () => {
        const wrapper = mount(FeatureDragStatus);
        Object.assign(featureDragStatus, { phase: 'moved', label: 'Alpha', until: Date.now() + 8000 });
        await nextTick();

        expect(wrapper.find('[data-testid="feature-drag-hint"]').text()).toBe('Moved');
        expect(wrapper.find('[data-testid="feature-drag-status"]').classes()).not.toContain('feature-drag-status--passive');

        await wrapper.find('[data-testid="feature-drag-undo"]').trigger('click');
        expect(undo).toHaveBeenCalledTimes(1);
    });

    it('a failed save: the message and a way to close it', async () => {
        const wrapper = mount(FeatureDragStatus);
        Object.assign(featureDragStatus, { phase: 'error', label: 'Alpha', message: 'Could not move the object: disk full' });
        await nextTick();

        expect(wrapper.find('[data-testid="feature-drag-hint"]').text()).toBe('Could not move the object: disk full');
        expect(wrapper.find('[data-testid="feature-drag-undo"]').exists()).toBe(false);

        await wrapper.find('[data-testid="feature-drag-dismiss"]').trigger('click');
        expect(dismiss).toHaveBeenCalledTimes(1);
    });
});
