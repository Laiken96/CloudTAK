import { describe, expect, it } from 'vitest';
import {
    CARD_GAP,
    EDGE_MARGIN,
    highlightRect,
    overlaps,
    placeCard,
    usableArea,
    type Insets,
    type Rect,
} from './position.ts';

// iPhone in portrait with notch and home indicator
const PHONE = { width: 390, height: 844 };
const PHONE_INSETS: Insets = { top: 47, right: 0, bottom: 34, left: 0 };
const CARD = { width: 358, height: 200 };

function cardRect(pos: { top: number; left: number }, size = CARD): Rect {
    return { top: pos.top, left: pos.left, width: size.width, height: size.height };
}

describe('placeCard', () => {
    it('puts the card below an element at the top of the screen', () => {
        const menuButton: Rect = { top: 55, left: 330, width: 44, height: 44 };

        const pos = placeCard(menuButton, CARD, PHONE, PHONE_INSETS);

        expect(pos.placement).toBe('bottom');
        expect(pos.top).toBe(menuButton.top + menuButton.height + CARD_GAP);
        expect(overlaps(cardRect(pos), menuButton)).toBe(false);
    });

    it('puts the card above an element at the bottom of the screen', () => {
        const gpsPanel: Rect = { top: 718, left: 8, width: 220, height: 84 };

        const pos = placeCard(gpsPanel, CARD, PHONE, PHONE_INSETS);

        expect(pos.placement).toBe('top');
        expect(pos.top + CARD.height).toBe(gpsPanel.top - CARD_GAP);
        expect(overlaps(cardRect(pos), gpsPanel)).toBe(false);
    });

    it('keeps the card inside the safe area and the screen', () => {
        const nearLeft: Rect = { top: 120, left: 0, width: 40, height: 40 };
        const nearRight: Rect = { top: 120, left: 370, width: 20, height: 40 };

        for (const target of [nearLeft, nearRight]) {
            const pos = placeCard(target, CARD, PHONE, PHONE_INSETS);
            expect(pos.left).toBeGreaterThanOrEqual(PHONE_INSETS.left + EDGE_MARGIN);
            expect(pos.left + CARD.width).toBeLessThanOrEqual(PHONE.width - PHONE_INSETS.right - EDGE_MARGIN);
            expect(pos.top).toBeGreaterThanOrEqual(PHONE_INSETS.top + EDGE_MARGIN);
            expect(pos.top + CARD.height).toBeLessThanOrEqual(PHONE.height - PHONE_INSETS.bottom - EDGE_MARGIN);
        }
    });

    it('stays clear of the home indicator for elements at the very bottom', () => {
        const bar: Rect = { top: 760, left: 8, width: 300, height: 60 };
        const pos = placeCard(bar, CARD, PHONE, PHONE_INSETS);

        expect(pos.placement).toBe('top');
        expect(pos.top + CARD.height).toBeLessThanOrEqual(PHONE.height - PHONE_INSETS.bottom - EDGE_MARGIN);
    });

    it('centres the card on the element where the screen allows', () => {
        const target: Rect = { top: 300, left: 150, width: 90, height: 40 };
        const wide = { width: 1200, height: 800 };
        const card = { width: 360, height: 180 };

        const pos = placeCard(target, card, wide);

        expect(pos.left + card.width / 2).toBe(target.left + target.width / 2);
    });

    it('centres the card on the screen without an element', () => {
        const pos = placeCard(null, CARD, PHONE, PHONE_INSETS);
        const area = usableArea(PHONE, PHONE_INSETS);

        expect(pos.placement).toBe('center');
        expect(pos.top).toBe(area.top + (area.height - CARD.height) / 2);
        expect(pos.left).toBe(area.left + (area.width - CARD.width) / 2);
    });

    it('moves to the other side after a rotation to landscape', () => {
        const landscape = { width: 844, height: 390 };
        const insets: Insets = { top: 0, right: 47, bottom: 21, left: 47 };
        const card = { width: 360, height: 170 };

        // Top bar button: below in both orientations
        const top = placeCard({ top: 8, left: 700, width: 44, height: 44 }, card, landscape, insets);
        expect(top.placement).toBe('bottom');

        // GPS panel: above
        const bottom = placeCard({ top: 290, left: 55, width: 220, height: 84 }, card, landscape, insets);
        expect(bottom.placement).toBe('top');
        expect(bottom.top + card.height).toBeLessThanOrEqual(290 - CARD_GAP);
        expect(bottom.left).toBeGreaterThanOrEqual(insets.left + EDGE_MARGIN);
    });

    it('hugs the far edge when the card fits on neither side', () => {
        const small = { width: 390, height: 500 };
        const middle: Rect = { top: 200, left: 100, width: 100, height: 60 };
        const tall = { width: 358, height: 260 };

        const pos = placeCard(middle, tall, small);

        // More room below: the card goes to the bottom edge, covering as little as possible
        expect(pos.placement).toBe('bottom');
        expect(pos.top + tall.height).toBe(small.height - EDGE_MARGIN);
    });

    it('never places the card off screen, even when it is larger than the screen', () => {
        const tiny = { width: 300, height: 200 };
        const pos = placeCard({ top: 50, left: 50, width: 50, height: 50 }, { width: 358, height: 400 }, tiny);

        expect(pos.top).toBe(EDGE_MARGIN);
        expect(pos.left).toBe(EDGE_MARGIN);
    });
});

describe('highlightRect', () => {
    it('adds room around the element', () => {
        expect(highlightRect({ top: 100, left: 100, width: 50, height: 20 }, PHONE, 6))
            .toEqual({ top: 94, left: 94, width: 62, height: 32 });
    });

    it('stays on screen for elements at the edge', () => {
        const rect = highlightRect({ top: 0, left: 0, width: 50, height: 20 }, PHONE, 6);
        expect(rect.top).toBe(0);
        expect(rect.left).toBe(0);
        expect(rect.width).toBe(56);
    });
});
