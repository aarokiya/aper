import { ACCENT_BY_ID, contrastText, fontStack } from './catalog';
import type { Appearance, AppearanceMedia } from './schema';

/**
 * CSS custom properties applied to <html> for a given Appearance. The server
 * renders them inline (no flash) and AppearanceProvider re-applies them live.
 * Light/dark accent pairs are resolved by globals.css (`.dark` swaps them).
 */
export function appearanceVars(appearance: Appearance): Record<string, string> {
  const preset = ACCENT_BY_ID[appearance.accent];
  const light = preset ? preset.light : appearance.customAccent;
  const dark = preset ? preset.dark : appearance.customAccent;
  return {
    '--font-display': fontStack(appearance.fonts.display, 'display'),
    '--font-body': fontStack(appearance.fonts.body, 'body'),
    '--font-code': fontStack(appearance.fonts.mono, 'mono'),
    '--text-scale': String(appearance.textScale),
    '--accent-light': light,
    '--accent-light-fg': contrastText(light),
    '--accent-dark': dark,
    '--accent-dark-fg': contrastText(dark),
  };
}

/** @font-face rules for uploaded fonts (family `aper-font-<id>`). */
export function customFontFaces(media: AppearanceMedia[]) {
  return media
    .filter((item) => item.kind === 'font')
    .map(
      (item) =>
        `@font-face{font-family:"aper-font-${item.id}";src:url("/api/appearance/media/${item.id}");font-display:swap;}`,
    )
    .join('\n');
}

/** Script run in <head> before paint: resolves the `system` theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;if(d.dataset.themePref!=='system')return;var k=matchMedia('(prefers-color-scheme: dark)').matches;d.classList.toggle('dark',k);d.style.colorScheme=k?'dark':'light'}catch(e){}})()`;
