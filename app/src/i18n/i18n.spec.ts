import { describe, expect, it, afterEach } from 'vitest';
import { compile } from '@vue/compiler-dom';
import { createI18nTransform } from './compiler.ts';
import { rewriteScript } from './script-transform.ts';
import { getLocale, setLocale, tr, trValue } from './index.ts';
import de from './de.json';
import deValues from './de.values.json';

function compileWith(template: string, dict: Record<string, string>, values: Record<string, string> = {}, filename = 'Test.vue'): string {
    return compile(template, {
        mode: 'module',
        prefixIdentifiers: true,
        filename,
        nodeTransforms: [createI18nTransform(dict, values)],
    }).code;
}

describe('i18n runtime', () => {
    afterEach(() => setLocale('en', { reload: false }));

    it('returns English in tests and translates after switching to German', () => {
        expect(getLocale()).toBe('en');
        expect(tr('Save')).toBe('Save');

        setLocale('de', { reload: false });
        expect(tr('Save')).toBe(de['Save' as keyof typeof de]);
        expect(tr('Not in the dictionary')).toBe('Not in the dictionary');
    });

    it('fills {placeholders}', () => {
        expect(tr('Select up to {n}', { n: 3 })).toBe('Select up to 3');
    });

    it('resolves file-scoped keys and falls back to the plain text', () => {
        expect(tr('Delete.vue::Type')).toBe('Type');

        setLocale('de', { reload: false });
        expect(tr('Delete.vue::Type')).toBe(de['Delete.vue::Type' as keyof typeof de]);
        expect(tr('Other.vue::Save')).toBe(de['Save' as keyof typeof de]);
        // an intentionally empty fragment stays empty
        expect(tr('Map.vue::your location')).toBe('');
    });

    it('translates option values for display only', () => {
        setLocale('de', { reload: false });
        expect(trValue('kilometer')).toBe(deValues['kilometer' as keyof typeof deValues]);
        expect(trValue(42)).toBe(42);
    });
});

describe('i18n dictionaries', () => {
    it('use Swiss spelling (no ß)', () => {
        for (const value of [...Object.values(de), ...Object.values(deValues)]) {
            expect(value).not.toContain('ß');
        }
    });
});

describe('i18n template transform', () => {
    const dict = { 'Save': 'Speichern', 'Name': 'Name', 'Delete.vue::Type': 'Zur Bestätigung', 'Type': 'Typ', 'Create': 'Erstellen' };

    it('rewrites static text and UI attributes with a translation', () => {
        const code = compileWith(`<div><button title='Save'>Save</button><span>Untranslated</span></div>`, dict);
        expect(code).toContain('_ctx.$tr("Save")');
        expect(code).toContain('title: _ctx.$tr("Save")');
        expect(code).toContain('Untranslated');
        expect(code).not.toContain('$tr("Untranslated")');
    });

    it('leaves code, opted-out subtrees and non-UI attributes alone', () => {
        const code = compileWith(`<div><code>Save</code><p data-no-i18n>Save</p><input name='Save'></div>`, dict);
        expect(code).not.toContain('$tr(');
    });

    it('uses file-scoped overrides', () => {
        expect(compileWith(`<p>Type</p>`, dict, {}, '/x/Delete.vue')).toContain('$tr("Delete.vue::Type")');
        expect(compileWith(`<p>Type</p>`, dict, {}, '/x/Other.vue')).toContain('$tr("Type")');
    });

    it('translates expression results that contain a translatable literal', () => {
        const code = compileWith(`<p>{{ editing ? 'Save' : 'Create' }}</p>`, dict);
        expect(code).toContain('_ctx.$trv(');
        expect(compileWith(`<p>{{ count }}</p>`, dict)).not.toContain('$trv(');
    });

    it('translates only the displayed text of bound <option> values', () => {
        const code = compileWith(`<select><option v-for='o in options' :key='o' :value='o' v-text='o' /></select>`, dict);
        expect(code).toContain('_ctx.$trv(o)');
        expect(code).toMatch(/value: o\b/);
    });
});

describe('i18n script transform', () => {
    const keys = new Set(['Features', 'Saved features, events, and devices', 'mile']);

    it('wraps UI properties that have a translation', () => {
        const out = rewriteScript(`const m = { label: 'Features', description: "Saved features, events, and devices", key: 'Features' };`, keys);
        expect(out).toContain(`label: __cloudtak_tr('Features')`);
        expect(out).toContain(`description: __cloudtak_tr("Saved features, events, and devices")`);
        expect(out).toContain(`key: 'Features'`);
    });

    it('never touches lowercase identifiers or unknown strings', () => {
        expect(rewriteScript(`const p = { default: 'mile', label: 'Other' };`, keys)).toBeNull();
    });
});

describe('i18n script transform in the build pipeline', () => {
    afterEach(() => setLocale('en', { reload: false }));

    it('translates module-level option lists of real modules', async () => {
        setLocale('de', { reload: false });
        const { AFFILIATIONS } = await import('../utils/appearance.ts');
        const friendly = AFFILIATIONS.find((a) => a.code === 'f');
        expect(friendly?.label).toBe(de['Friendly' as keyof typeof de]);
        expect(friendly?.code).toBe('f');
    });
});
