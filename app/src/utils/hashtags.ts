/**
 * Hashtags in a Feature's remarks, following ATAK (`com.atakmap.android.hashtags`,
 * ATAK-CIV 5.5.1.10) so tags written in ATAK, WinTAK or CloudTAK group the same way:
 *
 * - a tag is `#` followed by everything up to the next whitespace
 * - tags compare case-insensitively; the first spelling seen is displayed
 * - tags added to a Feature are appended to the end of its remarks
 *
 * Two deliberate differences from ATAK: tags also end at a line break, and
 * removing a tag removes only whole tags - ATAK's `String.replace` would turn
 * `#FURYgegner` into `gegner` when `#FURY` is removed.
 */

/** ATAK `HashtagUtils.parseTaggedMessage`: from `#` up to the next whitespace */
const TAG = /#\S+/g;

/** The case-insensitive identity of a tag */
export function hashtagKey(tag: string): string {
    return tag.toLowerCase();
}

/** Port of ATAK `HashtagUtils.validateTag`: `FURY ce` -> `#FURYce`, empty for nothing */
export function validateHashtag(tag: string | undefined): string {
    if (!tag) return '';

    let valid = tag.trim().replace(/\s+/g, '');
    if (valid === '' || valid === '#') return '';
    if (!valid.startsWith('#')) valid = '#' + valid;

    return valid;
}

/** All tags in a text in order of appearance, each once (case-insensitive) */
export function extractHashtags(text: unknown): string[] {
    if (typeof text !== 'string' || !text.includes('#')) return [];

    const seen = new Set<string>();
    const tags: string[] = [];

    for (const match of text.matchAll(TAG)) {
        const tag = match[0];
        if (tag.length < 2) continue;

        const key = hashtagKey(tag);
        if (seen.has(key)) continue;

        seen.add(key);
        tags.push(tag);
    }

    return tags;
}

/**
 * The remarks without their tags, on one line - in the Bat convention the
 * designation of a unit (`#FURY #FURYeinheiten Pz Kp 2` -> `Pz Kp 2`)
 */
export function stripHashtags(text: unknown): string {
    if (typeof text !== 'string' || text === 'None') return '';
    return text.replace(TAG, ' ').replace(/\s+/g, ' ').trim();
}

/** True if the text carries the tag (case-insensitive) */
export function hasHashtag(text: unknown, tag: string): boolean {
    const key = hashtagKey(tag);
    return extractHashtags(text).some((t) => hashtagKey(t) === key);
}

/** Append the tags the text does not carry yet, separated by a space, as ATAK does */
export function addHashtags(text: string | undefined, tags: string[]): string {
    const remarks = (text ?? '').trim();
    const present = new Set(extractHashtags(remarks).map(hashtagKey));

    const missing: string[] = [];
    for (const raw of tags) {
        const tag = validateHashtag(raw);
        if (!tag || present.has(hashtagKey(tag))) continue;

        present.add(hashtagKey(tag));
        missing.push(tag);
    }

    if (!missing.length) return remarks;
    return [remarks, ...missing].filter((part) => part.length).join(' ');
}

/** Remove every whole occurrence of a tag, keeping the remaining text and line breaks */
export function removeHashtag(text: string | undefined, tag: string): string {
    if (!text) return '';

    const key = hashtagKey(validateHashtag(tag));

    return text
        .split('\n')
        .map((line) => line
            .split(/[ \t]+/)
            .filter((word) => !(word.startsWith('#') && hashtagKey(word) === key))
            .join(' ')
            .trim())
        .join('\n')
        .trim();
}

export interface HashtagEntry<T> {
    /** The tag as first seen, e.g. `#FURYgegner` */
    tag: string;
    /** Case-insensitive key */
    key: string;
    items: T[];
}

/**
 * Group items by the tags in their remarks, sorted by tag
 * (ATAK `HashtagSortMode.ALPHABETICAL`)
 */
export function indexHashtags<T>(items: Iterable<T>, remarks: (item: T) => unknown): HashtagEntry<T>[] {
    const index = new Map<string, HashtagEntry<T>>();

    for (const item of items) {
        for (const tag of extractHashtags(remarks(item))) {
            const key = hashtagKey(tag);

            let entry = index.get(key);
            if (!entry) {
                entry = { tag, key, items: [] };
                index.set(key, entry);
            }

            entry.items.push(item);
        }
    }

    return Array.from(index.values()).sort((a, b) => a.key.localeCompare(b.key));
}
