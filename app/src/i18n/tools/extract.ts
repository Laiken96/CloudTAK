/**
 * Lists the template strings the build-time transform can translate and
 * reports which ones are missing from a dictionary.
 *
 *   node src/i18n/tools/extract.ts                 # summary + missing de.json keys
 *   node src/i18n/tools/extract.ts --json out.json # all strings with their files
 *
 * Run from the app/ directory (Node >= 23, type stripping).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@vue/compiler-sfc';
import { NodeTypes, type ElementNode, type TemplateChildNode } from '@vue/compiler-core';
import { OPT_OUT_ATTR, SKIP_TAGS, TRANSLATABLE_ATTRS, isCandidate, normalizeKey } from '../rules.ts';
import { isScriptTarget, scriptStrings } from '../script-transform.ts';
import { STRING_LITERAL } from '../compiler.ts';

const APP = path.resolve(import.meta.dirname, '../../..');
const ROOTS = [
    path.join(APP, 'src'),
    path.join(APP, 'plugins'),
    path.join(APP, 'node_modules/@tak-ps/vue-tabler/components'),
];

function vueFiles(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '__harness__') continue;
            vueFiles(p, out);
        } else if (entry.name.endsWith('.vue')) {
            out.push(p);
        }
    }
    return out;
}

function hasAttr(el: ElementNode, name: string): boolean {
    return el.props.some((p) => (p.type === NodeTypes.ATTRIBUTE && p.name === name)
        || (p.type === NodeTypes.DIRECTIVE && p.name === 'bind' && p.arg?.type === NodeTypes.SIMPLE_EXPRESSION && p.arg.content === name));
}

const found = new Map<string, Set<string>>();

function add(key: string, file: string): void {
    if (!key || !isCandidate(key)) return;
    if (!found.has(key)) found.set(key, new Set());
    found.get(key)!.add(file);
}

// Quoted strings inside template expressions ({{ a ? 'Save' : 'Create' }})
function addLiterals(source: string, file: string): void {
    for (const m of source.matchAll(STRING_LITERAL)) add(m[2].trim(), `${file} (expr)`);
}

function visit(node: TemplateChildNode, parent: ElementNode | null, file: string): void {
    if (node.type === NodeTypes.INTERPOLATION) {
        if (node.content.type === NodeTypes.SIMPLE_EXPRESSION) addLiterals(node.content.content, file);
        return;
    }

    if (node.type === NodeTypes.TEXT) {
        if (parent && SKIP_TAGS.has(parent.tag)) return;
        if (parent && parent.tag === 'option' && !hasAttr(parent, 'value')) return;
        add(normalizeKey(node.content), file);
        return;
    }

    if (node.type !== NodeTypes.ELEMENT) return;
    if (hasAttr(node, OPT_OUT_ATTR) || hasAttr(node, 'v-pre')) return;

    for (const prop of node.props) {
        if (prop.type === NodeTypes.ATTRIBUTE && prop.value && TRANSLATABLE_ATTRS.has(prop.name)) {
            add(normalizeKey(prop.value.content), file);
        }
        if (prop.type === NodeTypes.DIRECTIVE && prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION) {
            const bound = prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && TRANSLATABLE_ATTRS.has(prop.arg.content);
            if (bound || prop.name === 'text') addLiterals(prop.exp.content, file);
        }
    }

    for (const child of node.children) visit(child, node, file);
}

for (const root of ROOTS) {
    for (const file of vueFiles(root)) {
        const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
        const ast = descriptor.template?.ast;
        if (!ast) continue;
        const rel = path.relative(APP, file).replace('node_modules/@tak-ps/', '');
        for (const child of ast.children) visit(child, null, rel);
    }
}

// Script strings (object properties such as label/title/description)
function scriptFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) scriptFiles(p, out);
        else if (isScriptTarget(p)) out.push(p);
    }
    return out;
}

let scriptCount = 0;
for (const file of scriptFiles(path.join(APP, 'src'))) {
    for (const text of scriptStrings(fs.readFileSync(file, 'utf8'), file.endsWith('.vue'))) {
        scriptCount++;
        add(text, `${path.relative(APP, file)} (script)`);
    }
}

const dictionary = JSON.parse(fs.readFileSync(path.join(APP, 'src/i18n/de.json'), 'utf8')) as Record<string, string>;
const missing = [...found.keys()].filter((key) => !(key in dictionary)).sort();
const unused = Object.keys(dictionary).filter((key) => !found.has(key));

const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex !== -1) {
    const out = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)).map(([k, files]) => [k, [...files]]));
    fs.writeFileSync(process.argv[jsonIndex + 1], JSON.stringify(out, null, 2));
}

console.log(`Strings:          ${found.size} (incl. ${scriptCount} script occurrences)`);
console.log(`Translated:       ${found.size - missing.length}`);
console.log(`Missing:          ${missing.length}`);
console.log(`Dictionary keys not found in templates (script strings or stale): ${unused.length}`);
if (process.argv.includes('--missing')) {
    for (const key of missing) console.log(`  ${key}`);
}
