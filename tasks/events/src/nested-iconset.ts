import path from 'node:path';
import { DataPackage } from '@tak-ps/node-cot';

/**
 * PzBat12: ATAK Data Packages may carry an Iconset as a nested zip
 * (ATAK installs it via ImportUserIconSetSort). CloudTAK used to hand such a
 * zip to the data transform, which rejects it as an unsupported format.
 *
 * Opens the nested zip and returns its iconset.xml together with the opened
 * package (needed to read the icon images), or null if the zip is not an
 * Iconset. The caller must destroy() the returned package.
 */
export async function openNestedIconset(raw: string): Promise<{ xml: string; pkg: DataPackage } | null> {
    const pkg = await DataPackage.parse(raw, {
        strict: false,
        cleanup: false,
    });

    const files = Array.from(await pkg.files());
    const index = files.find(file => path.parse(file).base.toLowerCase() === 'iconset.xml');

    if (!index) {
        await pkg.destroy();
        return null;
    }

    return {
        xml: (await pkg.getFileBuffer(index)).toString(),
        pkg,
    };
}
