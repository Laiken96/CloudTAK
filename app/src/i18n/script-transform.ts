/**
 * Build-time transform for UI strings in script code: object properties such
 * as `label: 'Features'` or `description: '…'` become
 * `label: __cloudtak_tr('Features')`, but only when
 *   - the property name is in SCRIPT_PROPS, and
 *   - the exact string has an entry in the dictionary.
 * The source files stay English, so upstream merges are unaffected.
 *
 * Web workers are excluded (no localStorage there, and they show no UI), as
 * are tests and the i18n module itself.
 */
import type { Plugin } from 'vite';

/**
 * Property names that hold user-facing text in this code base. Generic names
 * (name, type, value, status, key, …) are deliberately absent: they often
 * carry data or identifiers.
 */
export const SCRIPT_PROPS = [
    'label',
    'title',
    'tooltip',
    'description',
    'placeholder',
    'meaning',
    'subtitle',
    'hint',
    'default',
    'urlLabel',
    'urlDescription',
    'editTitle',
    'saveLabel',
    'savingLabel',
    'emptyLabel',
    'valueLabel',
    // MenuSettingsPermissions / WarnConfiguration status messages
    'location',
    'backgroundLocation',
    'notification',
    'orientation',
    'storage',
    'camera',
    'wakeLock',
    'fileSystem',
];

const IMPORT = `import { tr as __cloudtak_tr } from '@/i18n/index.ts';`;

function unescape(literal: string): string {
    return literal.replace(/\\(.)/g, '$1');
}

function propertyPattern(): RegExp {
    return new RegExp(
        String.raw`(?<![\w$.])(${SCRIPT_PROPS.join('|')})(\s*:\s*)(['"])((?:(?!\3)[^\\\n]|\\.)*)\3`,
        'g',
    );
}

/**
 * Script files the transform applies to (used by the plugin and the
 * extraction tool).
 */
export function isScriptTarget(file: string): boolean {
    if (/\/(i18n|workers|test|__harness__)\//.test(file) || file.endsWith('.spec.ts')) return false;
    return file.endsWith('.ts') || file.endsWith('.vue');
}

/**
 * All UI-looking string values of SCRIPT_PROPS properties in a source file
 * (for the extraction tool).
 */
export function scriptStrings(code: string, isVue: boolean): string[] {
    const blocks = isVue
        ? [...code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
        : [code];

    const out: string[] = [];
    for (const block of blocks) {
        for (const m of block.matchAll(propertyPattern())) {
            const text = unescape(m[4]).trim();
            if (!/[A-Za-z]{2,}/.test(text)) continue;
            // identifiers, css, urls, paths
            if (/^[a-z0-9_\-.:/#]+$/.test(text) || /^(https?:|\/|#|rgba?\(|var\()/.test(text)) continue;
            out.push(text);
        }
    }
    return out;
}

/**
 * Rewrite matching properties in a chunk of script code. Returns null when
 * nothing changed.
 */
export function rewriteScript(code: string, keys: Set<string>): string | null {
    const pattern = propertyPattern();

    let changed = false;
    const out = code.replace(pattern, (match, prop: string, sep: string, quote: string, body: string) => {
        const text = unescape(body);
        // Lowercase single tokens ('mile', 'feet', 'details') are identifiers or
        // stored values, never UI text.
        if (/^[a-z0-9_\-./]+$/.test(text)) return match;
        if (!keys.has(text)) return match;
        changed = true;
        return `${prop}${sep}__cloudtak_tr(${quote}${body}${quote})`;
    });

    return changed ? out : null;
}

function rewriteVue(code: string, keys: Set<string>): string | null {
    let injected = false;
    let changed = false;

    const out = code.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (match, open: string, body: string, close: string) => {
        const rewritten = rewriteScript(body, keys);
        if (rewritten === null) return match;
        changed = true;

        // One import per SFC: <script> and <script setup> share module scope.
        const head = injected ? '' : IMPORT;
        injected = true;
        return `${open}${head}${rewritten}${close}`;
    });

    return changed ? out : null;
}

export function i18nScriptPlugin(dictionary: Record<string, string>, srcDir: string): Plugin {
    const keys = new Set(Object.keys(dictionary));
    const root = srcDir.endsWith('/') ? srcDir : `${srcDir}/`;

    return {
        name: 'cloudtak-i18n-script',
        enforce: 'pre',
        transform(code, id) {
            const [file, query] = id.split('?');
            if (query) return null;
            if (!file.startsWith(root) || !isScriptTarget(file)) return null;

            let out: string | null = null;
            if (file.endsWith('.ts')) {
                const rewritten = rewriteScript(code, keys);
                // Same line as the first statement: keeps line numbers intact.
                if (rewritten !== null) out = IMPORT + rewritten;
            } else if (file.endsWith('.vue')) {
                out = rewriteVue(code, keys);
            }

            return out === null ? null : { code: out, map: null };
        },
    };
}
