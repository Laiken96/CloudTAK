/**
 * CoT Type to MIL-STD-2525C conversion as ATAK performs it, so a marker renders
 * from the very same 15 character symbol code on both clients.
 *
 * Port of `gov.tak.api.cot.CotUtils.mil2525cFromCotType` (ATAK-CIV 5.5.1.10,
 * takkernel/shared). ATAK draws the resulting code with the Mission Command
 * 2525C renderer (`armyc2.c2sd`), see utils/milsymbol.ts.
 */

/** Atom Types ATAK converts: `a-<affiliation>-<dimension>[-<function>...]` */
const COT_ATOM_TYPE = /^a-[a-z](-[A-Za-z0-9])+$/;

/** True for a CoT Atom Type that ATAK draws as a 2525C symbol */
export function isCotAtomType(type: unknown): type is string {
    return typeof type === 'string' && COT_ATOM_TYPE.test(type);
}

/**
 * The lower case 15 character 2525C symbol code for a CoT Atom Type,
 * e.g. `a-f-G-U-C-A` -> `sfgpuca--------`
 */
export function mil2525cFromCotType(type: string): string | undefined {
    if (!isCotAtomType(type)) return undefined;

    let code: string;
    switch (type.charAt(2)) {
        case 'f':
        case 'a':
            code = 'sf';
            break;
        case 'n':
            code = 'sn';
            break;
        case 's':
        case 'j':
        case 'k':
        case 'h':
            code = 'sh';
            break;
        case 'u':
        default:
            code = 'su';
            break;
    }

    for (let x = 4; x < type.length; x += 2) {
        code += type.charAt(x).toLowerCase();
        // Status (present) follows the battle dimension
        if (x === 4) code += 'p';
    }

    while (code.length < 15) {
        // Ground installations carry an 'h' in the first modifier position
        if (code.length === 10 && code.charAt(2) === 'g' && code.charAt(4) === 'i') {
            code += 'h';
        } else {
            code += '-';
        }
    }

    return code.slice(0, 15);
}

/**
 * The code of the next more general symbol, or undefined at the battle dimension.
 *
 * ATAK falls back to the parent CoT Type when the renderer has no symbol for a
 * code (`a-f-G-U-C-X-Y` -> `a-f-G-U-C-X`), which is the same as blanking the
 * last character of the function ID (positions 5-10).
 */
export function parent2525c(code: string): string | undefined {
    const chars = code.split('');

    for (let i = 9; i >= 4; i--) {
        if (chars[i] !== '-') {
            chars[i] = '-';
            // The installation modifier only exists alongside a function ID
            if (i === 4 && chars[10]?.toLowerCase() === 'h') chars[10] = '-';
            return chars.join('');
        }
    }

    return undefined;
}
