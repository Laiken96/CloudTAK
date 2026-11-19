/**
 * PzBat12: node-cot's to_geojson drops the ATAK MEDEVAC 9-Line detail
 * (`<_medevac_ …/>`), so a MEDEVAC imported from a DataPackage would lose its
 * 9-Line. Carry the detail over unchanged (xml-js compact form, including the
 * ZMIST child elements) as `properties.medevac` - the API's patched node-cot
 * stores it and writes it back to XML (app/patches/@tak-ps+node-cot+*.patch).
 */
export function withMedevac<T extends { properties: object }>(raw: unknown, feat: T): T {
    const detail = (raw as { event?: { detail?: Record<string, unknown> } } | undefined)?.event?.detail;

    let medevac = detail ? detail._medevac_ : undefined;
    if (Array.isArray(medevac)) medevac = medevac[0];

    if (medevac && typeof medevac === 'object') {
        (feat.properties as Record<string, unknown>).medevac = JSON.parse(JSON.stringify(medevac));
    }

    return feat;
}
