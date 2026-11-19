import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const route = reactive({ name: 'home' as string | undefined, path: '/' });
const currentRoute = ref({ path: '/' });
const router = {
    currentRoute,
    push: vi.fn(async (path: string) => {
        route.path = path;
        route.name = path === '/' ? 'home' : 'home-menu';
        currentRoute.value = { path };
    }),
};

vi.mock('vue-router', () => ({
    useRoute: () => route,
    useRouter: () => router,
}));

import TutorialTour from './TutorialTour.vue';
import { TOUR_SEEN_KEY, tour } from './tour.ts';

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

/** An element of the map with a size, as the browser would lay it out */
function element(testid: string, rect: { top: number; left: number; width: number; height: number }): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-testid', testid);
    el.getBoundingClientRect = () => ({
        ...rect,
        x: rect.left,
        y: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        toJSON: () => rect,
    });
    el.scrollIntoView = () => undefined;
    document.body.appendChild(el);
    return el;
}

function card(): HTMLElement | null {
    return document.body.querySelector('[data-testid="tutorial-card"]');
}

function text(testid: string): string {
    return document.body.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim() ?? '';
}

function click(testid: string): void {
    (document.body.querySelector(`[data-testid="${testid}"]`) as HTMLElement).click();
}

let storage: ReturnType<typeof memoryStorage>;
let wrapper: VueWrapper | undefined;

beforeEach(() => {
    vi.useFakeTimers();
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    route.name = 'home';
    route.path = '/';
    currentRoute.value = { path: '/' };
    router.push.mockClear();
});

afterEach(async () => {
    wrapper?.unmount();
    wrapper = undefined;
    await tour.end({ restore: false });
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('TutorialTour', () => {
    it('starts by itself after the first login and never again on this device', async () => {
        wrapper = mount(TutorialTour);
        expect(card()).toBeNull();

        await vi.advanceTimersByTimeAsync(1500);
        await flushPromises();

        expect(card()).not.toBeNull();
        expect(text('tutorial-title')).toBe('Welcome to CloudTAK');
        expect(storage.data.get(TOUR_SEEN_KEY)).toBe('true');

        // One tap ends it
        click('tutorial-end');
        await flushPromises();
        expect(card()).toBeNull();

        // Next start of the app
        wrapper.unmount();
        wrapper = mount(TutorialTour);
        await vi.advanceTimersByTimeAsync(3000);
        await flushPromises();
        expect(card()).toBeNull();
    });

    it('waits until a configuration prompt is closed', async () => {
        wrapper = mount(TutorialTour, { props: { paused: true } });

        await vi.advanceTimersByTimeAsync(3000);
        expect(card()).toBeNull();
        expect(storage.data.has(TOUR_SEEN_KEY)).toBe(false);

        await wrapper.setProps({ paused: false });
        await vi.advanceTimersByTimeAsync(1500);
        await flushPromises();
        expect(card()).not.toBeNull();
    });

    it('does not start by itself inside a menu', async () => {
        route.name = 'home-menu-settings';
        wrapper = mount(TutorialTour);

        await vi.advanceTimersByTimeAsync(3000);
        expect(card()).toBeNull();
    });

    it('highlights the element and puts the card above it, skipping missing ones', async () => {
        storage.data.set(TOUR_SEEN_KEY, 'true');
        element('gps-panel', { top: 650, left: 8, width: 220, height: 84 });

        wrapper = mount(TutorialTour);
        await tour.start([
            { id: 'one', title: 'First', description: 'In the middle' },
            { id: 'missing', title: 'Missing', description: 'Not rendered', target: '[data-testid="nothing"]' },
            { id: 'gps', title: 'GPS', description: 'Bottom left', target: '[data-testid="gps-panel"]' },
        ]);
        await flushPromises();

        expect(card()?.getAttribute('data-placement')).toBe('center');
        expect(text('tutorial-progress')).toBe('Step 1 of 2');
        expect(document.body.querySelector('[data-testid="tutorial-back"]')).toBeNull();

        click('tutorial-next');
        await flushPromises();

        expect(text('tutorial-title')).toBe('GPS');
        expect(text('tutorial-progress')).toBe('Step 2 of 2');
        expect(text('tutorial-next')).toBe('Done');

        const hole = document.body.querySelector<HTMLElement>('[data-testid="tutorial-highlight"]');
        expect(hole?.style.top).toBe('644px');
        expect(hole?.style.left).toBe('2px');
        expect(card()?.getAttribute('data-placement')).toBe('top');

        click('tutorial-back');
        await flushPromises();
        expect(text('tutorial-title')).toBe('First');

        click('tutorial-next');
        await flushPromises();
        click('tutorial-next');
        await flushPromises();
        expect(card()).toBeNull();
    });

    it('ends with Escape', async () => {
        storage.data.set(TOUR_SEEN_KEY, 'true');
        wrapper = mount(TutorialTour);
        await tour.start([{ id: 'one', title: 'First', description: 'In the middle' }]);
        await flushPromises();
        expect(card()).not.toBeNull();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(card()).toBeNull();
    });

    it('explains a single element and says when it is not shown', async () => {
        storage.data.set(TOUR_SEEN_KEY, 'true');
        wrapper = mount(TutorialTour);

        // Simple view: the drawing tools are not rendered, the wait for them times out
        const showing = tour.show({ id: 'draw', title: 'Drawing Tools', description: 'Draw', target: '[data-testid="top-bar-draw-tools"]' });
        await vi.advanceTimersByTimeAsync(3000);
        await showing;
        await flushPromises();

        expect(text('tutorial-title')).toBe('Drawing Tools');
        expect(document.body.querySelector('[data-testid="tutorial-missing"]')).not.toBeNull();
        expect(document.body.querySelector('[data-testid="tutorial-progress"]')).toBeNull();

        click('tutorial-close');
        await flushPromises();
        expect(card()).toBeNull();
    });
});
