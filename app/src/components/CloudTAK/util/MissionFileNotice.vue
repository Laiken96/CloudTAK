<template>
    <div class='px-2 pt-2'>
        <TablerInlineAlert
            severity='info'
            title='Read-only'
            :description='description'
        >
            <template #icon>
                <IconLock
                    :size='24'
                    stroke='1'
                />
            </template>
        </TablerInlineAlert>
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, watch } from 'vue';
import { IconLock } from '@tabler/icons-vue';
import { TablerInlineAlert } from '@tak-ps/vue-tabler';
import { db } from '../../../database.ts';
import { tr } from '../../../i18n/index.ts';
import { MISSION_FILE_PROPERTY } from '../../../base/mission-file-hooks.ts';
import type COT from '../../../base/cot.ts';

/**
 * Object view: the object comes from a file attached to a mission and cannot
 * be changed here (see base/mission-files.ts)
 */
const props = defineProps<{
    cot: COT;
}>();

const file = ref<string | undefined>();
const mission = ref<string | undefined>();

const description = computed(() => {
    if (file.value && mission.value) {
        return tr('From the file {file} attached to the mission {mission}. To change it, change the file and attach it again.', {
            file: file.value,
            mission: mission.value
        });
    }

    return tr('From a file attached to a mission. To change it, change the file and attach it again.');
});

watch(() => [props.cot.id, props.cot.origin.mode_id], async () => {
    const guid = props.cot.origin.mode_id;
    const hash = (props.cot.properties as Record<string, unknown>)[MISSION_FILE_PROPERTY];

    file.value = undefined;
    mission.value = undefined;
    if (!guid || typeof hash !== 'string') return;

    const [content, sub] = await Promise.all([
        db.subscription_contents
            .where('mission')
            .equals(guid)
            .filter((c) => c.hash === hash)
            .first(),
        db.subscription.get(guid)
    ]);

    file.value = content?.name;
    mission.value = sub?.name;
}, { immediate: true });
</script>
