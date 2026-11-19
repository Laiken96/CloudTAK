<template>
    <MenuTemplate
        name='Signatures'
        :loading='!loaded'
    >
        <template #buttons>
            <TablerIconButton
                title='Add Signature'
                data-testid='signatures-add'
                @click='picker = true'
            >
                <IconPlus
                    :size='32'
                    stroke='1'
                />
            </TablerIconButton>
        </template>

        <div
            class='d-flex flex-column gap-3 py-2'
            data-testid='signatures-menu'
        >
            <div class='text-secondary small'>
                Favorite signatures appear in the bar on the map. Tap one there, then tap the map to place it - it stays selected until Done. Add signatures here or with the star in the Appearance of an object.
            </div>

            <div
                v-if='error'
                class='text-danger small'
                v-text='error'
            />

            <TablerNone
                v-if='!items.length'
                label='No favorite signatures'
                :create='false'
            />

            <div
                v-else
                class='d-flex flex-column gap-2'
                data-testid='signatures-list'
            >
                <StandardItem
                    v-for='(fav, index) of items'
                    :key='fav.id'
                    :hover='false'
                    class='d-flex align-items-center gap-2 px-2 py-2'
                    data-testid='signatures-item'
                >
                    <button
                        type='button'
                        class='signature-place flex-shrink-0 rounded d-flex align-items-center justify-content-center'
                        title='Place on Map'
                        data-testid='signatures-item-place'
                        @click='place(fav)'
                    >
                        <FeatureIcon
                            :size='36'
                            :feature='{ properties: signatureProperties(signatureOf(fav)) }'
                        />
                    </button>

                    <input
                        type='text'
                        class='form-control flex-grow-1'
                        style='min-width: 0;'
                        :value='fav.label'
                        :aria-label='`${$tr("Name")}: ${fav.label}`'
                        data-testid='signatures-item-label'
                        @change='rename(fav, ($event.target as HTMLInputElement).value)'
                    >

                    <div class='d-flex align-items-center flex-shrink-0'>
                        <TablerIconButton
                            title='Move Up'
                            :disabled='index === 0'
                            data-testid='signatures-item-up'
                            @click='move(fav, -1)'
                        >
                            <IconChevronUp
                                :size='28'
                                stroke='1.5'
                            />
                        </TablerIconButton>
                        <TablerIconButton
                            title='Move Down'
                            :disabled='index === items.length - 1'
                            data-testid='signatures-item-down'
                            @click='move(fav, 1)'
                        >
                            <IconChevronDown
                                :size='28'
                                stroke='1.5'
                            />
                        </TablerIconButton>
                        <TablerIconButton
                            title='Remove Favorite'
                            data-testid='signatures-item-remove'
                            @click='remove(fav)'
                        >
                            <IconTrash
                                :size='28'
                                stroke='1.5'
                            />
                        </TablerIconButton>
                    </div>
                </StandardItem>
            </div>

            <button
                type='button'
                class='btn btn-outline-primary'
                data-testid='signatures-add-button'
                @click='picker = true'
            >
                <IconPlus
                    :size='20'
                    stroke='1.5'
                    class='me-1'
                />
                Add Signature
            </button>
        </div>

        <SignaturePicker
            v-if='picker'
            action='favorite'
            @close='picker = false'
        />
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
    IconPlus,
    IconTrash,
    IconChevronUp,
    IconChevronDown,
} from '@tabler/icons-vue';
import { TablerNone, TablerIconButton } from '@tak-ps/vue-tabler';
import MenuTemplate from '../util/MenuTemplate.vue';
import StandardItem from '../util/StandardItem.vue';
import FeatureIcon from '../util/FeatureIcon.vue';
import SignaturePicker from '../util/SignaturePicker.vue';
import FavoriteSignatures, { signatureOf, type FavoriteSignature } from '../../../base/favorite-signatures.ts';
import { armSignature } from '../../../base/signature-placement.ts';
import { signatureProperties } from '../../../utils/signature.ts';

const router = useRouter();

const picker = ref(false);
const error = ref<string | undefined>();

const items = computed<FavoriteSignature[]>(() => FavoriteSignatures.state.items);
const loaded = computed<boolean>(() => FavoriteSignatures.state.loaded);

onMounted(async () => {
    await FavoriteSignatures.load();
});

async function run(action: () => Promise<void>): Promise<void> {
    error.value = undefined;

    try {
        await action();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    }
}

async function rename(fav: FavoriteSignature, label: string): Promise<void> {
    await run(() => FavoriteSignatures.rename(fav.id, label));
}

async function move(fav: FavoriteSignature, delta: number): Promise<void> {
    await run(() => FavoriteSignatures.move(fav.id, delta));
}

async function remove(fav: FavoriteSignature): Promise<void> {
    await run(() => FavoriteSignatures.remove(fav.id));
}

/** Back to the map with the signature armed - leaving the menu first so it is not disarmed */
async function place(fav: FavoriteSignature): Promise<void> {
    await router.push('/');
    armSignature(signatureOf(fav), fav.label);
}
</script>

<style scoped>
.signature-place {
    width: 52px;
    height: 52px;
    border: 1px solid var(--tblr-border-color-translucent, rgba(128, 128, 128, 0.3));
    background: var(--tblr-bg-surface-secondary, rgba(128, 128, 128, 0.12));
    color: inherit;
}
</style>
