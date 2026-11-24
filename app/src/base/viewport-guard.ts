/**
 * PzBat12: keep the map page pinned to the top of the screen.
 *
 * The map page never scrolls the document on purpose (`html` is
 * `overflow: hidden`, everything scrolls inside its own panel). On iOS,
 * especially in the home screen web app, WebKit still leaves the document
 * scrolled after a rotation or after the on-screen keyboard closes. The map
 * then appears shifted with an empty bar above or below it. Any document
 * scroll found after such an event is reset.
 *
 * While a text field has focus, iOS scrolls the document on purpose so the
 * field stays above the keyboard. The guard leaves that alone and resets
 * once the field loses focus.
 */

/** Delay of the second pass, after the rotation animation of iOS has settled */
export const SETTLE_DELAY_MS = 400;

type ScrollTarget = { scrollTop: number; scrollLeft: number };

export type GuardWindow = {
    scrollX: number;
    scrollY: number;
    scrollTo(x: number, y: number): void;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    requestAnimationFrame(callback: () => void): number;
    setTimeout(callback: () => void, ms: number): unknown;
    visualViewport?: {
        addEventListener(type: string, listener: () => void): void;
        removeEventListener(type: string, listener: () => void): void;
    } | null;
    document: {
        documentElement: ScrollTarget;
        body: ScrollTarget | null;
        activeElement: Element | null;
        addEventListener(type: string, listener: () => void): void;
        removeEventListener(type: string, listener: () => void): void;
    };
};

/** True while a text input has focus and the on-screen keyboard may be open */
export function isEditing(active: Element | null): boolean {
    if (!active) return false;
    const tag = active.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const type = (active.getAttribute('type') || 'text').toLowerCase();
        return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(type);
    }
    return active.getAttribute('contenteditable') === 'true' || active.getAttribute('contenteditable') === '';
}

/**
 * Reset any scroll offset of the document.
 * Returns true when something was actually scrolled.
 */
export function resetDocumentScroll(win: GuardWindow): boolean {
    if (isEditing(win.document.activeElement)) return false;

    let changed = false;

    if (win.scrollX !== 0 || win.scrollY !== 0) {
        win.scrollTo(0, 0);
        changed = true;
    }

    for (const el of [win.document.documentElement, win.document.body]) {
        if (!el) continue;
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
            el.scrollTop = 0;
            el.scrollLeft = 0;
            changed = true;
        }
    }

    return changed;
}

/**
 * Watch the events after which iOS leaves the document scrolled and reset it,
 * once on the next frame and once more after the rotation has settled.
 * Returns a function that removes all listeners.
 */
export function installViewportGuard(win: GuardWindow = window as unknown as GuardWindow): () => void {
    let stopped = false;

    const check = () => {
        if (stopped) return;
        win.requestAnimationFrame(() => {
            if (!stopped) resetDocumentScroll(win);
        });
        win.setTimeout(() => {
            if (!stopped) resetDocumentScroll(win);
        }, SETTLE_DELAY_MS);
    };

    win.addEventListener('resize', check);
    win.addEventListener('orientationchange', check);
    win.addEventListener('scroll', check);
    win.document.addEventListener('focusout', check);
    win.visualViewport?.addEventListener('resize', check);

    check();

    return () => {
        stopped = true;
        win.removeEventListener('resize', check);
        win.removeEventListener('orientationchange', check);
        win.removeEventListener('scroll', check);
        win.document.removeEventListener('focusout', check);
        win.visualViewport?.removeEventListener('resize', check);
    };
}
