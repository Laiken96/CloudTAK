import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Iconset } from '@tak-ps/node-cot';
import { openNestedIconset } from '../src/nested-iconset.js';

// openNestedIconset works on a copy, like the extracted content of a Data Package
function copyFixture(name: string): string {
    const dir = fs.mkdtempSync(path.resolve(os.tmpdir(), 'nested-iconset-'));
    const raw = path.resolve(dir, path.basename(name));
    fs.copyFileSync(new URL(`./fixtures/${name}`, import.meta.url), raw);
    return raw;
}

test('openNestedIconset finds the iconset.xml and the icons of a nested Iconset zip', async () => {
    const raw = copyFixture('iconsets/OSM.zip');
    const nested = await openNestedIconset(raw);

    assert.ok(nested, 'Iconset zip is recognized');

    try {
        const iconset = await Iconset.parse(nested.xml);
        assert.ok(iconset.uid, 'iconset.xml parses');

        // processIconset looks the icon images up in the returned package
        const files = Array.from(await nested.pkg.files());
        assert.ok(files.includes('Leisure/music.png'), 'icon images are readable');
        assert.ok((await nested.pkg.getFileBuffer('Leisure/music.png')).length > 0);
    } finally {
        await nested.pkg.destroy();
    }

    assert.ok(fs.existsSync(raw), 'the nested zip itself is left for the caller');
});

test('openNestedIconset returns null for a zip that is not an Iconset', async () => {
    const raw = copyFixture('shapefile/mesa_points.zip');

    assert.strictEqual(await openNestedIconset(raw), null);
});
