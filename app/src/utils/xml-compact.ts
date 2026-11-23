/**
 * XML to the "compact" object tree of xml-js (`xml2js(xml, { compact: true })`),
 * read with the browser's DOMParser.
 *
 * node-cot works on that tree (`CoT.raw`). Its own XML reader pulls in Node
 * modules (fs, path, protobuf files) and cannot run in the browser, so the
 * app builds the same tree from the DOM and hands it to node-cot's browser
 * safe parts (see utils/mission-file-parser.ts). The rules of xml-js compact
 * mode, as far as CoT needs them:
 *
 * - an element is an object, its attributes are strings in `_attributes`
 * - a child element is a property named after the element; a name that occurs
 *   more than once becomes an array in document order
 * - text is `_text` (whitespace-only text between elements is dropped, other
 *   text is kept untrimmed), CDATA is `_cdata`, comments are `_comment`
 * - an empty element is `{}`
 *
 * DOMParser is not available in web workers - this runs on the main thread.
 */

export type CompactElement = {
    _attributes?: Record<string, string | boolean>;
    [name: string]: unknown;
};

/** The XML is not well-formed */
export class XmlParseError extends Error {}

function add(target: Record<string, unknown>, key: string, value: unknown): void {
    const existing = target[key];

    if (existing === undefined) {
        target[key] = value;
    } else if (Array.isArray(existing)) {
        existing.push(value);
    } else {
        target[key] = [existing, value];
    }
}

export function elementToCompact(el: Element): CompactElement {
    const out: CompactElement = {};

    if (el.attributes.length) {
        const attributes: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
            attributes[attr.name] = attr.value;
        }
        out._attributes = attributes;
    }

    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 1) {
            add(out, (node as Element).nodeName, elementToCompact(node as Element));
        } else if (node.nodeType === 3) {
            const text = node.nodeValue ?? '';
            if (text.trim()) add(out, '_text', text);
        } else if (node.nodeType === 4) {
            add(out, '_cdata', node.nodeValue ?? '');
        } else if (node.nodeType === 8) {
            add(out, '_comment', node.nodeValue ?? '');
        }
    }

    return out;
}

/**
 * Parse an XML document, throwing XmlParseError when it is not well-formed
 */
export function parseXmlDocument(xml: string): Document {
    let doc: Document;
    try {
        doc = new DOMParser().parseFromString(xml, 'application/xml');
    } catch (err) {
        throw new XmlParseError(err instanceof Error ? err.message : String(err));
    }

    // Browsers and jsdom report errors as a <parsererror> element instead of throwing
    const error = doc.getElementsByTagName('parsererror')[0]
        ?? doc.getElementsByTagNameNS('*', 'parsererror')[0];

    if (error || !doc.documentElement) {
        throw new XmlParseError(error?.textContent?.trim() || 'XML is not well-formed');
    }

    return doc;
}

/**
 * The compact tree of a whole document: `{ <root name>: <root element> }`
 */
export function xmlToCompact(xml: string): Record<string, CompactElement> {
    const root = parseXmlDocument(xml).documentElement;

    return { [root.nodeName]: elementToCompact(root) };
}

/**
 * node-cot's normalizeBooleanAttributeValues: attribute values `true` and
 * `false` (any case) become booleans, as CoTParser.from_xml does before
 * converting
 */
export function normalizeBooleanAttributes(input: unknown): void {
    if (Array.isArray(input)) {
        for (const value of input) normalizeBooleanAttributes(value);
        return;
    }

    if (!input || typeof input !== 'object') return;

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (key === '_attributes' && value && typeof value === 'object' && !Array.isArray(value)) {
            const attributes = value as Record<string, unknown>;

            for (const [name, attr] of Object.entries(attributes)) {
                if (typeof attr !== 'string') continue;

                const normalized = attr.toLowerCase();
                if (normalized === 'true') attributes[name] = true;
                else if (normalized === 'false') attributes[name] = false;
            }

            continue;
        }

        normalizeBooleanAttributes(value);
    }
}
