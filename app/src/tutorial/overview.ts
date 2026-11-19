/**
 * The function overview (Menu › Help): help entries for the controls on the
 * map, then one entry per main menu entry, in the order of the menu. Only what
 * this user has in this view is listed (no admin entries for others, no full
 * view functions in the simple view).
 */
import type { MenuItemConfig } from '../stores/modules/menu.ts';
import type { TourView } from './tour.ts';
import {
    HELP_SECTIONS,
    resolveHelpEntry,
    type HelpEntry,
    type HelpSection,
    type ResolvedHelpEntry,
} from './steps.ts';

export interface OverviewEntry extends ResolvedHelpEntry {
    /** Show opens this route (main menu entries) */
    route?: string;
    routeExternal?: boolean;
}

export interface OverviewSection {
    id: HelpSection;
    title: string;
    entries: OverviewEntry[];
}

function matches(entry: OverviewEntry, needle: string): boolean {
    if (!needle) return true;
    return entry.title.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle);
}

export function helpOverview(
    entries: readonly HelpEntry[],
    menuItems: readonly MenuItemConfig[],
    view: TourView,
    filter = '',
): OverviewSection[] {
    const needle = filter.trim().toLowerCase();

    const resolved = entries
        .map(resolveHelpEntry)
        .filter((entry) => !entry.views || entry.views.includes(view));

    const byMenuKey = new Map(resolved.filter((entry) => entry.menuKey).map((entry) => [entry.menuKey as string, entry]));

    const map: OverviewEntry[] = resolved.filter((entry) => entry.section === 'map');

    // In the order and selection of the menu this user sees
    const menu: OverviewEntry[] = menuItems.map((item) => {
        const entry = byMenuKey.get(item.key);

        return {
            id: entry?.id ?? `menu-${item.key}`,
            section: 'menu',
            menuKey: item.key,
            title: item.label,
            // Plugins bring their own menu entries: their description stands in
            description: entry?.description || item.description || item.tooltip,
            icon: item.icon,
            route: item.route,
            routeExternal: item.routeExternal,
        };
    });

    const sections: Record<HelpSection, OverviewEntry[]> = { map, menu };

    return HELP_SECTIONS
        .map((section) => ({
            id: section.id,
            title: section.title,
            entries: sections[section.id].filter((entry) => matches(entry, needle)),
        }))
        .filter((section) => section.entries.length > 0);
}
