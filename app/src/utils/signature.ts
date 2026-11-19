import { isTyped, markerOf, SPOT_TYPES } from './appearance.ts';
import type { Feature } from '../types.ts';

/**
 * A signature is what a placed point looks like and what it is: its CoT type
 * or MIL-STD-2525 SIDC plus, for a custom marker, an Iconset icon or a spot
 * colour. Works with any Iconset and with 2525 symbols alike.
 */
export interface Signature {
    /** CoT type or numeric SIDC */
    type: string;
    /** Iconset icon key "<iconsetUid>:<path>" */
    icon?: string;
    /** marker-color of an icon or spot - a military symbol takes its colour from the affiliation */
    color?: string;
}

const DEFAULT_COLOR = '#FFFFFF';

function normalizeColor(color: unknown): string {
    return typeof color === 'string' && color ? color.toUpperCase() : DEFAULT_COLOR;
}

/** The signature of a point Feature, as the Appearance editor would show it */
export function signatureFrom(properties: Pick<Feature['properties'], 'type' | 'icon' | 'marker-color'>): Signature {
    const type = properties.type || 'u-d-p';

    switch (markerOf(properties)) {
        case 'icon':
            return { type, icon: properties.icon, color: normalizeColor(properties['marker-color']) };
        case 'spot':
            return { type: SPOT_TYPES.includes(type) ? type : 'u-d-p', color: normalizeColor(properties['marker-color']) };
        default:
            return { type };
    }
}

/** Stable identity of a signature - two favourites with the same key are duplicates */
export function signatureKey(sig: Signature): string {
    const marker = sig.icon || !isTyped(sig.type);
    return [sig.type, sig.icon ?? '', marker ? normalizeColor(sig.color) : ''].join('|');
}

/**
 * Feature properties a placed point takes from its signature - the same
 * shape the Appearance editor persists (see applyAppearance)
 */
export function signatureProperties(sig: Signature): Pick<Feature['properties'], 'type' | 'icon' | 'marker-color' | 'marker-opacity'> {
    const properties: Pick<Feature['properties'], 'type' | 'icon' | 'marker-color' | 'marker-opacity'> = {
        type: sig.type,
        'marker-opacity': 1,
    };

    if (sig.icon) {
        properties.icon = sig.icon;
        properties['marker-color'] = normalizeColor(sig.color);
    } else if (!isTyped(sig.type)) {
        properties['marker-color'] = normalizeColor(sig.color);
    } else {
        // Spritesheet symbols are tinted by marker-color - white keeps the affiliation colour
        properties['marker-color'] = DEFAULT_COLOR;
    }

    return properties;
}
