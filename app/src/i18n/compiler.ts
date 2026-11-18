/**
 * Build-time template transform: static UI text in Vue templates becomes a
 * `$tr('English text')` lookup, but only for strings that have an entry in
 * the dictionary. Everything else compiles exactly as before.
 *
 * Registered in vite.config.ts via `template.compilerOptions.nodeTransforms`,
 * so it also covers the @tak-ps/vue-tabler components, which ship as .vue
 * sources.
 */
import {
    NodeTypes,
    createCompoundExpression,
    createSimpleExpression,
    type AttributeNode,
    type DirectiveNode,
    type ElementNode,
    type InterpolationNode,
    type NodeTransform,
    type ParentNode,
} from '@vue/compiler-core';
import { OPT_OUT_ATTR, SKIP_TAGS, TRANSLATABLE_ATTRS, normalizeKey } from './rules.ts';

function lookup(key: string): string {
    // `_ctx` is the render context in both the inline (<script setup>) and the
    // regular render function, and exposes app.config.globalProperties.$tr.
    return `_ctx.$tr(${JSON.stringify(key)})`;
}

function hasStaticAttr(el: ElementNode, name: string): boolean {
    return el.props.some((p) => {
        if (p.type === NodeTypes.ATTRIBUTE) return p.name === name;
        if (p.type === NodeTypes.DIRECTIVE && p.name === 'bind' && p.arg && p.arg.type === NodeTypes.SIMPLE_EXPRESSION) {
            return p.arg.content === name;
        }
        return false;
    });
}

// v-pre content is shown verbatim
function isVPre(el: ElementNode): boolean {
    return el.props.some((p) => (p.type === NodeTypes.DIRECTIVE && p.name === 'pre')
        || (p.type === NodeTypes.ATTRIBUTE && p.name === 'v-pre'));
}

function isSkipped(parent: ParentNode | null): boolean {
    if (!parent || parent.type !== NodeTypes.ELEMENT) return false;
    if (SKIP_TAGS.has(parent.tag)) return true;
    // <option>Text</option> without a value uses its text as the value.
    if (parent.tag === 'option' && !hasStaticAttr(parent, 'value')) return true;
    return false;
}

/**
 * `<option :value='x'>` shows a value whose stored form must stay as is; only
 * its displayed text is translated, via $trv (value names, then UI strings).
 */
function isValueOption(el: ParentNode | null): boolean {
    return Boolean(el && el.type === NodeTypes.ELEMENT && el.tag === 'option' && el.props.some((p) => {
        return p.type === NodeTypes.DIRECTIVE && p.name === 'bind'
            && p.arg?.type === NodeTypes.SIMPLE_EXPRESSION && p.arg.content === 'value';
    }));
}

function displayValue(exp: InterpolationNode['content']): InterpolationNode['content'] {
    return createCompoundExpression(['_ctx.$trv(', exp, ')']);
}

/**
 * True when an expression's source contains a quoted string with a
 * translation, e.g. `{{ editing ? 'Save' : 'Create' }}`. Its result is then
 * translated for display.
 */
export function hasTranslatableLiteral(source: string, keys: Set<string>): boolean {
    for (const m of source.matchAll(STRING_LITERAL)) {
        if (keys.has(m[2])) return true;
    }
    return false;
}

export const STRING_LITERAL = /(['"`])((?:(?!\1)[^\\\n$]|\\.)*?)\1/g;

function fileName(filename: string | undefined): string {
    return (filename ?? '').split(/[\\/]/).pop() ?? '';
}

export function createI18nTransform(
    dictionary: Record<string, string>,
    valueDictionary: Record<string, string> = {},
): NodeTransform {
    const keys = new Set(Object.keys(dictionary));
    const displayKeys = new Set([...keys, ...Object.keys(valueDictionary)]);
    const optedOut = new WeakSet<object>();

    // `Delete.vue::Type` overrides `Type` in that file only
    const resolve = (file: string, key: string): string | null => {
        const scoped = `${file}::${key}`;
        if (keys.has(scoped)) return scoped;
        return keys.has(key) ? key : null;
    };

    return (node, context) => {
        const parent = context.parent;
        if (parent && optedOut.has(parent)) {
            optedOut.add(node);
            return;
        }

        const file = fileName(context.filename);

        // {{ option }} inside <option :value='option'>, or an expression
        // with a translatable string literal
        if (node.type === NodeTypes.INTERPOLATION) {
            if (isValueOption(parent) || hasTranslatableLiteral(node.loc.source, displayKeys)) {
                node.content = displayValue(node.content);
            }
            return;
        }

        if (node.type === NodeTypes.ELEMENT) {
            const option = isValueOption(node);
            for (const prop of node.props) {
                if (prop.type !== NodeTypes.DIRECTIVE || !prop.exp) continue;

                // <option :value='option' v-text='option' /> (TablerEnum), v-text='a ? "Yes" : "No"'
                if (prop.name === 'text' && (option || hasTranslatableLiteral(prop.exp.loc.source, displayKeys))) {
                    prop.exp = displayValue(prop.exp);
                }

                // :label='editing ? "Save" : "Create"'
                if (prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION
                    && TRANSLATABLE_ATTRS.has(prop.arg.content)
                    && hasTranslatableLiteral(prop.exp.loc.source, displayKeys)) {
                    prop.exp = displayValue(prop.exp);
                }
            }
        }

        if (node.type === NodeTypes.TEXT) {
            if (isSkipped(parent)) return;

            const key = resolve(file, normalizeKey(node.content));
            if (!key) return;

            let exp = lookup(key);
            if (/^\s/.test(node.content)) exp = `" " + ${exp}`;
            if (/\s$/.test(node.content)) exp = `${exp} + " "`;

            const interpolation: InterpolationNode = {
                type: NodeTypes.INTERPOLATION,
                content: createSimpleExpression(exp, false, node.loc),
                loc: node.loc,
            };
            context.replaceNode(interpolation);
            return;
        }

        if (node.type !== NodeTypes.ELEMENT) return;

        if (hasStaticAttr(node, OPT_OUT_ATTR) || isVPre(node)) {
            optedOut.add(node);
            return;
        }

        node.props = node.props.map((prop): AttributeNode | DirectiveNode => {
            if (prop.type !== NodeTypes.ATTRIBUTE || !prop.value || !TRANSLATABLE_ATTRS.has(prop.name)) return prop;

            const key = resolve(file, normalizeKey(prop.value.content));
            if (!key) return prop;

            const directive: DirectiveNode = {
                type: NodeTypes.DIRECTIVE,
                name: 'bind',
                rawName: `:${prop.name}`,
                arg: createSimpleExpression(prop.name, true, prop.nameLoc),
                exp: createSimpleExpression(lookup(key), false, prop.value.loc),
                modifiers: [],
                loc: prop.loc,
            };
            return directive;
        });
    };
}
