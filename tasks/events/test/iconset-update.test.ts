import test from 'node:test';
import assert from 'node:assert';
import { iconName, iconsetAction, planIconSync } from '../src/iconset-update.js';

test('iconsetAction creates an unknown Iconset', () => {
    assert.strictEqual(iconsetAction(404, undefined, 1), 'create');
});

test('iconsetAction updates when the imported version is higher', () => {
    assert.strictEqual(iconsetAction(200, 1, 2), 'update');
});

test('iconsetAction leaves the same or a newer installed version alone', () => {
    assert.strictEqual(iconsetAction(200, 2, 2), 'installed');
    assert.strictEqual(iconsetAction(200, 3, 2), 'installed');
});

test('iconsetAction reports an Iconset that belongs to someone else', () => {
    // GET /api/iconset/:uid answers 400 for a private Iconset of another user
    assert.strictEqual(iconsetAction(400, undefined, 2), 'foreign');
    assert.strictEqual(iconsetAction(403, undefined, 2), 'foreign');
});

test('iconName drops the extension but keeps the folder', () => {
    assert.strictEqual(iconName('Waffen/Minenwerfer.png'), 'Waffen/Minenwerfer');
    assert.strictEqual(iconName('Gepanzerte Fahrzeuge/Kampfpanzer 87 Leopard.svg'), 'Gepanzerte Fahrzeuge/Kampfpanzer 87 Leopard');
    assert.strictEqual(iconName('Ordner.v2/ohne-endung'), 'Ordner.v2/ohne-endung');
});

test('planIconSync adds new icons, replaces changed ones and skips unchanged ones', () => {
    const plan = planIconSync([
        { id: 1, name: 'Waffen/Minenwerfer', data: 'data:image/png;base64,AAA', type2525b: null },
        { id: 2, name: 'Waffen/Maschinengewehr', data: 'data:image/png;base64,BBB', type2525b: null },
        { id: 3, name: 'Posten/Wache', data: 'data:image/png;base64,CCC', type2525b: 'a-f-G' },
        { id: 4, name: 'Alt/Entfernt', data: 'data:image/png;base64,DDD', type2525b: null },
    ], [
        { file: 'Waffen/Minenwerfer.png', data: 'data:image/png;base64,AAA', type2525b: null },
        { file: 'Waffen/Maschinengewehr.png', data: 'data:image/png;base64,NEU', type2525b: null },
        { file: 'Posten/Wache.png', data: 'data:image/png;base64,CCC', type2525b: null },
        { file: 'Lage/Brand.png', data: 'data:image/png;base64,EEE', type2525b: null },
    ]);

    assert.deepStrictEqual(plan.create.map(icon => icon.file), ['Lage/Brand.png']);
    assert.deepStrictEqual(plan.patch.map(entry => entry.id), [2, 3]);
    // icons missing from the package are kept, markers may still use them
    assert.ok(!plan.patch.some(entry => entry.id === 4));
});

test('planIconSync on an empty installation creates everything', () => {
    const plan = planIconSync([], [
        { file: 'A/b.png', data: 'data:image/png;base64,AAA', type2525b: null },
    ]);

    assert.strictEqual(plan.create.length, 1);
    assert.strictEqual(plan.patch.length, 0);
});
