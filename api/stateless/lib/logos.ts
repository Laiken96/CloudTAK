import Config from '../../common/config.js';
import sharp from 'sharp';

export const LOGO_SIZES = [192, 512];

/** The login logo (setting `login::logo`, a data URL) as image bytes, null if none is set */
async function loginLogo(config: Config): Promise<Buffer | null> {
    let logoData: string | undefined;
    try {
        const setting = await config.models.Setting.from('login::logo');
        logoData = String(setting.value);
    } catch {
        // No custom logo configured
    }

    if (!logoData) return null;

    // Strip data URL prefix and decode base64
    const base64Match = logoData.match(/^data:[^;]+;base64,(.+)$/);
    if (!base64Match) return null;

    return Buffer.from(base64Match[1], 'base64');
}

export async function buildLogos(config: Config): Promise<Map<number, Buffer>> {
    const logos = new Map<number, Buffer>();

    const inputBuffer = await loginLogo(config);
    if (!inputBuffer) return logos;

    await Promise.all(LOGO_SIZES.map(async (size) => {
        const resized = await sharp(inputBuffer)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        logos.set(size, resized);
    }));

    return logos;
}

/** PzBat12: size of the iOS home screen icon */
export const APPLE_TOUCH_ICON_SIZE = 180;

/**
 * PzBat12: the login logo as iOS home screen icon. iOS reads it from
 * <link rel="apple-touch-icon">, not from the manifest, and fills
 * transparency with black - so the logo sits on white with a margin.
 */
export async function buildAppleTouchIcon(config: Config): Promise<Buffer | null> {
    const inputBuffer = await loginLogo(config);
    if (!inputBuffer) return null;

    const inner = Math.round(APPLE_TOUCH_ICON_SIZE * 0.84);
    const logo = await sharp(inputBuffer)
        .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

    return await sharp({
        create: { width: APPLE_TOUCH_ICON_SIZE, height: APPLE_TOUCH_ICON_SIZE, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
        .composite([{ input: logo, gravity: 'center' }])
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
}
