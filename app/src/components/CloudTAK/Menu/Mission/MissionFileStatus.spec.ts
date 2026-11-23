import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowReactive } from 'vue';

const statuses = shallowReactive(new Map<string, unknown>());
const retry = vi.fn();
const loaded = { value: true };

vi.mock('../../../../base/mission-files.ts', () => ({
    missionFiles: {
        status: (guid: string, hash: string) => statuses.get(`${guid}:${hash}`),
        retry: (guid: string, hash: string) => retry(guid, hash),
    }
}));

vi.mock('../../../../base/overlay.ts', () => ({
    default: { loadedByMode: () => loaded.value ? {} : undefined }
}));

import MissionFileStatus from './MissionFileStatus.vue';
import { takeoverState } from '../../../../base/mission-file-takeover.ts';
import type { Feature } from '../../../../types.ts';
import type Subscription from '../../../../base/subscription.ts';
import type { DBSubscriptionContent } from '../../../../database.ts';

const GUID = 'mission-a';

function render(name: string, opts: { subscribed?: boolean, permissions?: string[] } = {}) {
    return mount(MissionFileStatus, {
        props: {
            subscription: {
                guid: GUID,
                subscribed: opts.subscribed ?? true,
                role: { permissions: opts.permissions ?? ['MISSION_READ'] },
            } as unknown as Subscription,
            content: { hash: 'h1', name, size: 1000 } as DBSubscriptionContent,
        }
    });
}

describe('MissionFileStatus', () => {
    beforeEach(() => {
        statuses.clear();
        retry.mockReset();
        loaded.value = true;
        takeoverState.pending.clear();
        takeoverState.request.value = null;
    });

    it('says nothing for a file that is not a map file', () => {
        expect(render('Foto.jpg').text()).toBe('');
    });

    it('counts the objects on the map', async () => {
        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 4, shown: 4 });
        expect(render('Lage.cot').text()).toBe('On the map: 4 objects');

        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 1, shown: 1 });
        await flushPromises();
        expect(render('Lage.cot').text()).toBe('On the map: 1 object');

        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 3, shown: 2 });
        expect(render('Lage.cot').text()).toBe('On the map: 2 of 3 objects, the others are already in the mission or filtered');

        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 0, shown: 0 });
        expect(render('Leer.zip').text()).toBe('No objects for the map');
    });

    it('says why a file is not on the map', () => {
        statuses.set(`${GUID}:h1`, { state: 'too-large' });
        expect(render('Gross.kmz').text()).toBe('Not on the map: larger than 20 MB');

        statuses.set(`${GUID}:h1`, { state: 'invalid', error: 'XML is not well-formed' });
        expect(render('Kaputt.kml').text()).toBe('Not on the map: format not readable');

        expect(render('Lage.cot', { subscribed: false }).text()).toBe('Not on the map: the mission is not subscribed');
    });

    it('is loading until the mission painted the file', () => {
        expect(render('Lage.cot').text()).toBe('Loading for the map...');

        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 1, shown: 1 });
        loaded.value = false;
        expect(render('Lage.cot').text()).toBe('Loading for the map...');
    });

    it('offers to retry a failed download', async () => {
        statuses.set(`${GUID}:h1`, { state: 'failed', error: 'HTTP 502' });
        const wrapper = render('Lage.cot');

        expect(wrapper.text()).toBe('Not on the map: download failed');

        await wrapper.find('[title="Retry"]').trigger('click');
        expect(retry).toHaveBeenCalledWith(GUID, 'h1');
    });

    it('offers to take the objects over into the mission, only with write access', async () => {
        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 2, shown: 2 });
        takeoverState.pending.set(GUID, [{
            hash: 'h1',
            name: 'Lage.cot',
            features: [{ id: 'a' }, { id: 'b' }] as unknown as Feature[],
        }]);

        expect(render('Lage.cot').find('[data-testid="mission-file-takeover-file"]').exists()).toBe(false);

        const wrapper = render('Lage.cot', { permissions: ['MISSION_READ', 'MISSION_WRITE'] });
        const button = wrapper.find('[data-testid="mission-file-takeover-file"]');
        expect(button.text()).toBe('Take over 2 drawings into the mission');

        await button.trigger('click');
        expect(takeoverState.request.value).toEqual({ guid: GUID, hashes: ['h1'] });
    });

    it('offers nothing for a file without objects left to take over', () => {
        statuses.set(`${GUID}:h1`, { state: 'loaded', count: 1, shown: 0 });
        takeoverState.pending.set(GUID, []);

        const wrapper = render('Lage.cot', { permissions: ['MISSION_WRITE'] });
        expect(wrapper.find('[data-testid="mission-file-takeover-file"]').exists()).toBe(false);
    });
});
