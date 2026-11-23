/**
 * Which files attached to a mission are read onto the map, and their limits -
 * apart from the readers (utils/mission-file-parser.ts) so the file list and
 * the worker do not load them.
 */

export type MissionFileKind = 'cot' | 'kml' | 'kmz' | 'package';

/** Files above this size are not loaded onto the map */
export const MISSION_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** Uncompressed size of the entries read from a zip - guards against zip bombs */
export const MISSION_FILE_MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

export type MissionFileErrorReason = 'too-large' | 'invalid';

/** The file cannot be put on the map; the reason is shown to the user */
export class MissionFileError extends Error {
    reason: MissionFileErrorReason;

    constructor(reason: MissionFileErrorReason, message?: string) {
        super(message ?? reason);
        this.reason = reason;
    }
}

const MIME_KINDS: Record<string, MissionFileKind> = {
    'application/vnd.google-earth.kml+xml': 'kml',
    'application/vnd.google-earth.kmz': 'kmz',
    'application/zip': 'package',
    'application/x-zip-compressed': 'package',
};

/**
 * The kind of map file by name, or by MIME type for a name without
 * extension; null for anything that is not read onto the map (photos,
 * documents, ...)
 */
export function missionFileKind(name: string, mimeType?: string): MissionFileKind | null {
    const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase();

    if (ext === 'cot' || ext === 'xml') return 'cot';
    if (ext === 'kml') return 'kml';
    if (ext === 'kmz') return 'kmz';
    if (ext === 'zip' || ext === 'dpk') return 'package';
    if (ext) return null;

    return (mimeType && MIME_KINDS[mimeType.toLowerCase()]) || null;
}
