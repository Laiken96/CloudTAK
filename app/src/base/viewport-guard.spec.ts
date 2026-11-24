import { describe, expect, it, vi } from 'vitest';
import { SETTLE_DELAY_MS, installViewportGuard, isEditing, resetDocumentScroll } from './viewport-guard.ts';
import type { GuardWindow } from './viewport-guard.ts';

type Listener = () => void;

/** A window whose document is scrolled by (x, y), with recorded listeners and timers */
function fakeWindow(x = 0, y = 0) {
    const listeners = new Map<string, Set<Listener>>();
    const docListeners = new Map<string, Set<Listener>>();
    const vvListeners = new Map<string, Set<Listener>>();
    const frames: Listener[] = [];
    const timers: Array<{ fn: Listener; ms: number }> = [];

    const add = (map: Map<string, Set<Listener>>) => (type: string, fn: Listener) => {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type)!.add(fn);
    };
    const remove = (map: Map<string, Set<Listener>>) => (type: string, fn: Listener) => {
        map.get(type)?.delete(fn);
    };

    const win = {
        scrollX: x,
        scrollY: y,
        scrollTo: vi.fn((nx: number, ny: number) => {
            win.scrollX = nx;
            win.scrollY = ny;
        }),
        addEventListener: add(listeners),
        removeEventListener: remove(listeners),
        requestAnimationFrame: (fn: Listener) => { frames.push(fn); return frames.length; },
        setTimeout: (fn: Listener, ms: number) => { timers.push({ fn, ms }); return timers.length; },
        visualViewport: { addEventListener: add(vvListeners), removeEventListener: remove(vvListeners) },
        document: {
            documentElement: { scrollTop: 0, scrollLeft: 0 },
            body: { scrollTop: 0, scrollLeft: 0 },
            activeElement: null as Element | null,
            addEventListener: add(docListeners),
            removeEventListener: remove(docListeners),
        },
    };

    const fire = (map: Map<string, Set<Listener>>, type: string) => {
        for (const fn of map.get(type) ?? []) fn();
    };

    return {
        win,
        guardWin: win as unknown as GuardWindow,
        fireWindow: (type: string) => fire(listeners, type),
        fireDocument: (type: string) => fire(docListeners, type),
        fireViewport: (type: string) => fire(vvListeners, type),
        runFrames: () => { for (const fn of frames.splice(0)) fn(); },
        runTimers: () => { for (const t of timers.splice(0)) t.fn(); },
        timers,
        listenerCount: () => [...listeners.values(), ...docListeners.values(), ...vvListeners.values()]
            .reduce((sum, set) => sum + set.size, 0),
    };
}

function element(tagName: string, attrs: Record<string, string> = {}): Element {
    return { tagName, getAttribute: (name: string) => attrs[name] ?? null } as unknown as Element;
}

describe('isEditing', () => {
    it('treats text fields as editing', () => {
        expect(isEditing(element('INPUT'))).toBe(true);
        expect(isEditing(element('INPUT', { type: 'search' }))).toBe(true);
        expect(isEditing(element('INPUT', { type: 'number' }))).toBe(true);
        expect(isEditing(element('TEXTAREA'))).toBe(true);
        expect(isEditing(element('DIV', { contenteditable: 'true' }))).toBe(true);
    });

    it('ignores buttons, checkboxes and plain elements', () => {
        expect(isEditing(null)).toBe(false);
        expect(isEditing(element('BUTTON'))).toBe(false);
        expect(isEditing(element('INPUT', { type: 'checkbox' }))).toBe(false);
        expect(isEditing(element('INPUT', { type: 'range' }))).toBe(false);
        expect(isEditing(element('DIV'))).toBe(false);
    });
});

describe('resetDocumentScroll', () => {
    it('does nothing when the document is not scrolled', () => {
        const { win, guardWin } = fakeWindow();
        expect(resetDocumentScroll(guardWin)).toBe(false);
        expect(win.scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls a shifted window back to the top', () => {
        const { win, guardWin } = fakeWindow(0, 47);
        expect(resetDocumentScroll(guardWin)).toBe(true);
        expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
        expect(win.scrollY).toBe(0);
    });

    it('resets a scrolled body or root element', () => {
        const { win, guardWin } = fakeWindow();
        win.document.body.scrollTop = 30;
        win.document.documentElement.scrollLeft = 5;
        expect(resetDocumentScroll(guardWin)).toBe(true);
        expect(win.document.body.scrollTop).toBe(0);
        expect(win.document.documentElement.scrollLeft).toBe(0);
    });

    it('leaves the scroll alone while a text field has focus', () => {
        const { win, guardWin } = fakeWindow(0, 120);
        win.document.activeElement = element('INPUT');
        expect(resetDocumentScroll(guardWin)).toBe(false);
        expect(win.scrollY).toBe(120);
    });
});

describe('installViewportGuard', () => {
    it('resets after a rotation, on the next frame and after it settled', () => {
        const env = fakeWindow();
        const stop = installViewportGuard(env.guardWin);
        env.runFrames();
        env.runTimers();

        env.win.scrollY = 47;
        env.fireWindow('orientationchange');
        env.runFrames();
        expect(env.win.scrollY).toBe(0);

        // iOS shifts the page again while the rotation animation finishes
        env.win.scrollY = 47;
        expect(env.timers.some((t) => t.ms === SETTLE_DELAY_MS)).toBe(true);
        env.runTimers();
        expect(env.win.scrollY).toBe(0);

        stop();
    });

    it('resets once the keyboard closes', () => {
        const env = fakeWindow();
        const stop = installViewportGuard(env.guardWin);
        const input = element('INPUT');

        env.win.document.activeElement = input;
        env.win.scrollY = 200;
        env.fireViewport('resize');
        env.runFrames();
        expect(env.win.scrollY).toBe(200);

        env.win.document.activeElement = null;
        env.fireDocument('focusout');
        env.runFrames();
        expect(env.win.scrollY).toBe(0);

        stop();
    });

    it('removes every listener and ignores pending checks after stopping', () => {
        const env = fakeWindow();
        const stop = installViewportGuard(env.guardWin);
        expect(env.listenerCount()).toBe(5);

        env.win.scrollY = 47;
        env.fireWindow('resize');
        stop();
        env.runFrames();
        env.runTimers();

        expect(env.listenerCount()).toBe(0);
        expect(env.win.scrollY).toBe(47);
    });
});
