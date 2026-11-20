import { describe, it, expect } from 'vitest';
import { spriteId, parseSpriteId, isSpriteId, hexColor, casingColor } from './sprite-id.ts';
import { SPRITES } from './sprites.ts';
import { CATALOG } from './catalog.ts';
import { sampleFeature } from './preview.ts';
import { tacticalDerived } from './derive.ts';

describe('tactical graphic sprites', () => {
    it('names sprites with their colour', () => {
        expect(spriteId('ech-F', '#80E0FF')).toBe('tg-ech-F-80e0ff');
        expect(parseSpriteId('tg-ech-F-80e0ff')).toEqual({ name: 'ech-F', color: '#80e0ff' });
        expect(isSpriteId('tg-arc-f00')).toBe(false);
        expect(isSpriteId('2525C:SFGP')).toBe(false);
        expect(hexColor('#F00')).toBe('ff0000');
        expect(hexColor('red')).toBeUndefined();
    });

    it('cases light colours dark and dark colours light', () => {
        expect(casingColor('#80E0FF')).toBe('#1a1a1a');
        expect(casingColor('#FFFF80')).toBe('#1a1a1a');
        expect(casingColor('#1a1a1a')).toBe('#ffffff');
    });

    it('has a sprite for every image a signature asks for', () => {
        for (const entry of CATALOG) {
            for (const f of tacticalDerived(sampleFeature(entry), (id) => id.length)) {
                const id = f.properties.icon ?? f.properties.pat;
                if (!id) continue;
                const parsed = parseSpriteId(String(id));
                expect(parsed, `${entry.id}: ${id}`).toBeDefined();
                expect(SPRITES[parsed!.name], `${entry.id}: ${id}`).toBeDefined();
            }
        }
    });
});
