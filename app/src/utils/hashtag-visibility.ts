import type { ExpressionSpecification } from 'maplibre-gl';
import { extractHashtags, hashtagKey } from './hashtags.ts';

/**
 * Hiding Features on the map by the hashtags in their remarks, as ATAK's Hashtag
 * Manager does with its per-tag visibility toggle.
 *
 * Every Feature drawn on the map carries the keys of its tags as one rendered
 * property, parsed with the same rules as the Hashtag Manager (utils/hashtags).
 * Hiding a tag is then a MapLibre layer filter on that property (see
 * stores/modules/hidden-hashtags), so:
 *
 * - toggling a tag re-filters the layers without re-sending any map data
 * - a Feature that gains or loses a hidden tag is hidden or shown again by its
 *   ordinary re-render, wherever it comes from (own, mission, other users)
 * - a filtered Feature is not in queryRenderedFeatures, so it cannot be clicked,
 *   opened in the radial menu or picked from the multi-select chooser
 *
 * This file is free of Dexie and Vue so the worker can render with it.
 */

/** Rendered property holding the tag keys of a Feature, ` #zug1 #reserve ` */
export const HASHTAG_KEYS_PROPERTY = 'hashtag-keys';

/** Distinct remarks whose keys are kept - a busy map has far fewer */
const CACHE_LIMIT = 4096;

const cache = new Map<string, string>();

/**
 * The keys of the tags in a text, each surrounded by single spaces so a filter
 * can match a whole key by substring (`' #zug1 '` is not in `' #zug10 '`).
 * Keys never contain whitespace, as a tag ends at the next whitespace.
 * Empty when the text carries no tag.
 *
 * Runs for every render of every Feature, so the result is cached per remarks.
 */
export function renderedHashtagKeys(remarks: unknown): string {
    if (typeof remarks !== 'string' || !remarks.includes('#')) return '';

    let keys = cache.get(remarks);
    if (keys !== undefined) return keys;

    const tags = extractHashtags(remarks);
    keys = tags.length ? ` ${tags.map(hashtagKey).join(' ')} ` : '';

    if (cache.size >= CACHE_LIMIT) {
        // Map iterates in insertion order - drop the oldest entry
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }

    cache.set(remarks, keys);

    return keys;
}

/**
 * MapLibre expression that is true for a rendered Feature carrying any of the
 * hidden tags, null when no tag is hidden.
 *
 * @param hidden - Tags to hide, in any spelling
 * @param exempt - Feature ids never hidden by a tag (ie the targets of a fire grid)
 */
export function hiddenHashtagsExpression(
    hidden: Iterable<string>,
    exempt: Iterable<string> = []
): ExpressionSpecification | null {
    const keys = [...new Set([...hidden].map(hashtagKey))].filter((key) => key.length > 1);
    if (!keys.length) return null;

    // A Feature without the property (other overlays) reads as '' and never matches
    const value: ExpressionSpecification = ['to-string', ['get', HASHTAG_KEYS_PROPERTY]];

    const matches = keys.map((key): ExpressionSpecification => ['in', ` ${key} `, value]);
    const match: ExpressionSpecification = matches.length === 1 ? matches[0] : ['any', ...matches];

    const exemptIds = [...new Set(exempt)];
    if (!exemptIds.length) return match;

    return ['all', match, ['!', ['in', ['get', 'id'], ['literal', exemptIds]]]];
}

/**
 * The first tag of the remarks that is hidden, as written in the remarks -
 * the "Hidden via #Zug1" hint of a Feature in a list
 *
 * @param hiddenKeys - Keys (lower case) of the hidden tags
 */
export function hidingHashtag(remarks: unknown, hiddenKeys: ReadonlySet<string>): string | undefined {
    if (!hiddenKeys.size) return undefined;

    return extractHashtags(remarks).find((tag) => hiddenKeys.has(hashtagKey(tag)));
}
