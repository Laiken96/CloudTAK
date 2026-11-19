import fs from 'node:fs';
import path from 'node:path';

/**
 * Made-up export of the Einheitsfeuerplan V1.5 (unit, action and targets are
 * invented): grid 20 x 12 cells of 250 m, targets Z01 B1/9, Z02 L7/5,
 * Z03 D2/6 and Z05 outside the grid. Written by the export of the
 * Einheitsfeuerplan itself (`atakPackage` in its src/04_core.js).
 */
export function efpFixture(): Uint8Array {
    return new Uint8Array(fs.readFileSync(path.resolve(__dirname, 'efp-paket-v1.5.zip')));
}

export const EFP_FIXTURE_UID = 'EFP-MERKUR-Inf-Kp-10-1-v2611190830';
