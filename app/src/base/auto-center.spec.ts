import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AUTO_CENTER_ZOOM,
    AWAY_MS,
    HIDDEN_AT_KEY,
    WINDOW_MS,
    armedAtBoot,
    awayLongEnough,
    createAutoCenter,
    distanceM,
    watchAway,
    type LngLat,
} from './auto-center.ts';

/** A map with just the view of MapLibre */
function fakeMap(center: LngLat = [8.2, 46.8], zoom = 8) {
    const view = { lng: center[0], lat: center[1], zoom };
    const jumpTo = vi.fn((opts: { center: LngLat; zoom: number }) => {
        view.lng = opts.center[0];
        view.lat = opts.center[1];
        view.zoom = opts.zoom;
    });

    return {
        view,
        jumpTo,
        map: {
            getCenter: () => ({ lng: view.lng, lat: view.lat }),
            getZoom: () => view.zoom,
            jumpTo,
        } as unknown as Parameters<typeof createAutoCenter>[0],
    };
}

function memoryStore(init: Record<string, string> = {}) {
    const data = new Map(Object.entries(init));
    return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value); },
    };
}

const THUN: LngLat = [7.63, 46.76];
const BERN: LngLat = [7.44, 46.95];

describe('armedAtBoot', () => {
    it('jumps when the map opens on the default view', () => {
        expect(armedAtBoot('', false)).toBe(true);
        expect(armedAtBoot('#', false)).toBe(true);
    });

    it('keeps a restored view unless the app was away long enough', () => {
        expect(armedAtBoot('#14/46.76/7.63', false)).toBe(false);
        expect(armedAtBoot('#14/46.76/7.63', true)).toBe(true);
        expect(armedAtBoot('#12.5/46.76/7.63/30/45', true)).toBe(true);
        expect(armedAtBoot('#3/-33.9/-70.6', true)).toBe(true);
    });

    it('never overrides a link with its own data', () => {
        expect(armedAtBoot('#e0=2600000&n0=1200000&z=3', true)).toBe(false);
        expect(armedAtBoot('#14/46.76/7.63&foo=1', true)).toBe(false);
    });
});

describe('awayLongEnough', () => {
    it('counts a first start or blocked storage as away', () => {
        expect(awayLongEnough(null, 1_000_000)).toBe(true);
        expect(awayLongEnough(memoryStore(), 1_000_000)).toBe(true);
        expect(awayLongEnough(memoryStore({ [HIDDEN_AT_KEY]: 'junk' }), 1_000_000)).toBe(true);
        expect(awayLongEnough({
            getItem: () => { throw new Error('blocked'); },
            setItem: () => undefined,
        }, 1_000_000)).toBe(true);
    });

    it('compares the time the app was hidden', () => {
        const now = 10_000_000;
        expect(awayLongEnough(memoryStore({ [HIDDEN_AT_KEY]: String(now - 1000) }), now)).toBe(false);
        expect(awayLongEnough(memoryStore({ [HIDDEN_AT_KEY]: String(now - AWAY_MS) }), now)).toBe(true);
    });
});

describe('distanceM', () => {
    it('measures metres', () => {
        expect(distanceM([7.63, 46.76], [7.63, 46.761])).toBeCloseTo(111, 0);
        expect(distanceM(THUN, THUN)).toBe(0);
    });
});

describe('createAutoCenter', () => {
    it('does nothing when not armed', () => {
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: false });

        expect(auto.armed).toBe(false);
        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();
    });

    it('jumps once to a fresh fix at zoom 14', () => {
        const { map, jumpTo, view } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        expect(auto.offer(THUN, true)).toBe(true);
        expect(jumpTo).toHaveBeenCalledWith({ center: THUN, zoom: AUTO_CENTER_ZOOM });
        expect(view.zoom).toBe(AUTO_CENTER_ZOOM);

        expect(auto.armed).toBe(false);
        expect(auto.offer(BERN, true)).toBe(false);
        expect(jumpTo).toHaveBeenCalledTimes(1);
    });

    it('keeps a closer zoom', () => {
        const { map, jumpTo } = fakeMap([8.2, 46.8], 16.5);
        const auto = createAutoCenter(map, { armed: true });

        auto.offer(THUN, true);
        expect(jumpTo).toHaveBeenCalledWith({ center: THUN, zoom: 16.5 });
    });

    it('stays where the user moved the map', () => {
        const { map, jumpTo, view } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        view.lng += 0.01;
        expect(auto.offer(THUN, true)).toBe(false);
        expect(auto.armed).toBe(false);

        // Not even when the map is back where it was
        view.lng -= 0.01;
        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();
    });

    it('stays after a zoom', () => {
        const { map, jumpTo, view } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        view.zoom = 9;
        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();
    });

    it('gives up after the window', () => {
        let now = 1_000;
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: true, now: () => now });

        now += WINDOW_MS + 1;
        expect(auto.armed).toBe(false);
        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();
    });

    it('ignores positions that are none and waits for a real one', () => {
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        expect(auto.offer(null, true)).toBe(false);
        expect(auto.offer([0, 0], true)).toBe(false);
        expect(auto.offer([NaN, 46], true)).toBe(false);
        expect(auto.offer([7, 95], true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();

        expect(auto.offer(THUN, true)).toBe(true);
    });

    it('corrects a last known location with a fresh fix far away', () => {
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        expect(auto.offer(BERN, false)).toBe(true);
        expect(auto.armed).toBe(true);

        expect(auto.offer(THUN, true)).toBe(true);
        expect(jumpTo).toHaveBeenLastCalledWith({ center: THUN, zoom: AUTO_CENTER_ZOOM });
        expect(auto.armed).toBe(false);
    });

    it('does not correct for a fix close to the last known location', () => {
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        auto.offer(THUN, false);
        expect(auto.offer([THUN[0], THUN[1] + 0.0003], true)).toBe(false);
        expect(jumpTo).toHaveBeenCalledTimes(1);
        expect(auto.armed).toBe(false);
    });

    it('does not correct once the user moved the map after the first jump', () => {
        const { map, jumpTo, view } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        auto.offer(BERN, false);
        view.lat += 0.02;

        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).toHaveBeenCalledTimes(1);
    });

    it('arms again from the current view', () => {
        const { map, jumpTo, view } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        auto.offer(THUN, true);
        view.lng = 9;
        view.zoom = 10;

        auto.arm();
        expect(auto.armed).toBe(true);
        expect(auto.offer(BERN, true)).toBe(true);
        expect(jumpTo).toHaveBeenLastCalledWith({ center: BERN, zoom: AUTO_CENTER_ZOOM });
    });

    it('stops waiting on disarm', () => {
        const { map, jumpTo } = fakeMap();
        const auto = createAutoCenter(map, { armed: true });

        auto.disarm();
        expect(auto.offer(THUN, true)).toBe(false);
        expect(jumpTo).not.toHaveBeenCalled();
    });
});

describe('watchAway', () => {
    let visibility: DocumentVisibilityState = 'visible';
    const stops: Array<() => void> = [];

    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibility,
    });

    function setVisibility(state: DocumentVisibilityState): void {
        visibility = state;
        document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
        for (const stop of stops.splice(0)) stop();
        visibility = 'visible';
    });

    it('calls back after a long break and notes the time it was hidden', () => {
        let now = 50_000;
        const store = memoryStore();
        const onBack = vi.fn();
        stops.push(watchAway(document, store, onBack, () => now));

        setVisibility('hidden');
        expect(store.data.get(HIDDEN_AT_KEY)).toBe('50000');

        now += AWAY_MS;
        setVisibility('visible');
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('does not call back after a short break', () => {
        let now = 50_000;
        const onBack = vi.fn();
        stops.push(watchAway(document, memoryStore(), onBack, () => now));

        setVisibility('hidden');
        now += AWAY_MS - 1;
        setVisibility('visible');
        expect(onBack).not.toHaveBeenCalled();
    });

    it('does not call back without a break', () => {
        const onBack = vi.fn();
        stops.push(watchAway(document, memoryStore(), onBack));

        setVisibility('visible');
        expect(onBack).not.toHaveBeenCalled();
    });

    it('notes leaving the page for a reload', () => {
        const store = memoryStore();
        stops.push(watchAway(document, store, vi.fn(), () => 77_000));

        window.dispatchEvent(new Event('pagehide'));
        expect(store.data.get(HIDDEN_AT_KEY)).toBe('77000');
    });

    it('stops watching', () => {
        let now = 0;
        const onBack = vi.fn();
        const store = memoryStore();
        const stop = watchAway(document, store, onBack, () => now);
        stop();

        setVisibility('hidden');
        now += AWAY_MS;
        setVisibility('visible');
        window.dispatchEvent(new Event('pagehide'));

        expect(onBack).not.toHaveBeenCalled();
        expect(store.data.has(HIDDEN_AT_KEY)).toBe(false);
    });
});
