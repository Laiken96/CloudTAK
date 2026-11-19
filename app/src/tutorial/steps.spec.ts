import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../base/profile.ts', () => ({ default: { get: vi.fn() } }));
vi.mock('../base/contact.ts', () => ({ default: {} }));
vi.mock('../base/chatroom.ts', () => ({ default: {} }));
vi.mock('../utils/capacitor.ts', () => ({ isNativePlatform: () => false }));

import MenuManager from '../stores/modules/menu.ts';
import { HELP_ENTRIES, TOUR_STEPS, resolveHelpEntry, tourStep } from './steps.ts';

const SRC = path.resolve(import.meta.dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) sources(p, out);
        else if (entry.name.endsWith('.vue') && !p.includes(`${path.sep}tutorial${path.sep}`)) out.push(p);
    }
    return out;
}

const componentSource = sources(SRC).map((file) => fs.readFileSync(file, 'utf8')).join('\n');

const baseMenu = new MenuManager({}).baseMenuItems;

describe('function overview', () => {
    it('explains every entry of the main menu', () => {
        const explained = new Set(HELP_ENTRIES.filter((entry) => entry.menuKey).map((entry) => entry.menuKey));

        const missing = baseMenu.map((item) => item.key).filter((key) => !explained.has(key));
        expect(missing).toEqual([]);
    });

    it('explains nothing that is not in the main menu', () => {
        const keys = new Set(baseMenu.map((item) => item.key));

        for (const entry of HELP_ENTRIES) {
            if (entry.menuKey) expect(keys.has(entry.menuKey), entry.menuKey).toBe(true);
        }
    });

    it('has a heading and an explanation for every entry', () => {
        for (const entry of HELP_ENTRIES) {
            const resolved = resolveHelpEntry(entry);

            if (!entry.menuKey) expect(resolved.title, entry.id).not.toBe('');
            expect(resolved.description.length, entry.id).toBeGreaterThan(20);
            if (entry.step) expect(tourStep(entry.step), entry.id).toBeDefined();
        }
    });

    it('uses unique ids', () => {
        const ids = HELP_ENTRIES.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('explains the functions of this fork', () => {
        const text = (key: string) => HELP_ENTRIES.find((entry) => entry.menuKey === key)?.description ?? '';

        expect(text('fire-grids')).toContain('Import EFP File');
        expect(text('fire-grids')).toContain('D2/6');
        expect(text('routes')).toContain('GPX');
        expect(text('hashtags')).toContain('Sticky');
        expect(text('rubber-sheets').length).toBeGreaterThan(20);
        expect(text('grid-lines')).toContain('MGRS');
        expect(text('signatures').length).toBeGreaterThan(20);
        expect(tourStep('coordinates')?.description).toContain('LV95');
    });
});

describe('tour steps', () => {
    it('uses unique ids', () => {
        const ids = TOUR_STEPS.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('point at elements that exist in the app', () => {
        const menuKeys = new Set(baseMenu.map((item) => item.key));
        const targets = [
            ...TOUR_STEPS.map((step) => step.target),
            ...HELP_ENTRIES.map((entry) => entry.target),
        ].filter((target): target is string => Boolean(target));

        for (const target of targets) {
            const match = /^\[data-testid="([^"]+)"\]$/.exec(target);
            expect(match, target).not.toBeNull();

            const id = match![1];
            if (id.startsWith('menu-item-')) {
                expect(menuKeys.has(id.slice('menu-item-'.length)), target).toBe(true);
                expect(componentSource).toContain('`menu-item-${item.key}`');
            } else {
                expect(componentSource, target).toContain(`data-testid='${id}'`);
            }
        }
    });

    it('open only routes of the app', () => {
        for (const step of TOUR_STEPS) {
            if (step.route) expect(['/menu']).toContain(step.route);
        }
    });
});
