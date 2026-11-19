import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { EfpPackageError, efpTargetFeature, fireGridFromText, readEfpPackage } from './efp-package.ts';
import { cellAt, designation } from './fire-grid.ts';
import { EFP_FIXTURE_UID as PACKAGE_UID, efpFixture } from '../test/fixtures/efp-fixture.ts';

/** The fixture as an Einheitsfeuerplan V1.4 export: targets only, no grid */
function withoutGrid(): Uint8Array {
    const files = unzipSync(efpFixture());
    const kept: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(files)) {
        if (!name.includes('-Raster')) kept[name] = data;
    }
    const manifest = strFromU8(files['MANIFEST/manifest.xml'])
        .replace(/ {4}<Content zipEntry="[^"]*-Raster[^"]*" ignore="false">\n.*\n {4}<\/Content>\n/g, '');
    kept['MANIFEST/manifest.xml'] = strToU8(manifest);
    return zipSync(kept);
}

function manifest(uid: string, entries: string[] = []): Uint8Array {
    return strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<MissionPackageManifest version="2">
  <Configuration>
    <Parameter name="name" value="Foreign" />
    <Parameter name="uid" value="${uid}" />
  </Configuration>
  <Contents>${entries.map((e) => `<Content zipEntry="${e}" ignore="false"><Parameter name="uid" value="x" /></Content>`).join('')}</Contents>
</MissionPackageManifest>`);
}

describe('readEfpPackage', () => {
    it('reads the grid of the Einheitsfeuerplan', () => {
        const pkg = readEfpPackage(efpFixture());

        expect(pkg.name).toEqual('atak_paket_Inf-Kp-10-1_MERKUR_2026-11-19');
        expect(pkg.uid).toEqual(PACKAGE_UID);
        expect(pkg.grid).toEqual({
            uid: `${PACKAGE_UID}-Raster`,
            name: 'EFP MERKUR Inf Kp 10/1',
            e0: 2570000,
            n0: 1256000,
            z: 250,
            ncols: 20,
            nrows: 12
        });
    });

    it('reads every target, but none of the drawn grid objects', () => {
        const pkg = readEfpPackage(efpFixture());

        expect(pkg.targets.map((t) => [t.uid, t.callsign])).toEqual([
            [`${PACKAGE_UID}-Z01`, 'Z01 B1/9'],
            [`${PACKAGE_UID}-Z02`, 'Z02 L7/5'],
            [`${PACKAGE_UID}-Z03`, 'Z03 D2/6'],
            [`${PACKAGE_UID}-Z05`, 'Z05'],
        ]);

        const z03 = pkg.targets[2];
        expect(z03.remarks).toMatch(/^#MERKUR Z03 D2\/6 Brücke Nord · Delta Two Six · 32T /);
        expect(z03.color).toEqual('#FFD60A');
        expect(z03.opacity).toEqual(1);
        expect(z03.time).toEqual('2026-11-19T08:30:00.000Z');
        expect(z03.stale).toEqual('2027-11-19T08:30:00.000Z');

        // Free text comes back unescaped
        expect(pkg.targets[1].remarks).toContain('Kreuzung "Mitte" <A&B>');
    });

    it('places each target in the cell the Einheitsfeuerplan names', () => {
        const pkg = readEfpPackage(efpFixture());
        const grid = pkg.grid!;

        for (const t of pkg.targets) {
            const cell = cellAt(grid, t.lng, t.lat);
            const named = t.callsign.split(' ')[1];
            expect(cell ? designation(cell) : undefined).toEqual(named);
        }

        expect(cellAt(grid, pkg.targets[2].lng, pkg.targets[2].lat)).toEqual({ i: 4, j: 2, k: 6 });
    });

    it('reads an export before V1.5 as targets without a grid', () => {
        const pkg = readEfpPackage(withoutGrid());

        expect(pkg.grid).toBeNull();
        expect(pkg.targets).toHaveLength(4);
    });

    it('explains files that are no Einheitsfeuerplan package', () => {
        const error = (data: Uint8Array): string => {
            try {
                readEfpPackage(data);
            } catch (err) {
                expect(err).toBeInstanceOf(EfpPackageError);
                return (err as Error).message;
            }
            throw new Error('no error');
        };

        expect(error(new Uint8Array(0))).toEqual('The file is not a ZIP file or it is damaged');
        expect(error(strToU8('not a zip at all'))).toEqual('The file is not a ZIP file or it is damaged');
        expect(error(efpFixture().slice(0, 4000))).toEqual('The file is not a ZIP file or it is damaged');

        expect(error(zipSync({ 'doc.kml': strToU8('<kml/>') })))
            .toEqual('The file is not a data package: MANIFEST/manifest.xml is missing');
        expect(error(zipSync({ 'MANIFEST/manifest.xml': strToU8('<MissionPackageManifest') })))
            .toEqual('The manifest of the data package cannot be read');

        expect(error(zipSync({ 'MANIFEST/manifest.xml': manifest('FURY-v3-1234') })))
            .toEqual('The data package does not come from the Einheitsfeuerplan. Import it as a data package instead.');
        expect(error(zipSync({ 'MANIFEST/manifest.xml': manifest(PACKAGE_UID, ['missing/missing.cot']) })))
            .toEqual('The data package holds neither a grid nor targets');
    });
});

describe('efpTargetFeature', () => {
    it('makes a kept map marker with the UID of the Einheitsfeuerplan', () => {
        const pkg = readEfpPackage(efpFixture());
        const t = pkg.targets[2];

        expect(efpTargetFeature(pkg, t)).toEqual({
            id: t.uid,
            type: 'Feature',
            path: '/atak_paket_Inf-Kp-10-1_MERKUR_2026-11-19/',
            properties: {
                id: t.uid,
                type: 'b-m-p-s-m',
                how: 'h-g-i-g-o',
                archived: true,
                callsign: 'Z03 D2/6',
                remarks: t.remarks,
                'marker-color': '#FFD60A',
                'marker-opacity': 1,
                time: t.time,
                start: t.start,
                stale: t.stale,
                center: [t.lng, t.lat]
            },
            geometry: { type: 'Point', coordinates: [t.lng, t.lat] }
        });
    });
});

describe('fireGridFromText', () => {
    const P = { e0: 2570000, n0: 1256000, z: 250, ncols: 20, nrows: 12 };

    it('reads the grid from the remarks of the drawn frame', () => {
        expect(fireGridFromText('#MERKUR EFP MERKUR Inf Kp 10/1 · Raster 20 x 12 Zellen à 250 m · Raster-Link e0=2570000&n0=1256000&z=250&c=20&r=12')).toEqual(P);
    });

    it('reads a pasted Einheitsfeuerplan link', () => {
        expect(fireGridFromText('see file:///C:/EFP/index.html#e0=2570000&n0=1256000&z=250&c=20&r=12 for the grid')).toEqual(P);
    });

    it('ignores texts without a complete, valid grid', () => {
        expect(fireGridFromText(undefined)).toBeNull();
        expect(fireGridFromText('#MERKUR Z03 D2/6 Brücke Nord')).toBeNull();
        expect(fireGridFromText('e0=2570000&n0=1256000&z=250&c=20')).toBeNull();
        expect(fireGridFromText('e0=2570000&n0=1256000&z=300&c=20&r=12')).toBeNull();
    });
});
