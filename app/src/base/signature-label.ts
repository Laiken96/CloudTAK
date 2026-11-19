import COT from './cot.ts';
import Icon from './icon.ts';
import { describeAppearance, isTyped } from '../utils/appearance.ts';
import { signatureProperties, type Signature } from '../utils/signature.ts';
import type { Feature } from '../types.ts';

/**
 * Short human readable name for a signature: the icon name for an Iconset
 * icon ("Fire"), else the Appearance title ("Hostile · Infantry")
 */
export async function signatureLabel(sig: Signature): Promise<string> {
    if (sig.icon) {
        const path = sig.icon.split(':').slice(1).join(':').replace(/\.png$/i, '');
        let name = path.split('/').pop() || path;

        try {
            const entry = await Icon.get(sig.icon.replace(/\.png$/i, ''));
            if (entry) name = entry.path.split('/').pop()?.replace(/\.png$/i, '') || name;
        } catch (err) {
            console.warn('Could not resolve icon label:', err);
        }

        return name;
    }

    let typeName: string | undefined;

    if (isTyped(sig.type)) {
        try {
            typeName = (await COT.resolveType(sig.type)).name;
        } catch (err) {
            console.warn('Could not resolve type label:', err);
        }
    }

    const properties = { ...signatureProperties(sig) } as Feature['properties'];
    const summary = describeAppearance(properties, typeName);

    return isTyped(sig.type) ? summary.title : summary.subtitle;
}
