import 'fake-indexeddb/auto';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../database.ts';
import FavoriteSignatures from '../../../base/favorite-signatures.ts';
import {
    SIGNATURE_SOURCE_KEY,
    emptySwissDraft,
    lastSwissDraft,
    rememberSwissDraft,
} from '../../../base/swiss-formation-choice.ts';
import SwissFormationPicker from './SwissFormationPicker.vue';
import SignaturePicker from './SignaturePicker.vue';

const STUBS = {
    teleport: true,
    FeatureIcon: true,
};

async function mountPicker(action: 'place' | 'favorite' = 'place'): Promise<VueWrapper> {
    const wrapper = mount(SwissFormationPicker, {
        props: { action },
        global: { stubs: STUBS },
    });

    await flushPromises();
    return wrapper;
}

function items(wrapper: VueWrapper) {
    return wrapper.findAll('[data-testid="swiss-formation-item"]');
}

async function search(wrapper: VueWrapper, text: string): Promise<void> {
    await wrapper.find('[data-testid="swiss-formation-search"]').setValue(text);
}

async function pickFirst(wrapper: VueWrapper, text: string): Promise<void> {
    await search(wrapper, text);
    await items(wrapper)[0].trigger('click');
}

function title(wrapper: VueWrapper): string {
    return wrapper.find('[data-testid="swiss-formation-title"]').text();
}

beforeEach(async () => {
    await db.favorite_signature.clear();
    FavoriteSignatures.state.loaded = false;
    FavoriteSignatures.state.items = [];

    rememberSwissDraft(emptySwissDraft());
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
});

describe('SwissFormationPicker', () => {
    it('lists the formations of the Reglement and cannot place without one', async () => {
        const wrapper = await mountPicker();

        expect(items(wrapper).length).toBeGreaterThan(100);
        expect(wrapper.text()).toContain('Panzertruppen');
        expect(wrapper.find('[data-testid="swiss-formation-place"]').attributes('disabled')).toBeDefined();
        expect(wrapper.find('[data-testid="swiss-formation-star"]').exists()).toBe(false);

        // Opening it makes Swiss formations the default of the picker
        expect(localStorage.setItem).toHaveBeenCalledWith(SIGNATURE_SOURCE_KEY, 'swiss');
    });

    it('shows an empty result for an unknown search', async () => {
        const wrapper = await mountPicker();
        await search(wrapper, 'xyzzy');

        expect(items(wrapper)).toHaveLength(0);
        expect(wrapper.find('[data-testid="swiss-formation-empty"]').exists()).toBe(true);
    });

    it('places a hostile tank platoon as 2525 symbol with echelon and Swiss label', async () => {
        const wrapper = await mountPicker();

        await pickFirst(wrapper, 'Panzer');
        expect(wrapper.find('[data-testid="swiss-formation-selected"]').text()).toContain('Panzerformation');
        expect(title(wrapper)).toBe('Pz');

        await wrapper.find('[data-testid="swiss-echelon-14"]').trigger('click');
        expect(title(wrapper)).toBe('Pz Zug');

        // Affiliation chips: Friendly, Hostile, Neutral, Unknown
        await wrapper.findAll('.affiliation-chip')[1].trigger('click');

        await wrapper.find('[data-testid="swiss-formation-place"]').trigger('click');

        expect(wrapper.emitted('place')).toEqual([[{
            signature: { type: '13061000141205000000' },
            label: 'Pz Zug',
        }]]);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('offers the Swiss terms of a level and uses the one chosen', async () => {
        const wrapper = await mountPicker();

        await pickFirst(wrapper, 'Artillerieformation');
        await wrapper.find('[data-testid="swiss-echelon-15"]').trigger('click');

        expect(wrapper.find('[data-testid="swiss-echelon-15"]').text()).toContain('Batterie');
        expect(title(wrapper)).toBe('Art Bttr');

        const terms = wrapper.find('[data-testid="swiss-terms"]').findAll('button');
        expect(terms.map((term) => term.text())).toEqual(['Kompanie', 'Batterie', 'Staffel', 'Kolonne']);

        await terms[0].trigger('click');
        expect(title(wrapper)).toBe('Art Kp');

        await wrapper.find('[data-testid="swiss-formation-staff"]').trigger('click');
        expect(title(wrapper)).toBe('Stab Art Kp');
    });

    it('shows the higher levels behind More', async () => {
        const wrapper = await mountPicker();

        expect(wrapper.find('[data-testid="swiss-echelon-22"]').exists()).toBe(false);
        await wrapper.find('[data-testid="swiss-echelon-more"]').trigger('click');
        expect(wrapper.find('[data-testid="swiss-echelon-22"]').exists()).toBe(true);
    });

    it('adds the choice with echelon to the favourites', async () => {
        const wrapper = await mountPicker('favorite');

        await pickFirst(wrapper, 'aufkl');
        await wrapper.find('[data-testid="swiss-echelon-16"]').trigger('click');
        await wrapper.find('[data-testid="swiss-formation-label"]').setValue('Aufkl Bat 11');

        await wrapper.find('[data-testid="swiss-formation-add"]').trigger('click');

        // IndexedDB answers asynchronously
        await vi.waitFor(() => expect(wrapper.emitted('close')).toHaveLength(1));
        expect(FavoriteSignatures.state.items.map((item) => [item.label, item.type])).toEqual([
            ['Aufkl Bat 11', '13031000161205010000'],
        ]);
    });

    it('toggles a favourite with the star while placing', async () => {
        const wrapper = await mountPicker();

        await pickFirst(wrapper, 'San');
        await wrapper.find('[data-testid="swiss-echelon-15"]').trigger('click');

        const star = () => wrapper.find('[data-testid="swiss-formation-star"]');
        expect(star().attributes('aria-pressed')).toBe('false');

        await star().trigger('click');
        await vi.waitFor(() => expect(FavoriteSignatures.state.items.map((item) => item.label)).toEqual(['San Kp']));
        await flushPromises();
        expect(star().attributes('aria-pressed')).toBe('true');

        await vi.waitFor(() => expect(star().attributes('disabled')).toBeUndefined());
        await star().trigger('click');
        await vi.waitFor(() => expect(FavoriteSignatures.state.items).toEqual([]));
    });

    it('remembers the last choice for the next time it opens', async () => {
        const first = await mountPicker();
        await pickFirst(first, 'Mech');
        await first.find('[data-testid="swiss-echelon-15"]').trigger('click');
        first.unmount();

        expect(lastSwissDraft).toMatchObject({ formation: 'mech', echelon: '15' });

        const second = await mountPicker();
        expect(second.find('[data-testid="swiss-formation-selected"]').exists()).toBe(true);
        expect(title(second)).toBe('Pz Gren Kp');

        await second.find('[data-testid="swiss-formation-selected"]').trigger('click');
        expect(items(second).length).toBeGreaterThan(100);
    });

    it('switches back to all signatures', async () => {
        const wrapper = await mountPicker();
        await wrapper.find('[data-testid="signature-source-all"]').trigger('click');

        expect(wrapper.emitted('source')).toEqual([['all']]);
    });
});

describe('SignaturePicker with Swiss formations', () => {
    const PICKER_STUBS = {
        ...STUBS,
        FavoriteStar: true,
        AppearanceTypeSelect: true,
        AppearanceMarker: true,
        SwissFormationPicker: true,
    };

    it('opens all signatures by default and switches to Swiss formations', async () => {
        const wrapper = mount(SignaturePicker, { global: { stubs: PICKER_STUBS } });
        await flushPromises();

        expect(wrapper.find('[data-testid="signature-picker"]').exists()).toBe(true);
        expect(wrapper.findComponent({ name: 'SwissFormationPicker' }).exists()).toBe(false);

        await wrapper.find('[data-testid="signature-source-swiss"]').trigger('click');

        expect(wrapper.find('[data-testid="signature-picker"]').exists()).toBe(false);
        expect(wrapper.findComponent({ name: 'SwissFormationPicker' }).exists()).toBe(true);
        expect(localStorage.setItem).toHaveBeenCalledWith(SIGNATURE_SOURCE_KEY, 'swiss');
    });

    it('opens Swiss formations when they were used last and passes the placement on', async () => {
        vi.mocked(localStorage.getItem).mockImplementation((key: string) => key === SIGNATURE_SOURCE_KEY ? 'swiss' : null);

        const wrapper = mount(SignaturePicker, { props: { action: 'place' }, global: { stubs: PICKER_STUBS } });
        await flushPromises();

        const swiss = wrapper.findComponent({ name: 'SwissFormationPicker' });
        expect(swiss.exists()).toBe(true);
        expect(swiss.props('action')).toBe('place');

        const value = { signature: { type: '13031000141205000000' }, label: 'Pz Zug' };
        swiss.vm.$emit('place', value);
        swiss.vm.$emit('close');

        expect(wrapper.emitted('place')).toEqual([[value]]);
        expect(wrapper.emitted('close')).toHaveLength(1);

        swiss.vm.$emit('source', 'all');
        await flushPromises();
        expect(wrapper.find('[data-testid="signature-picker"]').exists()).toBe(true);
        expect(localStorage.setItem).toHaveBeenCalledWith(SIGNATURE_SOURCE_KEY, 'all');
    });
});
