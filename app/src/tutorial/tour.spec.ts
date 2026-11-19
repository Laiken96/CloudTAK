import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    TOUR_SEEN_KEY,
    TourController,
    hasSeenTour,
    markTourSeen,
    shouldAutoStart,
    type TourEnvironment,
    type TourStep,
    type TourView,
} from './tour.ts';
import { TOUR_STEPS, menuItemTarget, testid } from './steps.ts';

/** Device storage, as localStorage */
function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));

    return {
        data,
        getItem: (key: string) => data.has(key) ? data.get(key)! : null,
        setItem: (key: string, value: string) => { data.set(key, String(value)); },
        removeItem: (key: string) => { data.delete(key); },
        clear: () => data.clear(),
    };
}

/**
 * A pretend app: which elements are shown on which route. Waiting for an
 * element that is not there resolves null at once (the real one times out).
 */
function fakeApp(opts: {
    view?: TourView;
    route?: string;
    shown: Record<string, string[]>;
}) {
    let route = opts.route ?? '/';
    const navigations: string[] = [];
    const elements = new Map<string, Element>();

    function element(selector: string): Element | null {
        if (!(opts.shown[route] ?? []).includes(selector)) return null;
        if (!elements.has(selector)) elements.set(selector, { selector } as unknown as Element);
        return elements.get(selector)!;
    }

    const env: TourEnvironment = {
        view: () => opts.view ?? 'full',
        currentRoute: () => route,
        navigate: async (next: string) => {
            route = next;
            navigations.push(next);
        },
        findTarget: (selector: string) => element(selector),
        waitForTarget: async (selector: string) => element(selector),
    };

    return {
        env,
        navigations,
        shown: opts.shown,
        route: () => route,
    };
}

/** Every step id the tour shows, from start to end */
async function walk(controller: TourController, steps: TourStep[]): Promise<string[]> {
    const seen: string[] = [];

    await controller.start(steps);
    while (controller.state.active) {
        seen.push(controller.step!.id);
        await controller.next();
        if (seen.length > 50) throw new Error('Tour does not end');
    }

    return seen;
}

const STEPS: TourStep[] = [
    { id: 'intro', title: 'Intro', description: 'Hello' },
    { id: 'gps', title: 'GPS', description: 'Position', target: '#gps' },
    { id: 'hidden', title: 'Hidden', description: 'Not rendered', target: '#hidden' },
    { id: 'bar', title: 'Bar', description: 'Favorites', target: '#bar' },
    { id: 'menu', title: 'Menu', description: 'Menu entry', target: '#entry', route: '/menu' },
];

const MAP_SIMPLE = [
    testid('gps-panel'),
    testid('gps-panel-coordinates'),
    testid('favorites-bar'),
    testid('favorites-bar-more'),
    testid('map-controls'),
    testid('map-compass'),
    testid('simple-mode-indicator'),
    testid('top-bar-menu-open'),
];

const MAP_FULL = [
    testid('gps-panel'),
    testid('gps-panel-coordinates'),
    testid('favorites-bar'),
    testid('favorites-bar-more'),
    testid('map-controls'),
    testid('map-search'),
    testid('map-compass'),
    testid('active-mission'),
    testid('top-bar-draw-tools'),
    testid('top-bar-notifications'),
    testid('top-bar-menu-open'),
];

const MENU = [
    testid('simple-mode-toggle'),
    menuItemTarget('overlays'),
    menuItemTarget('basemaps'),
    menuItemTarget('help'),
];

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('TourController', () => {
    it('skips a step whose element is not shown instead of waiting for it', async () => {
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        expect(await walk(controller, STEPS)).toEqual(['intro', 'gps', 'bar', 'menu']);
    });

    it('counts only the steps that are shown', async () => {
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        expect(controller.state.skipped).toEqual(['hidden']);
        expect(controller.position).toBe(1);
        expect(controller.total).toBe(4);

        await controller.next();
        await controller.next();
        expect(controller.step?.id).toBe('bar');
        expect(controller.position).toBe(3);
    });

    it('goes back over a skipped step and not before the first one', async () => {
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        expect(controller.isFirst).toBe(true);

        await controller.prev();
        expect(controller.step?.id).toBe('intro');

        await controller.next();
        await controller.next();
        expect(controller.step?.id).toBe('bar');

        await controller.prev();
        expect(controller.step?.id).toBe('gps');
    });

    it('opens the route of a step and returns to the start when done', async () => {
        const app = fakeApp({ route: '/menu/help', shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        expect(app.route()).toBe('/');

        await controller.next();
        await controller.next();
        await controller.next();
        expect(controller.step?.id).toBe('menu');
        expect(app.route()).toBe('/menu');
        expect(controller.isLast).toBe(true);

        await controller.next();
        expect(controller.state.active).toBe(false);
        expect(app.route()).toBe('/menu/help');
    });

    it('ends from any step with a single call', async () => {
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        await controller.next();
        await controller.end();

        expect(controller.state.active).toBe(false);
        expect(controller.step).toBeUndefined();
        expect(controller.state.target).toBeNull();
        expect(app.route()).toBe('/');
    });

    it('ends right away when no step can be shown', async () => {
        const app = fakeApp({ shown: {} });
        const controller = new TourController(app.env);

        await controller.start([{ id: 'only', title: 'Only', description: 'Missing', target: '#nothing' }]);

        expect(controller.state.active).toBe(false);
    });

    it('ignores a second tap on Next while it is still moving', async () => {
        let release: () => void = () => undefined;
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const slow: TourEnvironment = {
            ...app.env,
            navigate: (route: string) => new Promise<void>((resolve) => {
                release = () => {
                    void app.env.navigate(route).then(resolve);
                };
            }),
        };
        const controller = new TourController(slow);

        await controller.start(STEPS);
        await controller.next();
        await controller.next();
        expect(controller.step?.id).toBe('bar');

        const moving = controller.next();
        expect(controller.state.busy).toBe(true);
        await controller.next();
        release();
        await moving;

        expect(controller.step?.id).toBe('menu');
        expect(controller.state.active).toBe(true);
    });

    it('finds a moved element again or moves on when it is gone', async () => {
        const app = fakeApp({ shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        await controller.next();
        expect(controller.step?.id).toBe('gps');

        await controller.recover();
        expect(controller.step?.id).toBe('gps');

        // GPS panel hidden (e.g. drawing started): on to the next step
        app.shown['/'] = ['#bar'];
        await controller.recover();
        expect(controller.step?.id).toBe('bar');
        expect(controller.state.skipped).toContain('gps');
    });

    it('highlights a single element and says so when it is not shown', async () => {
        const app = fakeApp({ route: '/menu/help', shown: { '/': ['#gps'] } });
        const controller = new TourController(app.env);

        await controller.show({ id: 'show-gps', title: 'GPS', description: 'Position', target: '#gps' });
        expect(controller.state.mode).toBe('single');
        expect(controller.state.target).not.toBeNull();
        expect(controller.state.missing).toBe(false);
        expect(controller.isLast).toBe(true);

        await controller.end();
        expect(app.route()).toBe('/menu/help');

        await controller.show({ id: 'show-draw', title: 'Draw', description: 'Tools', target: '#draw' });
        expect(controller.state.active).toBe(true);
        expect(controller.state.target).toBeNull();
        expect(controller.state.missing).toBe(true);
    });

    it('does not move the router when the map page goes away', async () => {
        const app = fakeApp({ route: '/menu/help', shown: { '/': ['#gps', '#bar'], '/menu': ['#entry'] } });
        const controller = new TourController(app.env);

        await controller.start(STEPS);
        const before = app.navigations.length;
        await controller.end({ restore: false });

        expect(controller.state.active).toBe(false);
        expect(app.navigations.length).toBe(before);
    });
});

describe('the tour of the app', () => {
    it('shows only steps for elements of the simple view', async () => {
        const app = fakeApp({ view: 'simple', shown: { '/': MAP_SIMPLE, '/menu': MENU } });
        const controller = new TourController(app.env);

        const shown = await walk(controller, TOUR_STEPS);

        expect(shown).toContain('simple-indicator');
        expect(shown).toContain('favorites-bar');
        expect(shown).toContain('compass');
        expect(shown).not.toContain('map-controls');
        expect(shown).not.toContain('draw-tools');
        expect(shown).not.toContain('medevac');
        expect(shown).not.toContain('mission');
        expect(shown.length).toBeGreaterThanOrEqual(10);
        expect(shown.length).toBeLessThanOrEqual(15);
    });

    it('covers the full view in 10 to 15 steps', async () => {
        const app = fakeApp({ view: 'full', shown: { '/': MAP_FULL, '/menu': MENU } });
        const controller = new TourController(app.env);

        const shown = await walk(controller, TOUR_STEPS);

        expect(shown).not.toContain('simple-indicator');
        expect(shown).not.toContain('compass');
        for (const id of ['gps-panel', 'coordinates', 'favorites-bar', 'objects', 'map-controls', 'mission', 'draw-tools', 'medevac', 'menu-button', 'simple-toggle', 'overlays', 'basemaps', 'help']) {
            expect(shown).toContain(id);
        }
        expect(shown.length).toBeGreaterThanOrEqual(10);
        expect(shown.length).toBeLessThanOrEqual(15);
    });

    it('leaves out the favorites steps when the bar is not shown', async () => {
        const map = MAP_FULL.filter((s) => !s.includes('favorites'));
        const app = fakeApp({ view: 'full', shown: { '/': map, '/menu': MENU } });
        const controller = new TourController(app.env);

        const shown = await walk(controller, TOUR_STEPS);
        expect(shown).not.toContain('favorites-bar');
        expect(shown).not.toContain('favorites-more');
        expect(shown).toContain('help');
    });

    it('limits a step to a view with views', async () => {
        const steps: TourStep[] = [
            { id: 'both', title: 'Both', description: 'Always' },
            { id: 'full-only', title: 'Full', description: 'Only full', views: ['full'] },
        ];

        const simple = new TourController(fakeApp({ view: 'simple', shown: {} }).env);
        expect(await walk(simple, steps)).toEqual(['both']);

        const full = new TourController(fakeApp({ view: 'full', shown: {} }).env);
        expect(await walk(full, steps)).toEqual(['both', 'full-only']);
    });
});

describe('starting by itself', () => {
    it('starts once per device, after which it can still be started by hand', async () => {
        expect(shouldAutoStart({ paused: false, routeName: 'home', active: false })).toBe(true);

        const app = fakeApp({ shown: { '/': MAP_FULL, '/menu': MENU } });
        const controller = new TourController(app.env);
        await controller.start(TOUR_STEPS);

        expect(storage.data.get(TOUR_SEEN_KEY)).toBe('true');
        expect(hasSeenTour()).toBe(true);

        await controller.end();
        expect(shouldAutoStart({ paused: false, routeName: 'home', active: false })).toBe(false);

        // Menu › Help › Start Tour
        await controller.start(TOUR_STEPS);
        expect(controller.state.active).toBe(true);
        expect(controller.step?.id).toBe('welcome');
    });

    it('waits while something else is open, off the map, or while a tour runs', () => {
        expect(shouldAutoStart({ paused: true, routeName: 'home', active: false })).toBe(false);
        expect(shouldAutoStart({ paused: false, routeName: 'home-menu-settings', active: false })).toBe(false);
        expect(shouldAutoStart({ paused: false, routeName: undefined, active: false })).toBe(false);
        expect(shouldAutoStart({ paused: false, routeName: 'home', active: true })).toBe(false);
    });

    it('stays quiet when the device storage cannot be read', () => {
        const blocked = {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('QuotaExceededError'); },
        };

        expect(hasSeenTour(blocked)).toBe(true);
        expect(() => markTourSeen(blocked)).not.toThrow();
        expect(shouldAutoStart({ paused: false, routeName: 'home', active: false, storage: blocked })).toBe(false);
    });

    it('keeps the choice per device', () => {
        const other = memoryStorage({ [TOUR_SEEN_KEY]: 'true' });

        expect(hasSeenTour(other)).toBe(true);
        expect(hasSeenTour(memoryStorage())).toBe(false);
    });
});
