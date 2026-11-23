<template>
    <span
        v-if='tag'
        class='hashtag-hidden-hint small text-truncate d-flex align-items-center gap-1'
    >
        <IconEyeOff
            :size='14'
            stroke='1'
            class='flex-shrink-0'
        />
        <span
            class='text-truncate'
            v-text='text'
        />
    </span>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { IconEyeOff } from '@tabler/icons-vue';
import { tr } from '../../../i18n/index.ts';
import HiddenHashtags from '../../../stores/modules/hidden-hashtags.ts';

/**
 * Note in a Feature list that the Feature is not on the map as one of the
 * hashtags in its remarks is hidden in the Hashtag Manager
 */
const props = defineProps<{
    remarks?: unknown;
}>();

const tag = computed(() => HiddenHashtags.hiddenBy(props.remarks));
const text = computed(() => tag.value ? tr('Hidden via {tag}', { tag: tag.value }) : '');
</script>

<style scoped>
.hashtag-hidden-hint {
    color: var(--tblr-warning);
}
</style>
