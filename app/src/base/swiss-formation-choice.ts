import { reactive } from 'vue';
import { NO_ECHELON, type SwissChoice } from '../utils/swiss-formations.ts';

/**
 * What the signature picker remembers: which part was used last (Swiss
 * formations or all signatures, per device) and the last Swiss formation
 * choice (for this page) - placing several units in a row takes few taps.
 */

export type SignatureSource = 'swiss' | 'all';

export const SIGNATURE_SOURCE_KEY = 'cloudtak-signature-picker-source';

export function preferredSignatureSource(): SignatureSource {
    try {
        return globalThis.localStorage?.getItem(SIGNATURE_SOURCE_KEY) === 'swiss' ? 'swiss' : 'all';
    } catch {
        return 'all';
    }
}

export function setPreferredSignatureSource(source: SignatureSource): void {
    try {
        globalThis.localStorage?.setItem(SIGNATURE_SOURCE_KEY, source);
    } catch {
        // Storage blocked: the choice lasts for this page only
    }
}

export interface SwissFormationDraft extends Required<Pick<SwissChoice, 'affiliation' | 'context' | 'echelon' | 'headquarters' | 'taskForce'>> {
    /** Id of the chosen formation */
    formation?: string;
    term?: string;
}

export function emptySwissDraft(): SwissFormationDraft {
    return {
        formation: undefined,
        affiliation: 'f',
        context: '0',
        echelon: NO_ECHELON,
        term: undefined,
        headquarters: false,
        taskForce: false,
    };
}

/** The last choice, kept while the page is open */
export const lastSwissDraft = reactive<SwissFormationDraft>(emptySwissDraft());

export function rememberSwissDraft(draft: SwissFormationDraft): void {
    Object.assign(lastSwissDraft, { ...draft });
}
