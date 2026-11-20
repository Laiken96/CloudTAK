<template>
    <div
        v-if='status.phase !== "idle"'
        class='feature-drag-status cloudtak-panel position-absolute d-flex align-items-center gap-2 px-2 py-1'
        :class='{ "feature-drag-status--passive": passive }'
        data-testid='feature-drag-status'
        :data-phase='status.phase'
        role='status'
        aria-live='polite'
    >
        <IconAlertTriangle
            v-if='status.phase === "error"'
            :size='24'
            stroke='1.5'
            class='text-danger flex-shrink-0'
        />
        <IconArrowsMove
            v-else
            :size='24'
            stroke='1.5'
            class='flex-shrink-0'
        />

        <div class='flex-grow-1 feature-drag-status__text'>
            <div
                v-if='status.label'
                class='fw-bold text-truncate'
                v-text='status.label'
            />
            <div
                class='small feature-drag-status__hint'
                :class='status.phase === "error" ? "text-danger" : "text-secondary"'
                data-testid='feature-drag-hint'
                v-text='hint'
            />
        </div>

        <button
            v-if='status.phase === "moved"'
            type='button'
            class='btn btn-outline-secondary feature-drag-status__action'
            title='Undo'
            data-testid='feature-drag-undo'
            @click='undoFeatureMove()'
        >
            <IconArrowBackUp
                :size='20'
                stroke='1.5'
            />
            <span class='ms-1'>Undo</span>
        </button>

        <TablerIconButton
            v-if='status.phase === "moved" || status.phase === "error"'
            title='Dismiss'
            data-testid='feature-drag-dismiss'
            @click='dismissFeatureMoveStatus()'
        >
            <IconX
                :size='24'
                stroke='1.5'
            />
        </TablerIconButton>

        <div
            v-if='status.phase === "moved"'
            :key='status.until'
            class='feature-drag-status__timer'
            :style='{ animationDuration: `${UNDO_WINDOW}ms` }'
        />
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { TablerIconButton } from '@tak-ps/vue-tabler';
import {
    IconX,
    IconArrowsMove,
    IconArrowBackUp,
    IconAlertTriangle,
} from '@tabler/icons-vue';
import {
    UNDO_WINDOW,
    featureDragStatus,
    undoFeatureMove,
    dismissFeatureMoveStatus,
} from '../../base/feature-drag-map.ts';
import { tr } from '../../i18n/index.ts';

/**
 * Status line of moving an object on the map: how to drop it while it is
 * dragged, then a few seconds of Undo - a slip of the finger on an iPhone
 * moves an object easily.
 */

const status = featureDragStatus;

/** Touches pass through while the object is dragged and saved */
const passive = computed<boolean>(() => status.phase === 'dragging' || status.phase === 'saving');

const hint = computed<string>(() => {
    switch (status.phase) {
        case 'dragging':
            return status.kind === 'mouse'
                ? tr('Release to drop, Esc cancels')
                : tr('Release to drop, a second finger cancels');
        case 'saving':
            return tr('Saving...');
        case 'moved':
            return tr('Moved');
        case 'undoing':
            return tr('Undoing...');
        case 'error':
            return status.message;
        default:
            return '';
    }
});
</script>

<style scoped>
.feature-drag-status {
    z-index: 6;
    top: calc(76px + var(--status-bar-height, 0px));
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    min-width: 200px;
    max-width: min(420px, calc(100% - 128px));
    min-height: 52px;
    overflow: hidden;
}

.feature-drag-status--passive {
    pointer-events: none;
}

.feature-drag-status__text {
    min-width: 0;
    line-height: 1.2;
}

.feature-drag-status__hint {
    white-space: normal;
}

/* Large enough for a thumb */
.feature-drag-status__action {
    min-height: 44px;
    white-space: nowrap;
}

.feature-drag-status__timer {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background-color: var(--bs-primary, #0d6efd);
    transform-origin: left;
    animation-name: feature-drag-shrink;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
}

@keyframes feature-drag-shrink {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}
</style>
