import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
    GET: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    PATCH: vi.fn(),
}));

vi.mock('../std.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../std.ts')>()),
    server,
}));

import { db } from '../database.ts';
import type { DBServer } from '../database.ts';
import ServerManager from '../base/server.ts';

const UNCONFIGURED = { _id: 'server', status: 'unconfigured', name: '', url: '', api: '', webtak: '', auth: false } as unknown as DBServer;
const CONFIGURED = { status: 'configured', name: 'Pz Bat 12 TAK', url: 'ssl://tak.example:8089', api: 'https://tak.example:8443', webtak: 'https://tak.example:8446', auth: true };

describe('ServerManager.get: a stored "unconfigured" never counts (PzBat12)', () => {
    beforeEach(async () => {
        await db.server.clear();
        server.GET.mockReset();
    });

    afterEach(async () => {
        await db.server.clear();
    });

    it('uses a stored configured server without asking the API', async () => {
        await db.server.put({ ...CONFIGURED, _id: 'server' } as unknown as DBServer);
        const s = await ServerManager.get();
        expect(s.status).toBe('configured');
        expect(server.GET).not.toHaveBeenCalled();
    });

    it('asks the API again when the stored answer is "unconfigured" and stores the new one', async () => {
        await db.server.put(UNCONFIGURED);
        server.GET.mockResolvedValue({ data: { ...CONFIGURED } });
        const s = await ServerManager.get();
        expect(server.GET).toHaveBeenCalledWith('/api/server');
        expect(s.status).toBe('configured');
        expect((await db.server.get('server'))?.status).toBe('configured');
    });

    it('forgets a stale "unconfigured" when the configured server refuses before the login (401)', async () => {
        await db.server.put(UNCONFIGURED);
        server.GET.mockResolvedValue({ error: { message: 'Unauthorized' } });
        await expect(ServerManager.get()).rejects.toThrow('Unauthorized');
        expect(await db.server.get('server')).toBeUndefined();
    });

    it('asks the API when nothing is stored', async () => {
        server.GET.mockResolvedValue({ data: { ...UNCONFIGURED } });
        const s = await ServerManager.get();
        expect(s.status).toBe('unconfigured');
        expect(server.GET).toHaveBeenCalledTimes(1);
    });
});
