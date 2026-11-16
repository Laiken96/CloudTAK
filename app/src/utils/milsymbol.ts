import ms from 'milsymbol';
import { ref } from 'vue';
import milsymScriptUrl from '@io.github.missioncommand/mil-sym-js/dist/sm-bc.min.js?url';
import unitFontUrl from '@io.github.missioncommand/mil-sym-js/dist/fonts/UnitFont.woff2?url';
import singlePointFontUrl from '@io.github.missioncommand/mil-sym-js/dist/fonts/SinglePoint.woff2?url';
import tacticalGraphicsFontUrl from '@io.github.missioncommand/mil-sym-js/dist/fonts/TacticalGraphics.woff2?url';
import { parent2525c } from './atak-2525c.ts';

/**
 * MIL-STD symbol generation shared by the map's Icon Manager and DOM previews
 * so a symbol looks the same wherever it is drawn
 *
 * `2525C:` ids are drawn with the Mission Command 2525C renderer (mil-sym-js,
 * namespace `armyc2.c2sd`) - the renderer family ATAK draws its markers with -
 * using ATAK's settings, so a marker looks the same in CloudTAK and ATAK.
 * Until that renderer has loaded, and for `2525D:`/`2525E:` ids, milsymbol is used.
 */

/** Render size (px) of a generated symbol */
export const SYMBOL_SIZE = 24;

/** ATAK renders a 2525C marker icon 32px, scaled by the display density */
export const ATAK_SYMBOL_SIZE = 32;

/** Icon ids of the form `2525<Variant>:<SIDC>` resolve to a generated symbol */
const MILSYM_PREFIX = /^2525[CDE]:/;

/** Icon ids drawn by the ATAK 2525C renderer */
const ATAK_PREFIX = /^2525C:/;

/** `RendererSettings.Symbology_2525C` */
const SYMSTD_2525C = 1;

interface MilSymImageInfo {
    getImage(): HTMLCanvasElement | null;
}

interface MilSymRenderer {
    MilStdIconRenderer: {
        Render(symbolID: string, modifiers: Record<string, unknown>): MilSymImageInfo | null;
    };
    utilities: {
        MilStdAttributes: {
            PixelSize: string;
            KeepUnitRatio: string;
            SymbologyStandard: string;
        };
        RendererSettings: {
            setSymbologyStandard?(standard: number): void;
        };
        SymbolUtilities: {
            getBasicSymbolID(symbolID: string, symStd?: number): string;
        };
        UnitDefTable: {
            hasUnitDef(basicID: string, symStd: number): boolean;
        };
    };
}

declare global {
    interface Window {
        armyc2?: { c2sd?: { renderer?: MilSymRenderer } };
    }
}

/** True once the ATAK 2525C renderer is available - reactive so DOM previews redraw */
export const atakRendererReady = ref(false);

let loading: Promise<boolean> | undefined;

const dataURLs = new Map<string, string>();

function atakRenderer(): MilSymRenderer | undefined {
    if (typeof window === 'undefined') return undefined;
    return window.armyc2?.c2sd?.renderer;
}

function injectScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

/**
 * Load the ATAK 2525C renderer and its symbol fonts once. Resolves false when it
 * cannot be loaded (no DOM, blocked asset) so callers fall back to milsymbol.
 */
export function loadAtakRenderer(): Promise<boolean> {
    if (loading) return loading;

    if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
        loading = Promise.resolve(false);
        return loading;
    }

    loading = (async () => {
        try {
            // The renderer measures glyphs of these fonts, so they must be ready first
            await Promise.all(([
                ['UnitFont', unitFontUrl],
                ['SinglePoint', singlePointFontUrl],
                ['TacticalGraphics', tacticalGraphicsFontUrl],
            ] as const).map(async ([family, url]) => {
                const face = new FontFace(family, `url(${url})`);
                await face.load();
                document.fonts.add(face);
            }));

            await injectScript(milsymScriptUrl);

            const renderer = atakRenderer();
            if (!renderer) throw new Error('mil-sym-js loaded without the armyc2.c2sd renderer');

            renderer.utilities.RendererSettings.setSymbologyStandard?.(SYMSTD_2525C);

            atakRendererReady.value = true;
            return true;
        } catch (err) {
            console.error('ATAK 2525C renderer unavailable - falling back to milsymbol', err);
            return false;
        }
    })();

    return loading;
}

export function isMilsymIcon(id: string): boolean {
    return MILSYM_PREFIX.test(id);
}

function sidc(id: string): string {
    return id.replace(MILSYM_PREFIX, '');
}

/**
 * Draw a 2525C code as ATAK does: PixelSize, no unit ratio, default colours.
 * Like ATAK, a code the renderer has no symbol for falls back to its parent.
 */
function atakCanvas(code: string, pixelSize: number): HTMLCanvasElement | undefined {
    const renderer = atakRenderer();
    if (!renderer || !atakRendererReady.value) return undefined;

    const { MilStdAttributes, SymbolUtilities, UnitDefTable } = renderer.utilities;

    let current: string | undefined = code.toUpperCase();
    while (current) {
        const known = !current.startsWith('S')
            || UnitDefTable.hasUnitDef(SymbolUtilities.getBasicSymbolID(current, SYMSTD_2525C), SYMSTD_2525C);

        if (known) {
            const info = renderer.MilStdIconRenderer.Render(current, {
                [MilStdAttributes.PixelSize]: pixelSize,
                [MilStdAttributes.KeepUnitRatio]: false,
                [MilStdAttributes.SymbologyStandard]: SYMSTD_2525C,
            });

            const canvas = info?.getImage();
            if (canvas) return canvas;
        }

        current = parent2525c(current);
    }

    return undefined;
}

/** @param id A bare SIDC or a `2525<Variant>:<SIDC>` icon id */
export function symbolCanvas(id: string): HTMLCanvasElement {
    if (ATAK_PREFIX.test(id)) {
        const canvas = atakCanvas(sidc(id), ATAK_SYMBOL_SIZE);
        if (canvas) return canvas;
    }

    return new ms.Symbol(sidc(id), { size: SYMBOL_SIZE }).asCanvas();
}

/**
 * The map image for a symbol icon id. `2525C:` ids wait for the ATAK renderer and
 * are drawn at the display density so they stay sharp at ATAK's 32px.
 */
export async function symbolImage(id: string): Promise<{ image: HTMLCanvasElement, pixelRatio: number }> {
    if (ATAK_PREFIX.test(id) && await loadAtakRenderer()) {
        const pixelRatio = Math.max(1, Math.round(globalThis.devicePixelRatio || 1));
        const canvas = atakCanvas(sidc(id), ATAK_SYMBOL_SIZE * pixelRatio);
        if (canvas) return { image: canvas, pixelRatio };
    }

    return { image: symbolCanvas(id), pixelRatio: 1 };
}

/**
 * Cached per SIDC and size so a list of Features sharing a symbol renders it
 * once rather than once per instance
 *
 * @param id A bare SIDC or a `2525<Variant>:<SIDC>` icon id
 */
export function symbolDataURL(id: string, size = SYMBOL_SIZE): string {
    const atak = ATAK_PREFIX.test(id);

    // Read the reactive flag so a computed preview redraws once the renderer loads
    if (atak && !atakRendererReady.value) void loadAtakRenderer();
    const useAtak = atak && atakRendererReady.value;

    const key = `${useAtak ? 'atak' : 'ms'}:${sidc(id)}:${size}`;

    let url = dataURLs.get(key);

    if (!url) {
        // Drawn at twice the display size so the preview stays sharp when scaled down
        const canvas = useAtak ? atakCanvas(sidc(id), size * 2) : undefined;

        url = canvas
            ? canvas.toDataURL()
            : new ms.Symbol(sidc(id), { size }).toDataURL();

        dataURLs.set(key, url);
    }

    return url;
}
