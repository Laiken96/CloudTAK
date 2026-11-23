import 'fake-indexeddb/auto';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';

const takeOver = vi.hoisted(() => vi.fn());

vi.mock('../../../../stores/map.ts', () => ({
    useMapStore: () => ({ worker: {} })
}));

vi.mock('../../../../base/mission-file-takeover.ts', async (original) => ({
    ...await original<typeof import('../../../../base/mission-file-takeover.ts')>(),
    takeOver,
}));

import { db } from '../../../../database.ts';
import { MissionFileStore } from '../../../../base/mission-files.ts';
import { askedHashes, markAsked, requestTakeover, takeoverState, type TakeoverMission } from '../../../../base/mission-file-takeover.ts';
import MissionFileTakeover from './MissionFileTakeover.vue';

// Invented test data - places, callsigns, hashtags and UIDs are made up

const GUID = 'mission-ost';

function drawing(uid: string, callsign: string): string {
    return `<event version="2.0" uid="${uid}" type="u-d-f" time="2026-11-20T08:00:00Z" start="2026-11-20T08:00:00Z" stale="2027-11-20T08:00:00Z" how="h-e">
        <point lat="46.95" lon="7.44" hae="0" ce="9999999" le="9999999"/>
        <detail>
            <link point="46.9500,7.4400,0"/><link point="46.9510,7.4420,0"/>
            <contact callsign="${callsign}"/><remarks>#BUNT ${callsign}</remarks><archive/>
        </detail>
    </event>`;
}

const FILES: Record<string, { name: string; xml: string }> = {
    h1: { name: 'Marschachse.cot', xml: drawing('uid-1', 'Marschachse') },
    h2: { name: 'Sperren.cot', xml: `<events>${drawing('uid-2', 'Sperre 1')}${drawing('uid-3', 'Sperre 2')}</events>` },
};

async function attach(...hashes: string[]): Promise<void> {
    for (const hash of hashes) {
        await db.subscription_contents.put({
            uid: `content-${hash}`,
            mission: GUID,
            timestamp: '2026-11-20T08:00:00Z',
            keywords: [],
            name: FILES[hash].name,
            hash,
            submissionTime: '2026-11-20T08:00:00Z',
            size: 1000,
            expiration: 0,
        });
    }

    const loader = new MissionFileStore({
        download: async (hash) => strToU8(FILES[hash].xml),
        repaint: () => undefined,
    });

    const sub = {
        guid: GUID,
        headers: () => ({}),
        contents: { list: async () => await db.subscription_contents.toArray() },
        fetch: async () => undefined,
    };

    await loader.features(sub, []);
    await loader.idle();
}

function subscription(permissions = ['MISSION_READ', 'MISSION_WRITE']): TakeoverMission {
    return {
        guid: GUID,
        subscribed: true,
        role: { permissions },
        feature: { update: vi.fn(), push: vi.fn() },
        layer: { list: vi.fn(), create: vi.fn(), attachFeatures: vi.fn() },
    } as unknown as TakeoverMission;
}

let wrapper: VueWrapper | undefined;

async function render(sub = subscription()): Promise<void> {
    wrapper = mount(MissionFileTakeover, { props: { subscription: sub }, attachTo: document.body });
    await vi.waitFor(async () => {
        await flushPromises();
        expect(takeoverState.pending.has(GUID) || !sub.role?.permissions?.includes('MISSION_WRITE')).toBe(true);
    });
    await flushPromises();
}

function dialog(): HTMLElement | null {
    return document.body.querySelector('[data-testid="mission-file-takeover"]');
}

function button(text: string): HTMLButtonElement {
    const found = [...document.body.querySelectorAll('.modal-footer button')]
        .find((el) => el.textContent?.trim() === text);
    if (!found) throw new Error(`No button ${text}`);
    return found as HTMLButtonElement;
}

beforeEach(async () => {
    await db.subscription_contents.clear();
    await db.subscription_feature.clear();
    await db.subscription.clear();
    await db.kv.clear();
    await db.subscription.put({ guid: GUID, name: 'Übung Ost', subscribed: true, dirty: false, meta: {}, role: {}, token: '' } as never);

    takeOver.mockReset();
    takeoverState.pending.clear();
    takeoverState.request.value = null;
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
});

describe('MissionFileTakeover', () => {
    it('asks about the drawings of the attached files, with file names and counts', async () => {
        await attach('h1', 'h2');
        await render();

        expect(dialog()?.textContent).toContain('Take over 3 drawings from attached files into the mission?');
        expect(dialog()?.textContent).toContain('Marschachse.cot');
        expect(dialog()?.textContent).toContain('Sperren.cot');
        expect((dialog()?.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    });

    it('does not ask without write access', async () => {
        await attach('h1');
        await render(subscription(['MISSION_READ']));

        expect(dialog()).toBeNull();
        expect(takeoverState.pending.has(GUID)).toBe(false);
    });

    it('asks only once per file: Later is remembered, a new file is asked about', async () => {
        await attach('h1');
        await render();

        button('Later').click();
        await vi.waitFor(async () => expect(await askedHashes(GUID)).toEqual(new Set(['h1'])));
        await flushPromises();
        expect(dialog()).toBeNull();

        wrapper!.unmount();
        await render();
        expect(dialog()).toBeNull();

        wrapper!.unmount();
        await attach('h2');
        await render();
        expect(dialog()?.textContent).toContain('Sperren.cot');
        expect(dialog()?.textContent).not.toContain('Marschachse.cot');
    });

    it('opens from the file list for a file asked about before', async () => {
        await attach('h1');
        await markAsked(GUID, ['h1']);
        await render();
        expect(dialog()).toBeNull();

        requestTakeover(GUID, ['h1']);
        await flushPromises();

        expect(dialog()?.textContent).toContain('Take over 1 drawing from attached files into the mission?');
    });

    it('takes the drawings over with a folder per file and shows the result', async () => {
        takeOver.mockResolvedValue({ written: 2, failed: 1, folders: [{ name: 'Sperren', error: 'Forbidden' }], error: 'Validation Error' });
        await attach('h2');
        await render();

        button('Take Over').click();
        await vi.waitFor(() => expect(dialog()?.textContent).toContain('2 drawings are now in the mission'));

        const [, , files, opts] = takeOver.mock.calls[0];
        expect(files.map((file: { name: string }) => file.name)).toEqual(['Sperren.cot']);
        expect(opts).toEqual({ folders: true });

        expect(dialog()?.textContent).toContain('1 drawing could not be taken over: Validation Error');
        expect(dialog()?.textContent).toContain('The folder Sperren could not be created or filled (Forbidden)');
        expect(await askedHashes(GUID)).toEqual(new Set(['h2']));
    });

    it('takes the drawings over without folders when the switch is off', async () => {
        takeOver.mockResolvedValue({ written: 1, failed: 0, folders: [] });
        await attach('h1');
        await render();

        const toggle = dialog()!.querySelector('input[type="checkbox"]') as HTMLInputElement;
        toggle.click();
        await flushPromises();

        button('Take Over').click();
        await vi.waitFor(() => expect(takeOver).toHaveBeenCalled());

        expect(takeOver.mock.calls[0][3]).toEqual({ folders: false });
    });
});
