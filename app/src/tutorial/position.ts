/**
 * Where the tutorial card goes: above or below the highlighted element,
 * whichever side has more room, so it never covers what it explains.
 * Pure geometry - the component measures, this decides.
 */

export interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface Size {
    width: number;
    height: number;
}

/** Safe area of the device (notch, home indicator) in px */
export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export type Placement = 'top' | 'bottom' | 'center';

export interface CardPosition {
    top: number;
    left: number;
    placement: Placement;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Space kept free at the screen edge, inside the safe area */
export const EDGE_MARGIN = 8;

/** Space between the highlight and the card */
export const CARD_GAP = 12;

/** Space between the element and the highlight ring around it */
export const HIGHLIGHT_PADDING = 6;

function clamp(value: number, min: number, max: number): number {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

/** The part of the screen the card may use */
export function usableArea(viewport: Size, insets: Insets = NO_INSETS): Rect {
    const left = insets.left + EDGE_MARGIN;
    const top = insets.top + EDGE_MARGIN;

    return {
        left,
        top,
        width: Math.max(0, viewport.width - insets.right - EDGE_MARGIN - left),
        height: Math.max(0, viewport.height - insets.bottom - EDGE_MARGIN - top),
    };
}

/**
 * The highlight cut out around an element: a little larger than the element,
 * but kept on screen.
 */
export function highlightRect(target: Rect, viewport: Size, padding = HIGHLIGHT_PADDING): Rect {
    const left = clamp(target.left - padding, 0, viewport.width);
    const top = clamp(target.top - padding, 0, viewport.height);
    const right = clamp(target.left + target.width + padding, 0, viewport.width);
    const bottom = clamp(target.top + target.height + padding, 0, viewport.height);

    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Card position for a highlighted element (`null`: no element, card in the
 * middle). The card goes on the side with more room; when it fits on neither
 * side it hugs the far screen edge, so it covers as little as possible.
 */
export function placeCard(
    target: Rect | null,
    card: Size,
    viewport: Size,
    insets: Insets = NO_INSETS,
    gap = CARD_GAP,
): CardPosition {
    const area = usableArea(viewport, insets);
    const areaRight = area.left + area.width;
    const areaBottom = area.top + area.height;

    if (!target) {
        return {
            top: clamp(area.top + (area.height - card.height) / 2, area.top, areaBottom - card.height),
            left: clamp(area.left + (area.width - card.width) / 2, area.left, areaRight - card.width),
            placement: 'center',
        };
    }

    const targetBottom = target.top + target.height;
    const spaceAbove = target.top - gap - area.top;
    const spaceBelow = areaBottom - (targetBottom + gap);

    const placement: Placement = spaceBelow >= spaceAbove ? 'bottom' : 'top';

    let top: number;
    if (placement === 'bottom') {
        top = card.height <= spaceBelow ? targetBottom + gap : areaBottom - card.height;
    } else {
        top = card.height <= spaceAbove ? target.top - gap - card.height : area.top;
    }

    const centre = target.left + target.width / 2;

    return {
        top: clamp(top, area.top, areaBottom - card.height),
        left: clamp(centre - card.width / 2, area.left, areaRight - card.width),
        placement,
    };
}

/** True when two rectangles share any area */
export function overlaps(a: Rect, b: Rect): boolean {
    return a.left < b.left + b.width
        && b.left < a.left + a.width
        && a.top < b.top + b.height
        && b.top < a.top + a.height;
}
