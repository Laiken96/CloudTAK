<template>
    <TablerPillGroup
        v-model='config.mode'
        :options='coordOptions'
        :rounded='false'
        :full-width='false'
        size='default'
        name='point-type'
        padding=''
    >
        <template #option='{ option }'>
            <span :title='option.label'>
                <IconPoint
                    v-if='option.value === "u-d-p"'
                    title='Point Icon'
                    :size='size'
                    stroke='1'
                />
                <IconMedicalCross
                    v-else-if='option.value === MEDEVAC_TYPE'
                    title='MEDEVAC'
                    :size='size'
                    stroke='1.5'
                    class='text-red'
                />
                <img
                    v-else
                    :width='size'
                    :height='size'
                    :src='symbolDataURL(option.value, props.size)'
                >
            </span>
        </template>
    </TablerPillGroup>
</template>

<script setup lang='ts'>
import { ref, computed, watch } from 'vue';
import {
    IconPoint,
    IconMedicalCross
} from '@tabler/icons-vue';
import { TablerPillGroup } from '@tak-ps/vue-tabler';
import { LegacyPointTypes, normalizePointType } from '../../../utils/point-type.ts';
import { symbolDataURL } from '../../../utils/milsymbol.ts';
import { MEDEVAC_TYPE } from '../../../utils/medevac.ts';

// Points are created as 2525E Land Unit SIDCs where possible - u-d-p (Custom
// Point) has no 2525E equivalent and remains a traditional CoT type
const pointOptions = [
    { value: 'u-d-p', label: 'Custom Point' },
    { value: LegacyPointTypes['a-u-G'], label: 'Unknown Point' },
    { value: LegacyPointTypes['a-f-G'], label: 'Friendly Point' },
    { value: LegacyPointTypes['a-h-G'], label: 'Hostile Point' },
    { value: LegacyPointTypes['a-n-G'], label: 'Neutral Point' },
];

const props = defineProps({
    modelValue: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        default: 24
    },
    // Offer the MEDEVAC (b-r-f-h-c) type where new Points are created
    medevac: {
        type: Boolean,
        default: false
    }
});

const coordOptions = computed(() => props.medevac
    ? [...pointOptions, { value: MEDEVAC_TYPE, label: 'MEDEVAC' }]
    : pointOptions);

const config = ref({
    mode: normalizePointType(props.modelValue)
})

const emit = defineEmits([ 'update:modelValue' ])

watch(config.value, () => {
    emit('update:modelValue', config.value.mode);
})

// The type may also be preset from outside (eg the MEDEVAC Drawing Tool)
watch(() => props.modelValue, (type) => {
    const mode = normalizePointType(type);
    if (mode !== config.value.mode) config.value.mode = mode;
})
</script>
