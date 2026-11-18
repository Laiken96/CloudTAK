<template>
    <StandardItem
        :hover='false'
        class='position-relative'
    >
        <div class='d-flex flex-column gap-2 px-3 py-3'>
            <div class='d-flex align-items-center gap-3'>
                <div
                    class='d-flex align-items-center justify-content-center rounded-circle bg-black bg-opacity-25 flex-shrink-0'
                    style='width: 40px; height: 40px;'
                >
                    <IconLanguage
                        :size='24'
                        stroke='1.5'
                    />
                </div>
                <div class='fw-bold text-white'>
                    Language
                </div>
            </div>
            <div class='col-12'>
                <TablerEnum
                    v-model='language'
                    :options='options'
                />
            </div>
        </div>
    </StandardItem>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { IconLanguage } from '@tabler/icons-vue';
import { TablerEnum } from '@tak-ps/vue-tabler';
import StandardItem from '../components/CloudTAK/util/StandardItem.vue';
import { LOCALES, getLocale, setLocale } from './index.ts';

// Shown in their own language, so the choice is readable either way
const options = LOCALES.map((l) => l.label);

const language = computed({
    get: () => LOCALES.find((l) => l.id === getLocale())?.label ?? options[0],
    set: (label: string) => {
        const locale = LOCALES.find((l) => l.label === label);
        if (locale && locale.id !== getLocale()) setLocale(locale.id);
    },
});
</script>
