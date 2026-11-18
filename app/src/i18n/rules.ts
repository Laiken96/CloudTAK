/**
 * Shared rules for which template strings are translated. Used by the build
 * time template transform (compiler.ts) and the extraction tool
 * (tools/extract.ts), so both always agree on what counts as UI text.
 */

/**
 * Static attributes whose value is user-facing text. Other attributes
 * (class, name, type, value, …) are never touched.
 */
export const TRANSLATABLE_ATTRS = new Set([
    'label',
    'title',
    'placeholder',
    'desc',
    'description',
    'aria-label',
    'alt',
    'hint',
    'edit-title',
    'empty-label',
    'expired-label',
    'enabled-label',
    'disabled-label',
    'input-placeholder',
    'submit-label',
    'no-value-label',
    'loading-label',
]);

/**
 * Elements whose text content is code, data or a form value and must stay
 * exactly as written.
 */
export const SKIP_TAGS = new Set([
    'code',
    'pre',
    'kbd',
    'samp',
    'script',
    'style',
    'textarea',
]);

/**
 * Elements (and their subtrees) can opt out with this attribute.
 */
export const OPT_OUT_ATTR = 'data-no-i18n';

/**
 * Dictionary key for a piece of template text: whitespace collapsed, trimmed.
 */
export function normalizeKey(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * True when the text contains words worth translating (not only numbers,
 * punctuation or symbols).
 */
export function isCandidate(text: string): boolean {
    return /[A-Za-z]{2,}/.test(text);
}
