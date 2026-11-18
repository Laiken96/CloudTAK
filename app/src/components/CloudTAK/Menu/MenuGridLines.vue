<template>
    <MenuTemplate
        name='Grid Lines'
    >
        <div
            class='d-flex flex-column gap-3 py-2'
            data-test='grid-lines'
        >
            <TablerToggle
                :model-value='GridLines.state.visible'
                label='Show Grid Lines'
                @update:model-value='save({ visible: $event })'
            />

            <TablerEnum
                :model-value='GridLines.state.type'
                label='Grid Type'
                :options='GRID_TYPES'
                @update:model-value='save({ type: $event })'
            />

            <div class='d-flex flex-column gap-2'>
                <div class='subheader user-select-none'>
                    Grid Color
                </div>
                <div class='d-flex align-items-center gap-2 flex-wrap'>
                    <button
                        v-for='c of GRID_COLORS'
                        :key='c.value'
                        type='button'
                        class='btn btn-sm d-flex align-items-center gap-2'
                        :class='GridLines.state.color === c.value ? "btn-primary" : "btn-outline-secondary"'
                        :title='`${c.name} grid lines`'
                        :aria-pressed='GridLines.state.color === c.value'
                        @click='save({ color: c.value })'
                    >
                        <span
                            class='rounded-circle border border-dark'
                            :style='{ background: c.value, width: "14px", height: "14px", display: "inline-block" }'
                        />
                        {{ c.name }}
                    </button>
                    <label
                        class='btn btn-sm d-flex align-items-center gap-2 mb-0'
                        :class='custom ? "btn-primary" : "btn-outline-secondary"'
                        title='Custom grid line color'
                    >
                        <input
                            type='color'
                            class='form-control-color p-0 border-0 bg-transparent'
                            style='width: 18px; height: 18px;'
                            :value='GridLines.state.color'
                            data-test='grid-lines-custom-color'
                            @change='save({ color: ($event.target as HTMLInputElement).value })'
                        >
                        Custom
                    </label>
                </div>
            </div>

            <div class='text-secondary small'>
                <template v-if='GridLines.state.type === "MGRS"'>
                    Grid zones and 100 km squares with their letters (like 32T LT), plus the
                    finest of the 10 km, 1 km and 100 m lines that fits the screen. Line
                    numbers stand at the top and left edge, as in ATAK: 53 is the 1 km line
                    of 32T LT 53 56.
                </template>
                <template v-else>
                    Meridians and parallels at a round step that fits the screen, labelled
                    at the top and left edge.
                </template>
            </div>
        </div>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { computed, onMounted } from 'vue';
import { TablerEnum, TablerToggle } from '@tak-ps/vue-tabler';
import MenuTemplate from '../util/MenuTemplate.vue';
import GridLines, { type GridLinesSettings } from '../../../base/grid-lines.ts';
import { GRID_COLORS, GRID_TYPES } from '../../../utils/grid-lines.ts';

const custom = computed(() => !GRID_COLORS.some((c) => c.value === GridLines.state.color));

onMounted(async () => {
    await GridLines.load();
});

async function save(patch: Partial<GridLinesSettings>): Promise<void> {
    try {
        await GridLines.update(patch);
    } catch (err) {
        console.error('Failed to save grid line settings', err);
    }
}
</script>
