/**
 * PzBat12, TEMPORARY: viewport readout for the iOS home screen app.
 *
 * Shows the sizes iOS reports next to the size the map actually has, so a
 * screenshot of the "bar below the map" bug tells which value is wrong.
 * Only shown in the iOS home screen app or with `viewport-debug` in the URL.
 * Remove once the bug is understood.
 */

const PROBE_UNITS = ['100vh', '100dvh', '100svh', '100lvh'] as const;

export function viewportDebugWanted(win: Window = window): boolean {
    const standalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return standalone || win.location.href.includes('viewport-debug');
}

function probe(doc: Document, style: string): HTMLDivElement {
    const el = doc.createElement('div');
    el.setAttribute('style', `position: fixed; top: 0; left: 0; width: 1px; visibility: hidden; pointer-events: none; ${style}`);
    doc.body.appendChild(el);
    return el;
}

const r = (n: number | undefined) => n === undefined ? '-' : String(Math.round(n));

export function installViewportDebug(win: Window = window): () => void {
    const doc = win.document;

    const box = doc.createElement('div');
    box.setAttribute('data-testid', 'viewport-debug');
    box.setAttribute('style', [
        'position: fixed', 'left: 50%', 'top: calc(env(safe-area-inset-top, 0px) + 90px)',
        'transform: translateX(-50%)', 'z-index: 2000', 'pointer-events: none',
        'background: rgba(0,0,0,0.75)', 'color: #fff', 'font: 11px/1.35 monospace',
        'padding: 4px 6px', 'border-radius: 4px', 'white-space: pre',
    ].join('; '));
    doc.body.appendChild(box);

    const unitProbes = PROBE_UNITS.map((unit) => [unit, probe(doc, `height: ${unit}`)] as const);
    const insetProbe = probe(doc, 'height: 0; padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);');

    const update = () => {
        const vv = win.visualViewport;
        const shell = doc.querySelector('.map-shell')?.getBoundingClientRect();
        const inset = win.getComputedStyle(insetProbe);
        const units = unitProbes.map(([unit, el]) => `${unit.slice(3)}=${r(el.getBoundingClientRect().height)}`).join(' ');
        const orientation = win.screen.orientation?.type ?? String((win as Window & { orientation?: number }).orientation ?? '-');

        box.textContent = [
            `inner ${r(win.innerWidth)}x${r(win.innerHeight)}  client ${r(doc.documentElement.clientWidth)}x${r(doc.documentElement.clientHeight)}`,
            `screen ${r(win.screen.width)}x${r(win.screen.height)}  ${orientation}`,
            `vv ${r(vv?.width)}x${r(vv?.height)} off ${r(vv?.offsetTop)} page ${r(vv?.pageTop)}`,
            `${units}`,
            `safe t${parseInt(inset.paddingTop)} r${parseInt(inset.paddingRight)} b${parseInt(inset.paddingBottom)} l${parseInt(inset.paddingLeft)}`,
            `scroll ${r(win.scrollY)} html ${r(doc.documentElement.scrollTop)} body ${r(doc.body.scrollTop)} doc h ${r(doc.documentElement.getBoundingClientRect().height)}`,
            `map top ${r(shell?.top)} h ${r(shell?.height)} w ${r(shell?.width)}`,
        ].join('\n');
    };

    const events = ['resize', 'orientationchange', 'scroll'];
    for (const type of events) win.addEventListener(type, update);
    win.visualViewport?.addEventListener('resize', update);
    win.visualViewport?.addEventListener('scroll', update);
    const timer = win.setInterval(update, 1000);
    update();

    return () => {
        for (const type of events) win.removeEventListener(type, update);
        win.visualViewport?.removeEventListener('resize', update);
        win.visualViewport?.removeEventListener('scroll', update);
        win.clearInterval(timer);
        box.remove();
        insetProbe.remove();
        for (const [, el] of unitProbes) el.remove();
    };
}
