/**
 * Content of the tutorial: the steps of the guided tour and the entries of
 * the function overview (Menu › Help).
 *
 * Texts are English here and German in i18n/de.json - keep `title` and
 * `description` as plain string literals on one line, the build translates
 * exactly those (see i18n/script-transform.ts).
 *
 * Adding a step: one entry in TOUR_STEPS, at the place it belongs in the tour.
 * Give the element it explains a `data-testid` and point `target` at it; set
 * `route` when the element is not on the map itself (e.g. `/menu`) and `open`
 * when it only appears after a tap (e.g. an entry of a dropdown). A step
 * whose element is not shown is skipped, so a step for something hidden in
 * the simple view needs nothing more; `views` limits a step to one view (e.g.
 * a text that only fits the full view).
 *
 * A function in the overview: one entry in HELP_ENTRIES - for a main menu
 * entry with its `menuKey` (a test checks that every menu entry has one),
 * for a control on the map with `step` (reusing a tour step) or its own
 * `title`, `description` and `target`.
 */
import type { Component } from 'vue';
import {
    IconMap2,
    IconBell,
    IconStar,
    IconStars,
    IconSearch,
    IconCompass,
    IconMenu2,
    IconCloudPin,
    IconEyeglass,
    IconPencilPlus,
    IconHandFinger,
    IconHandClick,
    IconCurrentLocation,
    IconBroadcast,
    IconCrosshair,
    IconMedicalCross,
    IconRoute2,
    IconShieldHalfFilled,
} from '@tabler/icons-vue';
import type { TourStep, TourView } from './tour.ts';

export function testid(id: string): string {
    return `[data-testid="${id}"]`;
}

/** Main menu entry as a tour target */
export function menuItemTarget(key: string): string {
    return testid(`menu-item-${key}`);
}

/** The button that opens the drawing tools (a dropdown) */
export const DRAW_TOOLS_BUTTON = `${testid('top-bar-draw-tools')} [aria-haspopup]`;

export const TOUR_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to CloudTAK',
        description: 'This tour shows the most important elements in a few steps. Move the map with one finger, zoom and rotate it with two. You can start the tour again at any time under Menu > Help.',
    },
    {
        id: 'gps-panel',
        target: testid('gps-panel'),
        title: 'Own Position',
        description: 'Your callsign with height, accuracy, speed and heading. Tap the panel to jump to your position. The location icon sets your position by hand or switches back to GPS.',
    },
    {
        id: 'coordinates',
        target: testid('gps-panel-coordinates'),
        title: 'Coordinates and LV95',
        description: 'Tap the coordinates to choose the format: LV95 (Swiss grid, e.g. 2 600 000 / 1 200 000), MGRS, UTM or degrees. Copy puts them on the clipboard.',
    },
    {
        id: 'favorites-bar',
        target: testid('favorites-bar'),
        title: 'Favorite Signatures',
        description: 'Tap a signature, then tap the map to place it. It stays selected for more taps until Done, Undo removes the last one. The star hides or shows the bar.',
    },
    {
        id: 'favorites-more',
        target: testid('favorites-bar-more'),
        title: 'All Signatures',
        description: 'The plus opens every signature: Symbols and icons. Place one directly or add it to the favorites with the star. The button next to it manages them: sort, rename, remove.',
    },
    {
        id: 'objects',
        title: 'Objects on the Map',
        description: 'Tap an object to open its ring menu: the pencil moves or reshapes it, the bin deletes it, the list opens details such as name, remarks and appearance, the lock keeps the map on it (Lock On).',
    },
    {
        id: 'search',
        target: testid('map-search'),
        title: 'Search',
        description: 'Finds places, coordinates in degrees or LV95, callsigns, remarks and fire grid cells such as D2/6.',
    },
    {
        id: 'compass',
        target: testid('map-compass'),
        title: 'North and Compass',
        description: 'If the map is rotated, a tap turns it back to north. Another tap makes the map turn with your heading, the next tap stops that.',
    },
    {
        id: 'mission',
        target: testid('active-mission'),
        title: 'Data Sync',
        description: 'Shows the active mission. Objects you draw or place go into it, everyone in the mission sees them. Tap to choose a mission.',
    },
    {
        id: 'simple-indicator',
        target: testid('simple-mode-indicator'),
        title: 'Simple View Is On',
        description: 'Only map, layers, signatures and your own position are shown. Full View brings back all menus and tools.',
    },
    {
        id: 'draw-tools',
        target: testid('top-bar-draw-tools'),
        title: 'Drawing Tools',
        description: 'Draw points, lines, areas, circles and sectors, measure with Range & Bearing and Range Rings, enter coordinates or take a Quick Pic. MEDEVAC sets a red cross for a 9-Line casualty report.',
    },
    {
        id: 'menu-button',
        target: testid('top-bar-menu-open'),
        title: 'Main Menu',
        description: 'Opens the menu with all functions of the app.',
    },
    {
        id: 'simple-toggle',
        route: '/menu',
        target: testid('simple-mode-toggle'),
        title: 'Simple View',
        description: 'Shows only map, layers, signatures and your own position - good for getting started. The choice applies to this device.',
    },
    {
        id: 'overlays',
        route: '/menu',
        target: menuItemTarget('overlays'),
        title: 'Overlays',
        description: 'Layers on top of the map, e.g. Data Syncs and imported files. Show or hide them, change opacity and order.',
    },
    {
        id: 'basemaps',
        route: '/menu',
        target: menuItemTarget('basemaps'),
        title: 'Basemaps',
        description: 'Choose the background map, e.g. a topographic map or an aerial image.',
    },
    {
        id: 'help',
        route: '/menu',
        target: menuItemTarget('help'),
        title: 'Help',
        description: 'Start this tour again or look up every function with a short explanation.',
    },
];

export type HelpSection = 'map' | 'menu';

export const HELP_SECTIONS: Array<{ id: HelpSection; title: string }> = [
    { id: 'map', title: 'Map and Controls' },
    { id: 'menu', title: 'Main Menu' },
];

export interface HelpEntry {
    id: string;
    section: HelpSection;
    /** Explains this main menu entry (`MenuItemConfig.key`): name, icon and route come from the menu */
    menuKey?: string;
    /** Takes heading, text and element from this tour step */
    step?: string;
    title?: string;
    description?: string;
    icon?: Component;
    /** Element that Show highlights ... */
    target?: string;
    /** ... on this route; default the map */
    route?: string;
    /** Tapped first to bring the element up, e.g. the button of a dropdown */
    open?: string;
    /** Views the function exists in; default both */
    views?: TourView[];
}

export const HELP_ENTRIES: HelpEntry[] = [
    {
        id: 'map',
        section: 'map',
        icon: IconMap2,
        title: 'The Map',
        description: 'Move the map with one finger, zoom and rotate it with two. A tap on an empty spot closes an open ring menu.',
    },
    { id: 'gps-panel', section: 'map', step: 'gps-panel', icon: IconCurrentLocation },
    { id: 'coordinates', section: 'map', step: 'coordinates', icon: IconCrosshair },
    { id: 'favorites-bar', section: 'map', step: 'favorites-bar', icon: IconStar },
    { id: 'favorites-more', section: 'map', step: 'favorites-more', icon: IconStars },
    {
        id: 'swiss-formations',
        section: 'map',
        icon: IconShieldHalfFilled,
        // Show opens the signature picker and points at its Swiss Formation tab
        open: testid('favorites-bar-more'),
        target: testid('signature-source-swiss'),
        title: 'Swiss Formations',
        description: 'The plus of the favorites bar, tab Swiss Formation: search a formation by its Swiss name (e.g. Panzer, Aufklärung, Sanität), then choose the echelon (Zug, Kp, Bat, Abt ...), Staff if needed and the affiliation. It is placed as a 2525 symbol with echelon that ATAK shows the same way; formations without a 2525 equivalent get the nearest symbol and their designation as name. The star keeps the choice as a favorite, echelon included.',
    },
    { id: 'objects', section: 'map', step: 'objects', icon: IconHandFinger },
    {
        id: 'long-press',
        section: 'map',
        icon: IconHandClick,
        title: 'Long Press on the Map',
        description: 'Long press an empty spot, with a mouse right-click: the pencil creates a new object there, the question mark shows the position with fire grid cell, height and more. Long press an own signature and drag it to move it, with a mouse just drag it; lines and areas are grabbed by their line or their name. A second finger cancels, Undo puts it back.',
    },
    { id: 'search', section: 'map', step: 'search', icon: IconSearch, views: ['full'] },
    { id: 'compass', section: 'map', step: 'compass', icon: IconCompass },
    { id: 'draw-tools', section: 'map', step: 'draw-tools', icon: IconPencilPlus, views: ['full'] },
    {
        id: 'medevac',
        section: 'map',
        icon: IconMedicalCross,
        views: ['full'],
        // Show opens the drawing tools and points at the MEDEVAC entry
        open: DRAW_TOOLS_BUTTON,
        target: testid('draw-tool-medevac'),
        title: 'MEDEVAC 9-Line',
        description: 'Choose MEDEVAC in the drawing tools, or MEDEVAC as point type when drawing a point or entering coordinates, and tap the pick-up site. In the details of the red cross, MEDEVAC 9-Line opens the form with the nine lines; it saves as you type and ATAK can read it. Copy the readout for the radio; patient details (ZMIST) are deliberately not shown.',
    },
    {
        id: 'tactical-graphics',
        section: 'map',
        icon: IconRoute2,
        views: ['full'],
        // Show opens the drawing tools and points at the Tactical Graphic entry
        open: DRAW_TOOLS_BUTTON,
        target: testid('draw-tool-tactical'),
        title: 'Tactical Graphics',
        description: 'Choose Tactical Graphic in the drawing tools for the lines and areas of regulation 52.003: boundaries, front and phase lines, movements, attacks, tasks, obstacles, areas, damage and topography. Draw with your finger and finish with the check mark, then enter name, hierarchy sign, affiliation and planned or executed. Swap side turns arcs and ticks to the other side. ATAK shows the 2525 graphic where there is one, otherwise the line in the same colour with its name.',
    },
    {
        id: 'notifications',
        section: 'map',
        icon: IconBell,
        views: ['full'],
        target: testid('top-bar-notifications'),
        title: 'Notifications',
        description: 'The bell collects messages about chats, contacts, alerts, imports and Data Syncs. A red triangle means an alert is waiting.',
    },
    { id: 'mission', section: 'map', step: 'mission', icon: IconCloudPin, views: ['full'] },
    { id: 'simple-toggle', section: 'map', step: 'simple-toggle', icon: IconEyeglass },
    {
        id: 'server-status',
        section: 'map',
        icon: IconBroadcast,
        target: testid('server-status'),
        title: 'Connection',
        description: 'The logo with the dot shows the connection to the server: green means connected, red means no connection.',
    },
    { id: 'menu-button', section: 'map', step: 'menu-button', icon: IconMenu2 },

    {
        id: 'menu-features',
        section: 'menu',
        menuKey: 'features',
        description: 'All your saved objects in folders, plus events and devices. Export them as GeoJSON or KML, restore deleted ones under Recently Deleted.',
    },
    {
        id: 'menu-signatures',
        section: 'menu',
        menuKey: 'signatures',
        description: 'The favorite signatures of the bar on the map: add, rename, sort and remove them. Favorites are kept on this device.',
    },
    {
        id: 'menu-overlays',
        section: 'menu',
        menuKey: 'overlays',
        description: 'Layers on top of the basemap: Data Syncs, imported files, server layers. Show or hide them, change opacity and order, add more with the plus.',
    },
    {
        id: 'menu-contacts',
        section: 'menu',
        menuKey: 'contacts',
        description: 'TAK users in your channels, online and recently offline, grouped by team. Tap a contact to show it on the map or to start a chat.',
    },
    {
        id: 'menu-basemaps',
        section: 'menu',
        menuKey: 'basemaps',
        description: 'Choose the background map, e.g. a topographic map or an aerial image. A further map can be added on top as an overlay.',
    },
    {
        id: 'menu-missions',
        section: 'menu',
        menuKey: 'missions',
        description: 'Shared missions: everyone in it sees the same objects, files and logs. Subscribe, make a mission active or create a new one.',
    },
    {
        id: 'menu-packages',
        section: 'menu',
        menuKey: 'packages',
        description: 'Bundle objects and files into a data package and share it through the server, e.g. with ATAK. Packages of your channels are listed here.',
    },
    {
        id: 'menu-channels',
        section: 'menu',
        menuKey: 'channels',
        description: 'Channels decide whom you see and who sees you. Without an active channel you see no users, data packages or Data Syncs.',
    },
    {
        id: 'menu-videos',
        section: 'menu',
        menuKey: 'videos',
        description: 'Live video: watch video streams or send a stream of your own with a video lease.',
    },
    {
        id: 'menu-chats',
        section: 'menu',
        menuKey: 'chats',
        description: 'Text chats with other TAK users. Start a new chat here or from a contact.',
    },
    {
        id: 'menu-routes',
        section: 'menu',
        menuKey: 'routes',
        description: 'Plan routes and navigate along them. Import GPX routes and tracks, e.g. from a GPS device, and export a route as GPX.',
    },
    {
        id: 'menu-hashtags',
        section: 'menu',
        menuKey: 'hashtags',
        description: 'Objects grouped by the hashtags in their remarks, e.g. #FURY. Sticky hashtags are added to every object you draw or place on this device.',
    },
    {
        id: 'menu-fire-grids',
        section: 'menu',
        menuKey: 'fire-grids',
        description: 'Fire grids of the Einheitsfeuerplan on the map. Import EFP File takes over grid and targets from the EFP data package, or enter the EFP link. The targets belong to the grid: they are shown and hidden with it and deleted with it, and are not added to a mission. A newer export of the same plan replaces the targets of the older one. Find a cell such as D2 or D2/6 and show it or mark it.',
    },
    {
        id: 'menu-rubber-sheets',
        section: 'menu',
        menuKey: 'rubber-sheets',
        description: 'Lay a sketch, scan or photo (PNG, JPEG, KMZ) on the map. Fit it by dragging its corners or with two control points.',
    },
    {
        id: 'menu-grid-lines',
        section: 'menu',
        menuKey: 'grid-lines',
        description: 'MGRS grid or latitude and longitude lines on the map, as in ATAK. Choose the type and the colour.',
    },
    {
        id: 'menu-files',
        section: 'menu',
        menuKey: 'files',
        description: 'Your uploaded files and imports, e.g. KML, GeoJSON or data packages. Upload a file and show it on the map as an overlay.',
    },
    {
        id: 'menu-iconsets',
        section: 'menu',
        menuKey: 'iconsets',
        description: 'Icon collections for markers. Upload an iconset as a TAK zip or create your own.',
    },
    {
        id: 'menu-connections',
        section: 'menu',
        menuKey: 'connections',
        description: 'For admins: integrations that bring data from other systems into CloudTAK.',
    },
    {
        id: 'menu-debugger',
        section: 'menu',
        menuKey: 'debugger',
        description: 'For admins: inspect the CoT messages of an object to find errors.',
    },
    {
        id: 'menu-server',
        section: 'menu',
        menuKey: 'server',
        description: 'For admins: server and user administration, opens in its own window.',
    },
    {
        id: 'menu-history',
        section: 'menu',
        menuKey: 'history',
        description: 'Breadcrumb trails: where units have moved. Load the last 1 to 24 hours, optionally only for the current map view.',
    },
    {
        id: 'menu-settings',
        section: 'menu',
        menuKey: 'settings',
        description: 'Callsign, team and role, display (units, coordinate format, language, light or dark), notifications and permissions.',
    },
    {
        id: 'menu-help',
        section: 'menu',
        menuKey: 'help',
        description: 'This overview and the guided tour through the app.',
    },
];

export function tourStep(id: string): TourStep | undefined {
    return TOUR_STEPS.find((step) => step.id === id);
}

export interface ResolvedHelpEntry {
    id: string;
    section: HelpSection;
    menuKey?: string;
    title: string;
    description: string;
    icon?: Component;
    views?: TourView[];
    /** Highlight this element (Show) */
    show?: TourStep;
}

/** Heading, text and element of an entry, filled in from its tour step */
export function resolveHelpEntry(entry: HelpEntry): ResolvedHelpEntry {
    const step = entry.step ? tourStep(entry.step) : undefined;
    const target = entry.target ?? step?.target;

    const resolved: ResolvedHelpEntry = {
        id: entry.id,
        section: entry.section,
        menuKey: entry.menuKey,
        title: entry.title ?? step?.title ?? '',
        description: entry.description ?? step?.description ?? '',
        icon: entry.icon,
        // The views of a tour step are about the tour, not about the function
        views: entry.views,
    };

    if (target) {
        resolved.show = {
            id: `help-${entry.id}`,
            title: resolved.title,
            description: resolved.description,
            target,
            route: entry.route ?? step?.route,
            open: entry.open ?? step?.open,
        };
    }

    return resolved;
}
