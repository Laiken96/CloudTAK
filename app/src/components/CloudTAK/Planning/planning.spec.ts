import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
    setPlan: vi.fn(async () => undefined),
    paths: vi.fn(async () => [] as Array<{ path: string; count: number }>),
    pathFeatures: vi.fn(async () => new Set<{ as_feature: () => unknown }>()),
    remove: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
};
const mapStore = { worker: { db }, refresh: vi.fn(async () => undefined) };

vi.mock('../../../stores/map.ts', () => ({
    useMapStore: () => mapStore
}));

import {
    planning, planPath, planName, defaultPlanName, isPlanPath,
    loadPlanning, startPlan, resumePlan, endPlan, listPlans, publishToMission, discardPlan,
} from './planning.ts';

function cot(id: string) {
    const feature = {
        id,
        type: 'Feature',
        path: '/Planung/Angriff',
        properties: { id, callsign: id, chsig: { _attributes: { sig: 'main-attack' } } },
        geometry: { type: 'LineString', coordinates: [[7.4, 47], [7.5, 47.1]] },
    };
    return { as_feature: () => JSON.parse(JSON.stringify(feature)) };
}

describe('planning', () => {
    beforeEach(async () => {
        for (const fn of Object.values(db)) fn.mockClear();
        db.pathFeatures.mockResolvedValue(new Set());
        await endPlan();
        db.setPlan.mockClear();
    });

    it('keeps every plan in one folder per name below Planung', () => {
        expect(planPath('Angriff Nord')).toBe('/Planung/Angriff Nord');
        expect(planPath('  Phase 2/3  ')).toBe('/Planung/Phase 2-3');
        expect(planPath('')).toMatch(/^\/Planung\/Plan \d\d\.\d\d\. \d\d:\d\d$/);
        expect(planName('/Planung/Angriff Nord')).toBe('Angriff Nord');
        expect(defaultPlanName(new Date(2026, 10, 27, 9, 5))).toBe('Plan 27.11. 09:05');
        expect(isPlanPath('/Planung/Angriff Nord')).toBe(true);
        expect(isPlanPath('/Planung')).toBe(false);
        expect(isPlanPath('/Eigene')).toBe(false);
    });

    it('tells the worker about the plan and reopens it after a reload', async () => {
        await startPlan('Angriff Nord');

        expect(planning.path).toBe('/Planung/Angriff Nord');
        expect(db.setPlan).toHaveBeenLastCalledWith('/Planung/Angriff Nord');

        // Reload: the module state is gone, the device remembers the plan
        planning.path = null;
        await loadPlanning();
        expect(planning.path).toBe('/Planung/Angriff Nord');

        await endPlan();
        expect(db.setPlan).toHaveBeenLastCalledWith(undefined);
        await loadPlanning();
        expect(planning.path).toBeNull();
    });

    it('lists the drafts below Planung only', async () => {
        db.paths.mockResolvedValue([
            { path: '/Planung/Verteidigung', count: 2 },
            { path: '/Planung/Angriff', count: 5 },
            { path: '/Planung/Angriff/Varianten', count: 1 },
            { path: '/Eigene', count: 7 },
        ]);

        expect(await listPlans()).toEqual([
            { path: '/Planung/Angriff', name: 'Angriff', count: 5 },
            { path: '/Planung/Verteidigung', name: 'Verteidigung', count: 2 },
        ]);

        await resumePlan('/Planung/Verteidigung');
        expect(planning.path).toBe('/Planung/Verteidigung');
    });

    it('publishes the plan into a Data Sync in one step and ends planning', async () => {
        await startPlan('Angriff');
        db.pathFeatures.mockResolvedValue(new Set([cot('a'), cot('b')]));

        expect(await publishToMission('mission-1')).toBe(2);

        expect(db.remove.mock.calls.map((call) => (call as unknown[])[0])).toEqual(['a', 'b']);
        expect(db.add).toHaveBeenCalledTimes(2);

        const [published, options] = db.add.mock.calls[0] as unknown as [{ id: string; path: string; origin: unknown; properties: Record<string, unknown> }, unknown];
        expect(published.id).not.toBe('a');
        expect(published.properties.id).toBe(published.id);
        expect(published.path).toBe('/');
        expect(published.origin).toEqual({ mode: 'Mission', mode_id: 'mission-1' });
        expect(published.properties.chsig).toEqual({ _attributes: { sig: 'main-attack' } });
        expect(options).toEqual({ authored: true });

        expect(planning.path).toBeNull();
        expect(db.setPlan).toHaveBeenLastCalledWith(undefined);
    });

    it('discards the plan: deletes its objects and ends planning', async () => {
        await startPlan('Angriff');
        db.pathFeatures.mockResolvedValue(new Set([cot('a')]));

        await discardPlan();

        expect(db.remove).toHaveBeenCalledWith('a');
        expect(db.add).not.toHaveBeenCalled();
        expect(planning.path).toBeNull();
    });
});
