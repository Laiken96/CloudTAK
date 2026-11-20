/**
 * PzBat12: re-importing an Iconset that already exists on the server.
 *
 * Upstream CloudTAK refuses an Iconset whose UID exists and only logs it, so
 * a newer version of an Iconset (same UID, higher version - this is how ATAK
 * updates an Iconset) could never be installed, and a second user importing
 * the same Data Package from the TAK Server got nothing without being told.
 */

/** Thrown for problems the user has to see, the Iconset import does not swallow them */
export class IconsetImportError extends Error {}

/**
 * - create: no Iconset with this UID
 * - update: same UID, older version installed, update it in place
 * - installed: same UID, same or newer version installed, nothing to do
 * - foreign: same UID exists but belongs to someone else
 */
export type IconsetAction = 'create' | 'update' | 'installed' | 'foreign';

/**
 * @param status          HTTP status of GET /api/iconset/:uid as the importing user
 * @param installed       version of the installed Iconset (status 200 only)
 * @param incoming        version of the Iconset being imported
 */
export function iconsetAction(status: number, installed: number | undefined, incoming: number): IconsetAction {
    if (status === 404) return 'create';
    if (status !== 200) return 'foreign';
    if (installed === undefined || incoming > installed) return 'update';
    return 'installed';
}

export interface InstalledIcon {
    id: number;
    /** Name in the Iconset without extension, e.g. "Waffen/Panzerabwehrlenkwaffe" */
    name: string;
    data: string;
    type2525b: string | null;
}

export interface IncomingIcon {
    /** File in the package, e.g. "Waffen/Panzerabwehrlenkwaffe.png" */
    file: string;
    /** data: URL */
    data: string;
    type2525b: string | null;
}

export interface IconSyncPlan {
    create: IncomingIcon[];
    patch: Array<{ id: number; icon: IncomingIcon }>;
}

/** Icon name as the API stores it: file path without the extension */
export function iconName(file: string): string {
    const dot = file.lastIndexOf('.');
    const slash = file.lastIndexOf('/');
    return dot > slash ? file.slice(0, dot) : file;
}

/**
 * Which icons to add and which to replace. Unchanged icons are skipped (every
 * change makes the API rebuild the sprite sheet). Icons that are no longer in
 * the package are kept: markers placed with them keep their icon.
 */
export function planIconSync(installed: InstalledIcon[], incoming: IncomingIcon[]): IconSyncPlan {
    const byName = new Map(installed.map(icon => [icon.name, icon]));
    const plan: IconSyncPlan = { create: [], patch: [] };

    for (const icon of incoming) {
        const existing = byName.get(iconName(icon.file));

        if (!existing) {
            plan.create.push(icon);
        } else if (existing.data !== icon.data || (existing.type2525b || null) !== (icon.type2525b || null)) {
            plan.patch.push({ id: existing.id, icon });
        }
    }

    return plan;
}
