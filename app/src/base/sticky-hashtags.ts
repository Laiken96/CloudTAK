import KV from './kv.ts';
import { addHashtags, hashtagKey, validateHashtag } from '../utils/hashtags.ts';

/**
 * Sticky Hashtags, as in ATAK (`com.atakmap.android.hashtags.StickyHashtags`):
 * enabled tags are appended to the remarks of every Feature the user creates
 * (drawn, placed or entered) - never to imported or received Features.
 *
 * Kept on this device only (Dexie KV), readable from the main thread and the worker.
 */

export interface StickyHashtag {
    tag: string;
    enabled: boolean;
}

export const STICKY_HASHTAGS_KEY = 'hashtags::sticky';

/** Remarks value COT.styleProperties stores for a Feature without remarks */
const EMPTY_REMARKS = 'None';

export default class StickyHashtags {
    /** Parse a stored list, dropping malformed and duplicate entries */
    static parse(value: string | undefined): StickyHashtag[] {
        if (!value) return [];

        let raw: unknown;
        try {
            raw = JSON.parse(value);
        } catch {
            return [];
        }

        if (!Array.isArray(raw)) return [];

        const seen = new Set<string>();
        const list: StickyHashtag[] = [];

        for (const entry of raw) {
            if (!entry || typeof entry !== 'object') continue;

            const tag = validateHashtag(String((entry as StickyHashtag).tag ?? ''));
            if (!tag || seen.has(hashtagKey(tag))) continue;

            seen.add(hashtagKey(tag));
            list.push({ tag, enabled: (entry as StickyHashtag).enabled !== false });
        }

        return list;
    }

    static async list(): Promise<StickyHashtag[]> {
        return this.parse(await KV.value(STICKY_HASHTAGS_KEY));
    }

    static async save(list: StickyHashtag[]): Promise<StickyHashtag[]> {
        const clean = this.parse(JSON.stringify(list));
        await KV.update(STICKY_HASHTAGS_KEY, JSON.stringify(clean));
        return clean;
    }

    /** Add a tag (enabled) or re-enable it if it is already in the list */
    static async add(tag: string): Promise<StickyHashtag[]> {
        const valid = validateHashtag(tag);
        if (!valid) return this.list();

        const list = await this.list();
        const existing = list.find((s) => hashtagKey(s.tag) === hashtagKey(valid));

        if (existing) {
            existing.enabled = true;
        } else {
            list.push({ tag: valid, enabled: true });
        }

        return this.save(list);
    }

    static async remove(tag: string): Promise<StickyHashtag[]> {
        const key = hashtagKey(validateHashtag(tag));
        return this.save((await this.list()).filter((s) => hashtagKey(s.tag) !== key));
    }

    static async setEnabled(tag: string, enabled: boolean): Promise<StickyHashtag[]> {
        const key = hashtagKey(validateHashtag(tag));
        return this.save((await this.list()).map((s) => hashtagKey(s.tag) === key ? { ...s, enabled } : s));
    }

    static async enabled(): Promise<string[]> {
        return (await this.list()).filter((s) => s.enabled).map((s) => s.tag);
    }

    /**
     * Remarks of a newly created Feature with the enabled sticky tags appended.
     * Remarks are returned unchanged when no sticky tag is enabled.
     */
    static async apply(remarks: string | undefined): Promise<string | undefined> {
        const tags = await this.enabled();
        if (!tags.length) return remarks;

        const base = remarks === EMPTY_REMARKS ? '' : remarks;
        return addHashtags(base, tags);
    }
}
