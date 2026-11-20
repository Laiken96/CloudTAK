<template>
    <MenuTemplate name='Tactical Graphics'>
        <div
            class='d-flex flex-column gap-2 py-2'
            data-testid='tactical-picker'
        >
            <div class='text-secondary small'>
                Lines and areas of regulation 52.003. Pick a signature, draw it on the map with your finger, then fill in its name.
            </div>

            <TablerInput
                v-model='search'
                icon='search'
                placeholder='Search...'
                data-testid='tactical-picker-search'
            />

            <TablerNone
                v-if='!groups.length'
                label='No Signatures'
                :create='false'
                :compact='true'
            />

            <div
                v-for='group of groups'
                :key='group.id'
                class='d-flex flex-column gap-1'
            >
                <div
                    class='subheader pt-2'
                    v-text='group.label'
                />
                <button
                    v-for='entry of group.entries'
                    :key='entry.id'
                    type='button'
                    class='tactical-entry d-flex align-items-center gap-2 rounded border px-2 py-1 text-start cloudtak-hover'
                    :data-testid='`tactical-entry-${entry.id}`'
                    @click='choose(entry)'
                >
                    <TacticalPreview :entry='entry' />
                    <div
                        class='flex-grow-1'
                        style='min-width: 0;'
                    >
                        <div v-text='entry.label' />
                        <div
                            class='text-secondary small'
                            v-text='$tr("Regulation 52.003, chapter {chapter}", { chapter: entry.chapter })'
                        />
                    </div>
                </button>
            </div>
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { TablerInput, TablerNone } from '@tak-ps/vue-tabler';
import MenuTemplate from '../util/MenuTemplate.vue';
import TacticalPreview from './TacticalPreview.vue';
import { useMapStore } from '../../../stores/map.ts';
import { CATALOG, GROUPS, type CatalogEntry } from '../../../utils/tactical-graphics/catalog.ts';
import { startTactical } from './tactical-draw.ts';

const router = useRouter();
const mapStore = useMapStore();

const search = ref('');

const groups = computed(() => {
    const query = search.value.trim().toLowerCase();

    return GROUPS.map((group) => ({
        ...group,
        entries: CATALOG.filter((entry) => entry.group === group.id
            && (!query || entry.label.toLowerCase().includes(query) || (entry.prefix ?? '').toLowerCase().includes(query))),
    })).filter((group) => group.entries.length);
});

async function choose(entry: CatalogEntry): Promise<void> {
    await router.push('/');
    await startTactical(mapStore, entry);
}
</script>

<style scoped>
.tactical-entry {
    min-height: 56px;
    background: transparent;
    color: inherit;
}
</style>
