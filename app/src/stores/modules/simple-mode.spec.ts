import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../base/profile.ts', () => ({ default: { get: vi.fn() } }));
vi.mock('../../base/contact.ts', () => ({ default: {} }));
vi.mock('../../base/chatroom.ts', () => ({ default: {} }));
vi.mock('../../utils/capacitor.ts', () => ({ isNativePlatform: () => false }));

/** Device storage that survives a module reload, as localStorage survives a page reload */
function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));

    return {
        data,
        getItem: (key: string) => data.has(key) ? data.get(key)! : null,
        setItem: (key: string, value: string) => { data.set(key, String(value)); },
        removeItem: (key: string) => { data.delete(key); },
        clear: () => data.clear(),
    };
}

/** A fresh copy of the module, as after a page reload */
async function load() {
    vi.resetModules();
    return await import('./simple-mode.ts');
}

describe('simple mode', () => {
    let storage: ReturnType<typeof memoryStorage>;

    beforeEach(() => {
        storage = memoryStorage();
        vi.stubGlobal('localStorage', storage);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is off by default', async () => {
        const mode = await load();

        expect(mode.isSimpleMode()).toBe(false);
        expect(mode.simpleMode.value).toBe(false);
    });

    it('switches on and off and keeps the choice on this device', async () => {
        let mode = await load();

        expect(mode.toggleSimpleMode()).toBe(true);
        expect(mode.simpleMode.value).toBe(true);
        expect(storage.data.get(mode.SIMPLE_MODE_STORAGE_KEY)).toBe('true');

        mode = await load();
        expect(mode.isSimpleMode()).toBe(true);

        mode.setSimpleMode(false);
        expect(mode.isSimpleMode()).toBe(false);

        mode = await load();
        expect(mode.isSimpleMode()).toBe(false);
    });

    it('treats unknown stored values as off', async () => {
        storage.data.set('cloudtak-simple-mode', 'yes');
        const mode = await load();
        expect(mode.isSimpleMode()).toBe(false);
    });

    it('still switches when storage is blocked', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('QuotaExceededError'); },
        });

        const mode = await load();
        expect(mode.isSimpleMode()).toBe(false);

        mode.setSimpleMode(true);
        expect(mode.isSimpleMode()).toBe(true);
    });

    it('keeps only map layers and signatures in the main menu', async () => {
        const mode = await load();
        const { default: MenuManager } = await import('./menu.ts');

        const menu = new MenuManager({});
        menu.isSystemAdmin.value = true;

        const full = menu.items.value.map((item) => item.key);
        expect(full).toContain('signatures');
        expect(full).toContain('missions');
        expect(full).toContain('settings');

        mode.setSimpleMode(true);
        expect(menu.items.value.map((item) => item.key)).toEqual(['signatures', 'overlays', 'basemaps']);

        mode.setSimpleMode(false);
        expect(menu.items.value.map((item) => item.key)).toEqual(full);
    });
});
