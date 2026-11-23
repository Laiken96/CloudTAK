import { reactive, watch } from 'vue';
import type { ExpressionSpecification } from 'maplibre-gl';
import KV from '../../base/kv.ts';
import FireGrids from '../../base/fire-grids.ts';
import { hashtagKey, validateHashtag } from '../../utils/hashtags.ts';
import { hiddenHashtagsExpression, hidingHashtag } from '../../utils/hashtag-visibility.ts';
import { FeatureVisibility } from './feature-visibility.ts';

/**
 * Hashtags hidden on the map of this device - ATAK's Hashtag Manager visibility
 * toggle. A rule rather than a list of Features: every Feature whose remarks
 * carry a hidden tag is left off the map, including Features that get the tag
 * later, and shows again once the tag is removed from its remarks.
 *
 * Applied through the per-overlay layer filter of FeatureVisibility, which
 * covers the Map Features overlay (own and received Features) and every
 * mission overlay. Not affected: the own position (drawn by the geolocate
 * control, not an overlay) and the fire grids with their targets, which are
 * shown and hidden with their grid.
 *
 * Kept on this device only (Dexie KV), so it survives a restart.
 */

export const HIDDEN_HASHTAGS_KEY = 'hashtags::hidden';

const state = reactive<{ tags: string[] }>({
    tags: []
});

let watching = false;

/** UIDs of the targets of all fire grids, which a tag never hides */
function fireGridTargets(): string[] {
    return FireGrids.state.grids.flatMap((grid) => grid.targets);
}

export default class HiddenHashtags {
    /** Reactive list of the hidden tags, as first written */
    static readonly state = state;

    /** Parse a stored list, dropping malformed and duplicate (any case) tags */
    static parse(value: string | undefined): string[] {
        if (!value) return [];

        let raw: unknown;
        try {
            raw = JSON.parse(value);
        } catch {
            return [];
        }

        if (!Array.isArray(raw)) return [];

        const seen = new Set<string>();
        const tags: string[] = [];

        for (const entry of raw) {
            if (typeof entry !== 'string') continue;

            const tag = validateHashtag(entry);
            if (!tag || seen.has(hashtagKey(tag))) continue;

            seen.add(hashtagKey(tag));
            tags.push(tag);
        }

        return tags;
    }

    /** Read the stored tags, called once by FeatureVisibility.load() at map start */
    static async load(): Promise<void> {
        try {
            state.tags = this.parse(await KV.value(HIDDEN_HASHTAGS_KEY));
        } catch (err) {
            console.error('Failed to load hidden hashtags', err);
        }

        if (!watching) {
            watching = true;

            // An imported or deleted fire grid changes the exempt targets
            watch(() => fireGridTargets().join('\n'), () => {
                if (state.tags.length) void FeatureVisibility.apply();
            });
        }

        // Fire grid targets must be known before the first filter hides them
        await FireGrids.load().catch((err: unknown) => {
            console.error('Failed to load fire grids for hidden hashtags', err);
        });
    }

    static keys(): Set<string> {
        return new Set(state.tags.map(hashtagKey));
    }

    static isHidden(tag: string): boolean {
        const key = hashtagKey(validateHashtag(tag));
        return state.tags.some((t) => hashtagKey(t) === key);
    }

    /** Hide or show every Feature carrying the tag, on this device */
    static async setHidden(tag: string, hidden: boolean): Promise<void> {
        const valid = validateHashtag(tag);
        if (!valid || this.isHidden(valid) === hidden) return;

        const key = hashtagKey(valid);
        const tags = hidden
            ? [...state.tags, valid]
            : state.tags.filter((t) => hashtagKey(t) !== key);

        await this.save(tags);
    }

    static async toggle(tag: string): Promise<void> {
        await this.setHidden(tag, !this.isHidden(tag));
    }

    /** Show every hidden tag again */
    static async showAll(): Promise<void> {
        if (!state.tags.length) return;
        await this.save([]);
    }

    private static async save(tags: string[]): Promise<void> {
        state.tags = tags;

        try {
            await KV.update(HIDDEN_HASHTAGS_KEY, JSON.stringify(tags));
        } catch (err) {
            console.error('Failed to persist hidden hashtags', err);
        }

        await FeatureVisibility.apply();
    }

    /** The tag a Feature with these remarks is hidden by, as written in them */
    static hiddenBy(remarks: unknown): string | undefined {
        return hidingHashtag(remarks, this.keys());
    }

    /** Layer filter clause matching the Features to hide, null if none is hidden */
    static expression(): ExpressionSpecification | null {
        if (!state.tags.length) return null;
        return hiddenHashtagsExpression(state.tags, fireGridTargets());
    }
}
