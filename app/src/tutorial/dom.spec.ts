import { afterEach, describe, expect, it, vi } from 'vitest';
import { findShown, isFullyVisible, isShown, revealElement, safeAreaInsets, waitForShown } from './dom.ts';

function box(testid: string, rect = { top: 10, left: 10, width: 50, height: 20 }, parent: HTMLElement = document.body): HTMLElement {
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
    parent.appendChild(el);
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('isShown', () => {
    it('needs an element in the page, not hidden and with a size', () => {
        expect(isShown(null)).toBe(false);
        expect(isShown(document.createElement('div'))).toBe(false);

        const shown = box('a');
        expect(isShown(shown)).toBe(true);

        shown.style.display = 'none';
        expect(isShown(shown)).toBe(false);

        const invisible = box('b');
        invisible.style.visibility = 'hidden';
        expect(isShown(invisible)).toBe(false);

        expect(isShown(box('c', { top: 0, left: 0, width: 0, height: 0 }))).toBe(false);
    });
});

describe('findShown', () => {
    it('takes the first element that is shown', () => {
        box('item', { top: 0, left: 0, width: 0, height: 0 });
        const second = box('item');

        expect(findShown('[data-testid="item"]')).toBe(second);
        expect(findShown('[data-testid="none"]')).toBeNull();
    });

    it('treats an invalid selector as not found', () => {
        expect(findShown('[[nope')).toBeNull();
    });
});

describe('waitForShown', () => {
    it('waits for an element that appears later', async () => {
        vi.useFakeTimers();

        const waiting = waitForShown('[data-testid="late"]', 2500);
        await vi.advanceTimersByTimeAsync(300);
        const late = box('late');
        await vi.advanceTimersByTimeAsync(200);

        expect(await waiting).toBe(late);
    });

    it('gives up after the timeout instead of hanging', async () => {
        vi.useFakeTimers();

        const waiting = waitForShown('[data-testid="never"]', 2500);
        await vi.advanceTimersByTimeAsync(2600);

        expect(await waiting).toBeNull();
    });
});

describe('revealElement', () => {
    it('leaves elements on screen alone and scrolls hidden ones of a list into view', () => {
        const onScreen = box('on', { top: 100, left: 10, width: 100, height: 40 });
        onScreen.scrollIntoView = vi.fn();
        expect(isFullyVisible(onScreen)).toBe(true);
        revealElement(onScreen);
        expect(onScreen.scrollIntoView).not.toHaveBeenCalled();

        const below = box('below', { top: window.innerHeight + 200, left: 10, width: 100, height: 40 });
        below.scrollIntoView = vi.fn();
        expect(isFullyVisible(below)).toBe(false);
        revealElement(below);
        expect(below.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });
});

describe('safeAreaInsets', () => {
    it('reads zero where the browser has no safe area', () => {
        expect(safeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
        expect(document.body.children.length).toBe(0);
    });
});
