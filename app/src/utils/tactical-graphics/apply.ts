/**
 * Feature properties of a tactical graphic: our `chsig` detail, the style
 * every TAK client understands (colour, dashed when planned, label) and the
 * 2525C graphic for ATAK where there is an equivalent
 */
import type { Feature } from '../../types.ts';
import { CHSIG_PROPERTY, chsigOf, type TacticalModel } from './model.ts';
import { type CatalogEntry, colorOf, sidcOf, callsignOf } from './catalog.ts';

export interface MilsymProperty {
    id: string;
    /** `<unitmodifier code="T">…</unitmodifier>` children in xml-js compact form */
    unitmodifier?: Array<{ _attributes: { code: string }; _text: string }>;
}

export function milsymOf(entry: CatalogEntry, model: TacticalModel): MilsymProperty | undefined {
    const id = sidcOf(entry, model);
    if (!id) return undefined;

    const modifiers: MilsymProperty['unitmodifier'] = [];
    if (model.t) modifiers.push({ _attributes: { code: 'T' }, _text: model.t });
    if (model.t1 && entry.sig === 'boundary') modifiers.push({ _attributes: { code: 'T1' }, _text: model.t1 });

    return modifiers.length ? { id, unitmodifier: modifiers } : { id };
}

/**
 * Properties to merge into a Feature (new or edited) for the given model.
 * `previous` are the Feature's current properties, to keep foreign `chsig`
 * attributes and a callsign the user typed
 */
export function tacticalProperties(
    entry: CatalogEntry,
    model: TacticalModel,
    previous: Record<string, unknown> = {}
): Feature['properties'] {
    const color = colorOf(entry, model);

    const properties: Record<string, unknown> = {
        [CHSIG_PROPERTY]: chsigOf(model, previous[CHSIG_PROPERTY]),
        callsign: callsignOf(entry, model),
        stroke: color,
        'stroke-opacity': 1,
        'stroke-style': model.planned || entry.sig === 'assigned-area' ? 'dashed' : 'solid',
        labels: true,
    };

    if (typeof previous['stroke-width'] !== 'number') properties['stroke-width'] = 3;

    if (entry.draw === 'area') {
        properties.fill = color;
        properties['fill-opacity'] = entry.fillOpacity ?? 0;
    }

    const milsym = milsymOf(entry, model);
    if (milsym) properties.milsym = milsym;

    return properties as Feature['properties'];
}
