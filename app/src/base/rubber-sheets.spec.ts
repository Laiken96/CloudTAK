import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { db } from '../database.ts';
import RubberSheets, { safeFileName } from './rubber-sheets.ts';
import { groundOverlayKml, placeImage, rotateQuad } from '../utils/rubbersheet.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const QUAD = rotateQuad(placeImage(640, 480, [7.0536, 47.4508], 800), 10);

function png(): Blob {
    return new Blob([PNG], { type: 'image/png' });
}

async function bytes(blob: Blob): Promise<number[]> {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe('RubberSheets', () => {
    beforeEach(async () => {
        await db.rubber_sheet.clear();
        RubberSheets.state.loaded = false;
        RubberSheets.state.sheets = [];

        // jsdom cannot decode images, and its Blob has no arrayBuffer()
        vi.stubGlobal('createImageBitmap', async () => ({ width: 640, height: 480, close: () => undefined }));
        vi.stubGlobal('Blob', NodeBlob);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps a sheet with its image on this device', async () => {
        const sheet = await RubberSheets.add({ name: ' Lageskizze FURY ', image: png(), width: 640, height: 480, corners: QUAD });

        expect(sheet).toMatchObject({ name: 'Lageskizze FURY', visible: true, opacity: 0.8, width: 640, height: 480 });

        RubberSheets.state.loaded = false;
        expect(await RubberSheets.load()).toEqual([sheet]);
        expect(await bytes(await RubberSheets.image(sheet.id) as Blob)).toEqual(Array.from(PNG));
    });

    it('changes and removes a sheet', async () => {
        const sheet = await RubberSheets.add({ name: 'A', image: png(), width: 640, height: 480, corners: QUAD });

        // Corners taken from the reactive state, as the menu does
        await RubberSheets.update(sheet.id, { corners: rotateQuad(RubberSheets.get(sheet.id)!.corners, 5) });
        await RubberSheets.update(sheet.id, { corners: RubberSheets.get(sheet.id)!.corners });

        await RubberSheets.update(sheet.id, { opacity: 2, visible: false, name: '' });
        expect(RubberSheets.get(sheet.id)).toMatchObject({ opacity: 1, visible: false, name: 'Rubber Sheet' });
        expect(await db.rubber_sheet.get(sheet.id)).toMatchObject({ opacity: 1, visible: false });

        await expect(RubberSheets.update(sheet.id, { corners: [] as never })).rejects.toThrow('four corners');

        await RubberSheets.remove(sheet.id);
        expect(RubberSheets.state.sheets).toEqual([]);
        expect(await db.rubber_sheet.count()).toEqual(0);
    });

    it('exports an ATAK style KMZ', async () => {
        const sheet = await RubberSheets.add({ name: 'Lageskizze FÜRY 2', image: png(), width: 640, height: 480, corners: QUAD });

        const { name, kmz } = await RubberSheets.exportKmz(sheet.id);
        expect(name).toEqual('Lageskizze-FURY-2.kmz');

        const files = unzipSync(new Uint8Array(await kmz.arrayBuffer()));
        expect(Object.keys(files).sort()).toEqual(['Lageskizze-FURY-2.png', 'doc.kml']);
        expect(strFromU8(files['doc.kml'])).toContain('<href>Lageskizze-FURY-2.png</href>');
        expect(Array.from(files['Lageskizze-FURY-2.png'])).toEqual(Array.from(PNG));
    });

    it('imports the KMZ again with the same corners', async () => {
        const sheet = await RubberSheets.add({ name: 'Skizze', image: png(), width: 640, height: 480, corners: QUAD });
        const { kmz } = await RubberSheets.exportKmz(sheet.id);

        const [imported] = await RubberSheets.importKmz(kmz);
        expect(imported).toMatchObject({ name: 'Skizze', corners: QUAD, width: 640, height: 480 });
        expect(await bytes(await RubberSheets.image(imported.id) as Blob)).toEqual(Array.from(PNG));
    });

    it('finds the image of a KMZ in a sub folder', async () => {
        const kmz = zipSync({
            'overlay/doc.kml': strToU8(groundOverlayKml('Scan', 'files/scan.png', QUAD)),
            'overlay/files/scan.png': PNG
        });

        const [imported] = await RubberSheets.importKmz(new Blob([kmz]));
        expect(imported.name).toEqual('Scan');
    });

    it('explains a KMZ it cannot use', async () => {
        await expect(RubberSheets.importKmz(new Blob([zipSync({ 'a.txt': strToU8('x') })]))).rejects.toThrow('No KML document');
        await expect(RubberSheets.importKmz(new Blob([zipSync({ 'doc.kml': strToU8('<kml/>') })]))).rejects.toThrow('No ground overlay');
        await expect(RubberSheets.importKmz(new Blob([zipSync({ 'doc.kml': strToU8(groundOverlayKml('x', 'gone.png', QUAD)) })]))).rejects.toThrow('missing');
    });

    it('makes safe file names', () => {
        expect(safeFileName('Lageskizze FÜRY / Kp 2.png')).toEqual('Lageskizze-FURY-Kp-2');
        expect(safeFileName('***')).toEqual('rubber-sheet');
    });
});
