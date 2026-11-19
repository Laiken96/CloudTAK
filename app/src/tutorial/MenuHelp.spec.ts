import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, reactive } from 'vue';

vi.mock('../base/profile.ts', () => ({ default: { get: vi.fn() } }));
vi.mock('../base/contact.ts', () => ({ default: {} }));
vi.mock('../base/chatroom.ts', () => ({ default: {} }));

const openSecondaryView = vi.fn<(url: string) => Promise<void>>(async () => undefined);
vi.mock('../utils/capacitor.ts', () => ({
    isNativePlatform: () => false,
    openSecondaryView: (url: string) => openSecondaryView(url),
}));

const route = reactive({ name: 'home-menu-help', path: '/menu/help' });
const router = { push: vi.fn(async () => undefined) };

vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => router,
}));

// The real template pulls in the app store and the router
vi.mock('../components/CloudTAK/util/MenuTemplate.vue', async () => {
    const { defineComponent, h } = await import('vue');
    return {
        default: defineComponent({
            name: 'MenuTemplate',
            setup(_props, { slots }) {
                return () => h('div', slots.default?.());
            },
        }),
    };
});

import MenuManager from '../stores/modules/menu.ts';

const menu = new MenuManager({});
const items = computed(() => menu.items.value);

vi.mock('../stores/map.ts', () => ({
    useMapStore: () => ({ menu: { items } }),
}));

import MenuHelp from './MenuHelp.vue';
import { tour } from './tour.ts';
import { TOUR_STEPS } from './steps.ts';
import { isSimpleMode, setSimpleMode } from '../stores/modules/simple-mode.ts';

function mountHelp() {
    return mount(MenuHelp);
}

beforeEach(() => {
    router.push.mockClear();
    openSecondaryView.mockClear();
    menu.isSystemAdmin.value = false;
});

afterEach(() => {
    setSimpleMode(false);
    vi.restoreAllMocks();
});

describe('MenuHelp', () => {
    it('lists the map controls and every menu entry the user has', () => {
        const wrapper = mountHelp();

        const ids = wrapper.findAll('[data-testid="help-entry"]').map((el) => el.attributes('data-help-id'));
        expect(ids).toContain('gps-panel');
        expect(ids).toContain('coordinates');
        expect(ids).toContain('menu-fire-grids');
        expect(ids).toContain('menu-rubber-sheets');
        expect(ids).toContain('menu-help');
        expect(ids).not.toContain('menu-server');
    });

    it('starts the guided tour', async () => {
        const start = vi.spyOn(tour, 'start').mockResolvedValue();
        const wrapper = mountHelp();

        await wrapper.find('[data-testid="help-start-tour"]').trigger('click');

        expect(start).toHaveBeenCalledWith(TOUR_STEPS);
    });

    it('opens a menu function and highlights a map control', async () => {
        const show = vi.spyOn(tour, 'show').mockResolvedValue();
        const wrapper = mountHelp();

        const entry = (id: string) => wrapper.find(`[data-help-id="${id}"]`);

        await entry('menu-fire-grids').find('[data-testid="help-show"]').trigger('click');
        expect(router.push).toHaveBeenCalledWith('/menu/fire-grids');

        await entry('favorites-bar').find('[data-testid="help-show"]').trigger('click');
        expect(show).toHaveBeenCalledWith(expect.objectContaining({ target: '[data-testid="favorites-bar"]' }));

        // Nothing to show for gestures, and the help does not reopen itself
        expect(entry('objects').find('[data-testid="help-show"]').exists()).toBe(false);
        expect(entry('menu-help').find('[data-testid="help-show"]').exists()).toBe(false);
    });

    it('opens the admin pages in their own window', async () => {
        menu.isSystemAdmin.value = true;
        const wrapper = mountHelp();

        await wrapper.find('[data-help-id="menu-server"] [data-testid="help-show"]').trigger('click');

        expect(openSecondaryView).toHaveBeenCalledWith('http://localhost:8080/admin');
        expect(router.push).not.toHaveBeenCalled();
    });

    it('lists only the functions of the simple view and leads back to the full view', async () => {
        setSimpleMode(true);
        const wrapper = mountHelp();
        await flushPromises();

        const ids = wrapper.findAll('[data-testid="help-entry"]').map((el) => el.attributes('data-help-id'));
        expect(ids).toContain('menu-signatures');
        expect(ids).not.toContain('menu-fire-grids');
        expect(ids).not.toContain('draw-tools');
        expect(ids).not.toContain('medevac');

        await wrapper.find('[data-testid="help-full-view"]').trigger('click');
        expect(isSimpleMode()).toBe(false);
        expect(wrapper.find('[data-help-id="menu-fire-grids"]').exists()).toBe(true);
    });

    it('says so when the search finds nothing', async () => {
        const wrapper = mountHelp();

        await wrapper.find('input').setValue('xyzzy');

        expect(wrapper.findAll('[data-testid="help-entry"]')).toHaveLength(0);
        expect(wrapper.text()).toContain('No matching help');
    });
});
