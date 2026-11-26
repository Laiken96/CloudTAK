import { db, liveQuery } from '../database.ts';
import type { Observable } from 'dexie';
import { server as apiServer } from '../std.ts';
import type { Server, Server_Update } from '../types.ts';
import type { DBServer } from '../database.ts';

export default class ServerManager {
    static live(): Observable<Server | undefined> {
        return liveQuery(async () => {
             const s = await db.server.get('server');
             return s;
        });
    }

    static async get(): Promise<Server> {
        const server = await db.server.get('server');

        // PzBat12: a stored "unconfigured" never counts, the server may have been configured since. A browser that
        // opened CloudTAK in the minutes before the first setup kept showing the setup page (26.11.2026).
        if (server && server.status !== 'unconfigured') return server;

        try {
            return await ServerManager.sync();
        } catch (err) {
            // A configured server answers 401 before the login: forget the stale answer, so nothing reads it again
            if (server) await db.server.delete('server');
            throw err;
        }
    }

    static async sync(): Promise<Server> {
        const res = await apiServer.GET('/api/server');

        if (res.error) throw new Error(res.error.message);

        const server = res.data as DBServer;
        server._id = 'server';

        await db.server.put(server);

        return server;
    }

    static async update(server: Server_Update): Promise<Server> {
        const res = await apiServer.PATCH('/api/server', {
            body: server
        });

        if (res.error) throw new Error(res.error.message);

        const s = res.data as DBServer;
        s._id = 'server';

        await db.server.put(s);

        return s;
    }

    static async create(server: Server_Update): Promise<Server> {
        // The backend exposes PATCH /api/server for both initial configuration
        // and subsequent updates.
        return await ServerManager.update(server);
    }
}


