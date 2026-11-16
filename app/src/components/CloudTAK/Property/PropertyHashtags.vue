<template>
    <div
        v-if='tags.length'
        class='px-2 pt-2'
    >
        <label class='subheader user-select-none'>Hashtags</label>
        <div class='d-flex flex-wrap gap-1 pt-1'>
            <button
                v-for='tag of tags'
                :key='tag'
                type='button'
                class='btn btn-sm btn-outline-primary rounded-pill px-2 py-0'
                :title='`Show all ${tag} Features`'
                @click='open(tag)'
                v-text='tag'
            />
        </div>
    </div>
</template>

<script setup lang='ts'>
/** PropertyHashtags - the hashtags in a feature's remarks, each opening the Hashtag Manager */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { extractHashtags } from '../../../utils/hashtags.ts';

const props = defineProps<{
    remarks?: string;
}>();

const router = useRouter();

const tags = computed(() => extractHashtags(props.remarks));

function open(tag: string): void {
    router.push({ path: '/menu/hashtags', query: { tag } });
}
</script>
