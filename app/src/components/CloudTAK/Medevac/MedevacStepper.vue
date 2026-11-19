<template>
    <div class='d-flex align-items-center gap-2 py-1'>
        <div
            class='flex-grow-1 text-break'
            style='min-width: 0;'
            v-text='label'
        />
        <button
            v-if='!disabled'
            type='button'
            class='btn btn-outline-secondary stepper-button'
            :disabled='modelValue <= 0'
            :aria-label='`${label} -1`'
            @click='set(modelValue - 1)'
        >
            <IconMinus
                :size='20'
                stroke='1.5'
            />
        </button>
        <input
            :value='modelValue'
            :disabled='disabled'
            :aria-label='label'
            class='form-control text-center stepper-value'
            type='number'
            inputmode='numeric'
            min='0'
            max='99'
            @change='typed($event)'
        >
        <button
            v-if='!disabled'
            type='button'
            class='btn btn-outline-secondary stepper-button'
            :disabled='modelValue >= 99'
            :aria-label='`${label} +1`'
            @click='set(modelValue + 1)'
        >
            <IconPlus
                :size='20'
                stroke='1.5'
            />
        </button>
    </div>
</template>

<script setup lang='ts'>
import { IconMinus, IconPlus } from '@tabler/icons-vue';

const props = withDefaults(defineProps<{
    label: string;
    modelValue: number;
    disabled?: boolean;
}>(), {
    disabled: false,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: number): void;
}>();

// Patient counts of the 9-Line: whole numbers 0 - 99
function clamp(value: number): number {
    return isNaN(value) ? 0 : Math.min(99, Math.max(0, Math.round(value)));
}

function set(value: number): void {
    const next = clamp(value);
    if (next !== props.modelValue) emit('update:modelValue', next);
}

// The field shows what was typed until the value changes - normalise it in place
function typed(event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = clamp(Number(input.value));
    input.value = String(next);
    set(next);
}
</script>

<style scoped>
/* Large touch targets for gloves & small screens */
.stepper-button {
    width: 44px;
    height: 44px;
    padding: 0;
    flex-shrink: 0;
}

.stepper-value {
    width: 56px;
    height: 44px;
    flex-shrink: 0;
    /* 16px keeps iOS Safari from zooming in on focus */
    font-size: 16px;
}
</style>
