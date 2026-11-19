import 'fake-indexeddb/auto';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { DrawToolMode } from '../../stores/modules/draw.ts';

type ClickHandler = (event: { lngLat: { wrap: () => { lng: number; lat: number } } }) => Promise<void>;

const handlers = new Set<ClickHandler>();
const canvas = { style: { cursor: '' } };

const map = {
    on: vi.fn((type: string, fn: ClickHandler) => { if (type === 'click') handlers.add(fn); }),
    off: vi.fn((type: string, fn: ClickHandler) => { if (type === 'click') handlers.delete(fn); }),
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
    getCanvas: () => canvas,
};

const store = reactive({
    _map: map,
    map,
    isMapLoaded: true,
    draw: { mode: DrawToolMode.STATIC },
    radial: { mode: 'cot' as string | undefined, cot: {} as unknown },
    mission: undefined as { meta: { guid: string; name: string } } | undefined,
    worker: {
        db: {
            add: vi.fn(async () => undefined),
            remove: vi.fn(async () => undefined),
        }
    },
    refresh: vi.fn(async () => undefined),
});

vi.mock('../../stores/map.ts', () => ({
    useMapStore: () => store
}));

const routeName = ref<string>('home');
const push = vi.fn(async () => undefined);

vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-router')>()),
    useRoute: () => reactive({ get name() { return routeName.value; } }),
    useRouter: () => ({ push }),
}));

import { db } from '../../database.ts';
import FavoriteSignatures from '../../base/favorite-signatures.ts';
import { disarmSignature, isSignatureArmed } from '../../base/signature-placement.ts';
import FavoritesBar from './FavoritesBar.vue';

async function tapMap(lng = 7.4, lat = 46.9): Promise<void> {
    for (const handler of [...handlers]) {
        await handler({ lngLat: { wrap: () => ({ lng, lat }) } });
    }

    await flushPromises();
}

async function mountBar() {
    const wrapper = mount(FavoritesBar, {
        global: {
            stubs: { FeatureIcon: true, SignaturePicker: true }
        }
    });

    await flushPromises();
    return wrapper;
}

beforeEach(async () => {
    await db.favorite_signature.clear();
    FavoriteSignatures.state.loaded = false;
    FavoriteSignatures.state.items = [];

    store.mission = undefined;
    store.draw.mode = DrawToolMode.STATIC;
    store.radial.mode = 'cot';
    routeName.value = 'home';
    canvas.style.cursor = '';
    vi.clearAllMocks();
});

afterEach(() => {
    disarmSignature();
});

describe('FavoritesBar', () => {
    it('shows the empty state and the way to more signatures', async () => {
        const wrapper = await mountBar();

        expect(wrapper.find('[data-testid="favorites-bar"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="favorites-bar-empty"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="favorites-bar-more"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="favorites-bar-status"]').exists()).toBe(false);

        await wrapper.find('[data-testid="favorites-bar-manage"]').trigger('click');
        expect(push).toHaveBeenCalledWith('/menu/signatures');

        // A tap on the map without an armed favourite places nothing
        await tapMap();
        expect(store.worker.db.add).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('places the armed favourite on every map tap until done, as an own object', async () => {
        await FavoriteSignatures.add({ type: '10061000001211000000' }, 'Infantry');
        await FavoriteSignatures.add({ type: 'u-d-p', icon: 'uid:Swiss/Panzer', color: '#FF0000' }, 'Panzer');

        const wrapper = await mountBar();
        const items = wrapper.findAll('[data-testid="favorites-bar-item"]');
        expect(items.map((item) => item.attributes('aria-label'))).toEqual(['Infantry', 'Panzer']);

        await items[1].trigger('click');

        expect(isSignatureArmed()).toBe(true);
        expect(store.radial.mode).toBeUndefined();
        expect(map.doubleClickZoom.disable).toHaveBeenCalled();
        expect(items[1].attributes('aria-pressed')).toBe('true');
        expect(wrapper.find('[data-testid="favorites-bar-hint"]').text()).toBe('Tap the map to place · Goes to Own objects');

        await tapMap(7.4, 46.9);
        await tapMap(7.5, 47.0);

        expect(store.worker.db.add).toHaveBeenCalledTimes(2);
        const [feat, opts] = store.worker.db.add.mock.calls[1] as unknown as [{ properties: Record<string, unknown>; geometry: unknown }, unknown];
        expect(feat.properties).toMatchObject({ type: 'u-d-p', icon: 'uid:Swiss/Panzer', 'marker-color': '#FF0000' });
        expect(feat.geometry).toEqual({ type: 'Point', coordinates: [7.5, 47.0] });
        expect(opts).toEqual({ authored: true, created: true, skipMissionLookup: true });
        expect(wrapper.find('[data-testid="favorites-bar-hint"]').text()).toBe('2 placed · Goes to Own objects');

        await wrapper.find('[data-testid="favorites-bar-done"]').trigger('click');

        expect(isSignatureArmed()).toBe(false);
        expect(map.doubleClickZoom.enable).toHaveBeenCalled();
        expect(wrapper.find('[data-testid="favorites-bar-status"]').exists()).toBe(false);

        await tapMap();
        expect(store.worker.db.add).toHaveBeenCalledTimes(2);

        wrapper.unmount();
    });

    it('names the active Data Sync and undoes the last placement', async () => {
        await FavoriteSignatures.add({ type: '10061000001211000000' }, 'Infantry');
        store.mission = { meta: { guid: 'g1', name: 'Übung Nord' } };

        const wrapper = await mountBar();
        await wrapper.find('[data-testid="favorites-bar-item"]').trigger('click');

        expect(wrapper.find('[data-testid="favorites-bar-hint"]').text()).toContain('Goes to Übung Nord');
        expect(wrapper.find('[data-testid="favorites-bar-undo"]').exists()).toBe(false);

        await tapMap();

        const placedId = (store.worker.db.add.mock.calls[0] as unknown as [{ id: string }])[0].id;
        await wrapper.find('[data-testid="favorites-bar-undo"]').trigger('click');
        await flushPromises();

        expect(store.worker.db.remove).toHaveBeenCalledWith(placedId, { mission: true });
        expect(wrapper.find('[data-testid="favorites-bar-undo"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="favorites-bar-hint"]').text()).toContain('Tap the map to place');

        wrapper.unmount();
    });

    it('shows a failed placement and stays armed', async () => {
        await FavoriteSignatures.add({ type: '10061000001211000000' }, 'Infantry');
        store.worker.db.add.mockRejectedValueOnce(new Error('Mission is read only'));

        const wrapper = await mountBar();
        await wrapper.find('[data-testid="favorites-bar-item"]').trigger('click');

        await tapMap();

        expect(wrapper.find('[data-testid="favorites-bar-status"]').text()).toContain('Mission is read only');
        expect(isSignatureArmed()).toBe(true);

        wrapper.unmount();
    });

    it('disarms when the same favourite is tapped again, a menu opens or the bar goes away', async () => {
        await FavoriteSignatures.add({ type: '10061000001211000000' }, 'Infantry');

        const wrapper = await mountBar();
        const item = wrapper.find('[data-testid="favorites-bar-item"]');

        await item.trigger('click');
        expect(isSignatureArmed()).toBe(true);
        await item.trigger('click');
        expect(isSignatureArmed()).toBe(false);

        await item.trigger('click');
        routeName.value = 'home-menu-cot';
        await flushPromises();
        expect(isSignatureArmed()).toBe(false);

        routeName.value = 'home';
        await item.trigger('click');
        expect(isSignatureArmed()).toBe(true);

        wrapper.unmount();
        expect(isSignatureArmed()).toBe(false);
        expect(handlers.size).toBe(0);
    });

    it('does not place while a drawing tool is active', async () => {
        await FavoriteSignatures.add({ type: '10061000001211000000' }, 'Infantry');

        const wrapper = await mountBar();
        await wrapper.find('[data-testid="favorites-bar-item"]').trigger('click');

        store.draw.mode = DrawToolMode.POLYGON;
        await tapMap();
        expect(store.worker.db.add).not.toHaveBeenCalled();

        wrapper.unmount();
    });
});
