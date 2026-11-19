/**
 * DOM side of the tutorial: is an element really on screen, wait for it to
 * appear, read the safe area of the device.
 */
import type { Insets, Rect } from './position.ts';

/** How long a step waits for its element (lazy menu, opening animation) */
export const TARGET_TIMEOUT = 2500;
const POLL_INTERVAL = 100;

/** Shown means: in the page, not hidden and with a size */
export function isShown(el: Element | null | undefined): el is HTMLElement {
    if (!el || !el.isConnected) return false;

    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/** The first element for a selector that is shown */
export function findShown(selector: string, root: ParentNode = document): HTMLElement | null {
    let list: NodeListOf<Element>;
    try {
        list = root.querySelectorAll(selector);
    } catch {
        return null;
    }

    for (const el of list) {
        if (isShown(el)) return el;
    }

    return null;
}

/** Waits until an element for the selector is shown, null after the timeout */
export function waitForShown(
    selector: string,
    timeout = TARGET_TIMEOUT,
    root: ParentNode = document,
): Promise<HTMLElement | null> {
    const found = findShown(selector, root);
    if (found) return Promise.resolve(found);

    return new Promise((resolve) => {
        const started = Date.now();

        const timer = setInterval(() => {
            const el = findShown(selector, root);

            if (el || Date.now() - started >= timeout) {
                clearInterval(timer);
                resolve(el);
            }
        }, POLL_INTERVAL);
    });
}

function inside(inner: DOMRect, outer: { top: number; left: number; bottom: number; right: number }): boolean {
    return inner.top >= outer.top - 1
        && inner.left >= outer.left - 1
        && inner.bottom <= outer.bottom + 1
        && inner.right <= outer.right + 1;
}

/** Whole element on screen and not cut off by a scrolling list around it */
export function isFullyVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (!inside(rect, { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth })) return false;

    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowY;
        if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) {
            if (!inside(rect, parent.getBoundingClientRect())) return false;
        }
    }

    return true;
}

/**
 * Brings an element of a scrolling list (menu) into view. Elements already on
 * screen are left alone: scrolling the page itself would shift the whole app
 * on iOS, where 100vh is taller than the visible area.
 */
export function revealElement(el: Element): void {
    if (isFullyVisible(el)) return;

    try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
        // Old browsers without the options form
        el.scrollIntoView(false);
    }
}

export function elementRect(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
    if (!a || !b) return a === b;
    return Math.abs(a.top - b.top) < 0.5
        && Math.abs(a.left - b.left) < 0.5
        && Math.abs(a.width - b.width) < 0.5
        && Math.abs(a.height - b.height) < 0.5;
}

/** Notch and home indicator of the iPhone, from CSS env(safe-area-inset-*) */
export function safeAreaInsets(): Insets {
    if (typeof document === 'undefined' || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 };

    const probe = document.createElement('div');
    probe.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 0',
        'height: 0',
        'visibility: hidden',
        'pointer-events: none',
        'padding-top: env(safe-area-inset-top, 0px)',
        'padding-right: env(safe-area-inset-right, 0px)',
        'padding-bottom: env(safe-area-inset-bottom, 0px)',
        'padding-left: env(safe-area-inset-left, 0px)',
    ].join(';');

    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const insets = {
        top: parseFloat(style.paddingTop) || 0,
        right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0,
        left: parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();

    return insets;
}

/** Size of the screen area fixed elements are laid out in */
export function viewportSize(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
}
