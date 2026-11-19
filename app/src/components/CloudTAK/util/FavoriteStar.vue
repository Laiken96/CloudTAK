<template>
    <TablerIconButton
        :title='favorite ? "Remove from favorite signatures" : "Add to favorite signatures"'
        :disabled='busy'
        data-testid='favorite-star'
        :aria-pressed='favorite'
        @click.stop='toggle'
    >
        <IconStarFilled
            v-if='favorite'
            :size='size'
            class='favorite-star--on'
        />
        <IconStar
            v-else
            :size='size'
            stroke='1'
        />
    </TablerIconButton>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import { IconStar, IconStarFilled } from '@tabler/icons-vue';
import { TablerIconButton } from '@tak-ps/vue-tabler';
import FavoriteSignatures from '../../../base/favorite-signatures.ts';
import { signatureLabel } from '../../../base/signature-label.ts';
import { signatureFrom } from '../../../utils/signature.ts';
import type { Feature } from '../../../types.ts';

/**
 * Star toggle that adds the signature of a point (its type plus icon or
 * colour) to the favourites bar or removes it again
 */
const props = withDefaults(defineProps<{
    properties: Pick<Feature['properties'], 'type' | 'icon' | 'marker-color'>;
    size?: number;
}>(), {
    size: 32,
});

const busy = ref(false);

const signature = computed(() => signatureFrom(props.properties));

const favorite = computed<boolean>(() => FavoriteSignatures.has(signature.value));

onMounted(async () => {
    await FavoriteSignatures.load();
});

async function toggle(): Promise<void> {
    if (busy.value) return;
    busy.value = true;

    try {
        const sig = signature.value;
        await FavoriteSignatures.toggle(sig, await signatureLabel(sig));
    } catch (err) {
        console.error('Failed to update favourite signatures', err);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.favorite-star--on {
    color: var(--tblr-yellow, #f59f00);
}
</style>
