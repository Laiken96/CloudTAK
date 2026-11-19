<template>
    <!-- Inline renders only the field so a caller can place it in a row of its own -->
    <component
        :is='inline || labelPosition === "top" ? "div" : PropertyFactRow'
        :label='inline || labelPosition === "top" ? undefined : label'
        :class='{ "py-1": !inline }'
    >
        <label
            v-if='!inline && labelPosition === "top"'
            class='form-label'
            v-text='label'
        />
        <div>
            <CopyField
                :model-value='inMode'
                :display='displayed'
                :edit='edit'
                :hover='hover'
                :validate='validateInput'
                :size='24'
                @submit='submitCoordinate($event)'
                @update:model-value='coordinateEntry($event)'
            />
            <div
                v-if='fallback'
                class='mx-1 small text-secondary'
                data-test='coordinate-fallback'
            >
                Outside the LV95 area, shown in MGRS
            </div>
            <UnitSwitcher
                v-if='availableModes.length > 1'
                :model-value='config.mode'
                :options='availableModes'
                @update:model-value='config.mode = $event as CoordMode'
            />
        </div>
    </component>
</template>

<script setup lang='ts'>
import CopyField from './CopyField.vue';
import UnitSwitcher from './UnitSwitcher.vue';
import PropertyFactRow from './PropertyFactRow.vue';
import { COORD_MODES, formatCoordPair, parseCoordPair, plainCoordPair, shownCoordMode, validateCoordPair, type CoordMode } from '../../../utils/coordinateFormat.ts';
import { useMapStore } from '../../../stores/map.ts';
import { ref, computed, watch, type PropType } from 'vue';

const props = defineProps({
    label: {
        type: String,
        default: 'Coordinates'
    },
    hover: {
        type: Boolean,
        default: false
    },
    edit: {
        type: Boolean,
        default: false
    },
    inline: {
        type: Boolean,
        description: 'Render only the field - the caller provides the label',
        default: false
    },
    labelPosition: {
        type: String as PropType<'left' | 'top'>,
        description: 'Place the label beside the field or above it',
        default: 'left'
    },
    truncate: {
        type: Number,
        description: 'Truncate DD coordinates to a given precision',
        default: undefined
    },
    modes: {
        type: Array,
        default: function() {
            return COORD_MODES.map((mode) => mode.value)
        }
    },
    modelValue: {
        type: Array,
        required: true,
        description: 'A coordinate pair in GeoJSON format (lng,lat)'
    }
});

const emit = defineEmits([
    'submit',
    'update:modelValue',
]);

const mapStore = useMapStore();

/** The format chosen in Display Preferences, if this field offers it */
function preferredMode(): CoordMode | undefined {
    const mode = mapStore.coordFormat as CoordMode;
    return props.modes.includes(mode) ? mode : undefined;
}

const config = ref({
    mode: (preferredMode() || props.modes[0] || 'dd') as CoordMode
});

watch(() => mapStore.coordFormat, () => {
    const mode = preferredMode();
    if (mode) config.value.mode = mode;
});

const availableModes = computed(() => {
    return COORD_MODES.filter((mode) => props.modes.includes(mode.value));
});

watch(() => props.modes, (nextModes) => {
    if (nextModes.length && !nextModes.includes(config.value.mode)) {
        config.value.mode = nextModes[0] as CoordMode;
    }
}, {
    immediate: true,
    deep: true
});

const validateInput = computed(() => {
    return (text: string): string => {
        return validateCoordPair(text, config.value.mode);
    }
});

// Copied and edited text; LV95 as plain metres so it pastes anywhere
const inMode = computed(() => {
    return plainCoordPair(
        props.modelValue[1] as number,
        props.modelValue[0] as number,
        config.value.mode,
        props.truncate
    );
});

// Shown text, if it differs: LV95 in groups of three digits
const displayed = computed(() => {
    const text = formatCoordPair(
        props.modelValue[1] as number,
        props.modelValue[0] as number,
        config.value.mode,
        props.truncate
    );

    return text === inMode.value ? undefined : text;
});

// LV95 chosen, but the position lies too far from Switzerland
const fallback = computed(() => {
    const mode = config.value.mode;
    return shownCoordMode(props.modelValue[1] as number, props.modelValue[0] as number, mode) !== mode;
});

function coordinateEntry(text: string | number) {
    if (typeof text !== 'string') return;

    try {
        const [lat, lng] = parseCoordPair(text, config.value.mode);
        emit('update:modelValue', [lng, lat]);
    } catch {
        // Validation handles the user-visible error state.
    }
}

function submitCoordinate(text: string | number) {
    emit('submit', text);
}
</script>
