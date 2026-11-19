import { reactive } from 'vue';
import { db, type DBFavoriteSignature } from '../database.ts';
import { signatureKey, type Signature } from '../utils/signature.ts';

/**
 * Favourite signatures for quick placement (Dexie table `favorite_signature`).
 *
 * Kept per device: the profile API only accepts its fixed settings keys, so a
 * per user server copy would need an API change.
 */

export type FavoriteSignature = DBFavoriteSignature;

const state = reactive<{ loaded: boolean; items: FavoriteSignature[] }>({
    loaded: false,
    items: []
});

let loading: Promise<FavoriteSignature[]> | null = null;

function bySort(a: FavoriteSignature, b: FavoriteSignature): number {
    return a.sort - b.sort || a.created.localeCompare(b.created);
}

/** Plain copy - IndexedDB cannot store the reactive proxies the state hands out */
function plain(item: FavoriteSignature): FavoriteSignature {
    const row: FavoriteSignature = {
        id: item.id,
        label: item.label,
        type: item.type,
        sort: item.sort,
        created: item.created
    };

    if (item.icon) row.icon = item.icon;
    if (item.color) row.color = item.color;

    return row;
}

export function signatureOf(item: FavoriteSignature): Signature {
    const sig: Signature = { type: item.type };
    if (item.icon) sig.icon = item.icon;
    if (item.color) sig.color = item.color;
    return sig;
}

export default class FavoriteSignatures {
    /** Reactive list in bar order, filled by load() */
    static readonly state = state;

    static async load(opts: { reload?: boolean } = {}): Promise<FavoriteSignature[]> {
        if (state.loaded && !opts.reload) return state.items;

        if (!loading) {
            loading = (async () => {
                try {
                    const rows = await db.favorite_signature.toArray();
                    state.items = rows.sort(bySort);
                } catch (err) {
                    console.error('Failed to load favourite signatures', err);
                    state.items = [];
                }

                state.loaded = true;
                return state.items;
            })().finally(() => {
                loading = null;
            });
        }

        return await loading;
    }

    static find(sig: Signature): FavoriteSignature | undefined {
        const id = signatureKey(sig);
        return state.items.find((item) => item.id === id);
    }

    static has(sig: Signature): boolean {
        return !!this.find(sig);
    }

    /** Add a signature at the end of the bar - an existing favourite is returned unchanged */
    static async add(sig: Signature, label: string): Promise<FavoriteSignature> {
        await this.load();

        const existing = this.find(sig);
        if (existing) return existing;

        const row: FavoriteSignature = plain({
            id: signatureKey(sig),
            label: label.trim() || sig.type,
            type: sig.type,
            icon: sig.icon,
            color: sig.color?.toUpperCase(),
            sort: state.items.reduce((max, item) => Math.max(max, item.sort), -1) + 1,
            created: new Date().toISOString()
        });

        await db.favorite_signature.put(row);
        state.items = [...state.items, row].sort(bySort);

        return row;
    }

    static async remove(id: string): Promise<void> {
        await this.load();

        state.items = state.items.filter((item) => item.id !== id);
        await db.favorite_signature.delete(id);
    }

    /** Add the signature if it is not a favourite yet, otherwise remove it. Resolves to the new favourite state */
    static async toggle(sig: Signature, label: string): Promise<boolean> {
        await this.load();

        const existing = this.find(sig);
        if (existing) {
            await this.remove(existing.id);
            return false;
        }

        await this.add(sig, label);
        return true;
    }

    static async rename(id: string, label: string): Promise<void> {
        await this.load();

        const item = state.items.find((item) => item.id === id);
        if (!item) throw new Error('Favourite not found');

        const next = { ...item, label: label.trim() || item.type };
        state.items = state.items.map((i) => i.id === id ? next : i);
        await db.favorite_signature.update(id, { label: next.label });
    }

    /** Put the favourites in the given order - ids not listed keep their place after the listed ones */
    static async reorder(ids: string[]): Promise<void> {
        await this.load();

        const listed = ids
            .map((id) => state.items.find((item) => item.id === id))
            .filter((item): item is FavoriteSignature => !!item);

        const rest = state.items.filter((item) => !ids.includes(item.id));

        const next = [...listed, ...rest].map((item, sort) => ({ ...item, sort }));
        state.items = next;
        await db.favorite_signature.bulkPut(next.map(plain));
    }

    /** Move a favourite by `delta` places, clamped to the ends of the list */
    static async move(id: string, delta: number): Promise<void> {
        await this.load();

        const ids = state.items.map((item) => item.id);
        const from = ids.indexOf(id);
        if (from === -1) return;

        const to = Math.min(ids.length - 1, Math.max(0, from + delta));
        if (to === from) return;

        ids.splice(from, 1);
        ids.splice(to, 0, id);

        await this.reorder(ids);
    }
}
