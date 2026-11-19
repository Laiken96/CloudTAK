import { describe, expect, it } from 'vitest';
import { HELP_ENTRIES, HELP_SECTIONS, TOUR_STEPS } from './steps.ts';
import de from '../i18n/de.json';

describe('German texts', () => {
    const dictionary = de as Record<string, string>;

    it('translate every step and every entry', () => {
        const texts = [
            ...TOUR_STEPS.flatMap((step) => [step.title, step.description]),
            ...HELP_ENTRIES.flatMap((entry) => [entry.title, entry.description]),
            ...HELP_SECTIONS.map((section) => section.title),
        ].filter((text): text is string => Boolean(text));

        const missing = texts.filter((text) => !Object.hasOwn(dictionary, text));
        expect(missing).toEqual([]);
    });

    it('use Swiss spelling', () => {
        const texts = [
            ...TOUR_STEPS.flatMap((step) => [step.title, step.description]),
            ...HELP_ENTRIES.flatMap((entry) => [entry.title, entry.description]),
        ].filter((text): text is string => Boolean(text));

        for (const text of texts) {
            expect(dictionary[text] ?? '', text).not.toContain('ß');
        }
    });

    it('translate the tour card, the help page and the menu entry', () => {
        const texts = [
            'Help',
            'Guided tour and an explanation of every function',
            'Step {current} of {total}',
            'This element is not shown right now, for example in the simple view or while drawing.',
            'Back',
            'End',
            'Next',
            'Done',
            'Close',
            'Guided Tour',
            'The most important elements of the app, step by step.',
            'Start Tour',
            'The simple view shows only some functions. Switch to the full view to see and look up all of them.',
            'Search help...',
            'Show',
            'Show {name}',
            'No matching help',
        ];

        expect(texts.filter((text) => !Object.hasOwn(dictionary, text))).toEqual([]);
        expect(dictionary['Help']).toBe('Hilfe');
        expect(dictionary['Show']).toBe('Zeigen');
        expect(dictionary['End']).toBe('Beenden');
    });
});
