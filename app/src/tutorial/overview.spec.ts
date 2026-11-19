import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../base/profile.ts', () => ({ default: { get: vi.fn() } }));
vi.mock('../base/contact.ts', () => ({ default: {} }));
vi.mock('../base/chatroom.ts', () => ({ default: {} }));
vi.mock('../utils/capacitor.ts', () => ({ isNativePlatform: () => false }));

import MenuManager from '../stores/modules/menu.ts';
import { setSimpleMode } from '../stores/modules/simple-mode.ts';
import { HELP_ENTRIES } from './steps.ts';
import { helpOverview } from './overview.ts';

afterEach(() => {
    setSimpleMode(false);
});

function ids(sections: ReturnType<typeof helpOverview>, section: string): string[] {
    return sections.find((s) => s.id === section)?.entries.map((entry) => entry.menuKey ?? entry.id) ?? [];
}

describe('helpOverview', () => {
    it('lists every menu entry of an admin, in the order of the menu', () => {
        const menu = new MenuManager({});
        menu.isSystemAdmin.value = true;

        const sections = helpOverview(HELP_ENTRIES, menu.items.value, 'full');

        expect(ids(sections, 'menu')).toEqual(menu.items.value.map((item) => item.key));
        expect(ids(sections, 'menu')).toContain('server');
        expect(ids(sections, 'menu')).toContain('fire-grids');
    });

    it('leaves out admin functions for everybody else', () => {
        const menu = new MenuManager({});

        const keys = ids(helpOverview(HELP_ENTRIES, menu.items.value, 'full'), 'menu');

        expect(keys).not.toContain('server');
        expect(keys).not.toContain('debugger');
        expect(keys).not.toContain('connections');
        expect(keys).toContain('help');
    });

    it('follows the order the user gave the menu', () => {
        const menu = new MenuManager({});
        menu.preferenceOrder.value = [
            { key: 'fire-grids', visibility: 'full' },
            { key: 'overlays', visibility: 'full' },
        ];

        const keys = ids(helpOverview(HELP_ENTRIES, menu.items.value, 'full'), 'menu');
        expect(keys.slice(0, 2)).toEqual(['fire-grids', 'overlays']);
    });

    it('shows only the functions of the simple view', () => {
        const menu = new MenuManager({});
        setSimpleMode(true);

        const sections = helpOverview(HELP_ENTRIES, menu.items.value, 'simple');

        expect(ids(sections, 'menu')).toEqual(['signatures', 'overlays', 'basemaps', 'help']);
        expect(ids(sections, 'map')).toContain('favorites-bar');
        expect(ids(sections, 'map')).not.toContain('search');
        expect(ids(sections, 'map')).not.toContain('draw-tools');
        expect(ids(sections, 'map')).not.toContain('mission');
    });

    it('explains menu entries in the words of the help, with name, icon and route of the menu', () => {
        const menu = new MenuManager({});
        const sections = helpOverview(HELP_ENTRIES, menu.items.value, 'full');
        const fire = sections.find((s) => s.id === 'menu')!.entries.find((entry) => entry.menuKey === 'fire-grids')!;

        expect(fire.title).toBe('Fire Grid');
        expect(fire.route).toBe('/menu/fire-grids');
        expect(fire.icon).toBeDefined();
        expect(fire.description).toContain('D2/6');
    });

    it('lists a plugin menu entry with its own description', () => {
        const menu = new MenuManager({});
        menu.addMenuItem({
            key: 'medevac-plugin',
            label: 'Plugin',
            route: '/menu/plugin',
            tooltip: 'Plugin',
            description: 'Something a plugin adds',
            icon: { render: () => null },
        });

        const plugin = helpOverview(HELP_ENTRIES, menu.items.value, 'full')
            .find((s) => s.id === 'menu')!.entries.find((entry) => entry.menuKey === 'medevac-plugin');

        expect(plugin?.description).toBe('Something a plugin adds');
        expect(plugin?.route).toBe('/menu/plugin');
    });

    it('highlights map controls instead of opening a menu', () => {
        const sections = helpOverview(HELP_ENTRIES, [], 'full');
        const gps = sections.find((s) => s.id === 'map')!.entries.find((entry) => entry.id === 'gps-panel')!;

        expect(gps.show?.target).toBe('[data-testid="gps-panel"]');
        expect(gps.route).toBeUndefined();
    });

    it('finds entries by word and shows nothing for an unknown one', () => {
        const menu = new MenuManager({});

        const lv95 = helpOverview(HELP_ENTRIES, menu.items.value, 'full', '  lv95 ');
        expect(ids(lv95, 'map')).toContain('coordinates');

        const gpx = helpOverview(HELP_ENTRIES, menu.items.value, 'full', 'GPX');
        expect(ids(gpx, 'menu')).toEqual(['routes']);

        expect(helpOverview(HELP_ENTRIES, menu.items.value, 'full', 'xyzzy')).toEqual([]);
    });
});
