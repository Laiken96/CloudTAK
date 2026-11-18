/**
 * Minimal runtime translation for the CloudTAK web app.
 *
 * The source stays English. English strings are the dictionary keys, so an
 * upstream text change simply falls back to English until de.json catches up
 * (run `node src/i18n/tools/extract.ts` to list missing entries).
 *
 * - Templates: static text and static UI attributes (label, title, …) are
 *   rewritten at build time to `$tr('…')` by compiler.ts, nothing to do in
 *   the components themselves.
 * - Script code: wrap user-facing strings with `tr('…')`; `{name}` style
 *   placeholders are filled from the optional params.
 *
 * The language is stored per device; switching reloads the page so strings
 * computed once at module load are rebuilt too.
 */
import type { App } from 'vue';
import de from './de.json';
import deValues from './de.values.json';

export type Locale = 'de' | 'en';

export const LOCALES: Array<{ id: Locale; label: string }> = [
    { id: 'de', label: 'Deutsch' },
    { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'cloudtak-locale';

const DICTIONARIES: Record<Locale, Record<string, string> | null> = {
    de: de as Record<string, string>,
    en: null,
};

/**
 * Display names for stored option values ('kilometer', 'never', 'Dark', …).
 * Kept apart from the UI dictionary because these strings are data: they are
 * only ever translated for display (`<option :value>` text), never in code.
 */
const VALUE_DICTIONARIES: Record<Locale, Record<string, string> | null> = {
    de: deValues as Record<string, string>,
    en: null,
};

function isLocale(value: unknown): value is Locale {
    return value === 'de' || value === 'en';
}

function storedLocale(): Locale | null {
    try {
        const value = globalThis.localStorage?.getItem(STORAGE_KEY);
        return isLocale(value) ? value : null;
    } catch {
        return null;
    }
}

// Unit tests assert on the English source strings.
const DEFAULT_LOCALE: Locale = import.meta.env.MODE === 'test' ? 'en' : 'de';

let current: Locale = storedLocale() ?? DEFAULT_LOCALE;

export function getLocale(): Locale {
    return current;
}

export function setLocale(locale: Locale, opts: { reload?: boolean } = {}): void {
    current = locale;

    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, locale);
    } catch {
        // Storage blocked: the choice lasts for this page only.
    }

    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    if (opts.reload !== false && typeof window !== 'undefined') window.location.reload();
}

/**
 * Translate an English UI string into the active language.
 */
export function tr(text: string, params?: Record<string, string | number>): string {
    const dictionary = DICTIONARIES[current];

    let out: string;
    if (dictionary && Object.hasOwn(dictionary, text)) {
        // may be '' on purpose (a sentence fragment German does not need)
        out = dictionary[text];
    } else {
        // `File.vue::Text` keys (file-scoped overrides) fall back to `Text`
        const scope = text.indexOf('::');
        const plain = scope === -1 ? text : text.slice(scope + 2);
        out = dictionary && Object.hasOwn(dictionary, plain) ? dictionary[plain] : plain;
    }

    if (params) {
        out = out.replace(/\{(\w+)\}/g, (match, key: string) => {
            return key in params ? String(params[key]) : match;
        });
    }

    return out;
}

/**
 * Display text for an option value: value names first, then UI strings.
 * Non-strings are returned unchanged.
 */
export function trValue<T>(value: T): T | string {
    if (typeof value !== 'string') return value;

    const values = VALUE_DICTIONARIES[current];
    if (values && Object.hasOwn(values, value)) return values[value];
    return tr(value);
}

export default {
    install(app: App): void {
        app.config.globalProperties.$tr = tr;
        app.config.globalProperties.$trv = trValue;
        if (typeof document !== 'undefined') document.documentElement.lang = current;
    },
};

declare module 'vue' {
    interface ComponentCustomProperties {
        $tr: typeof tr;
        $trv: typeof trValue;
    }
}
