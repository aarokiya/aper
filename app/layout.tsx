import type { Metadata, Viewport } from 'next';
import { AppearanceProvider } from '@/components/appearance/appearance-provider';
import { AppShell } from '@/components/shell/app-shell';
import { STUDY_FOCUS_BOOT_SCRIPT } from '@/components/shell/study-focus-boot';
import { appearanceVars, customFontFaces, THEME_BOOT_SCRIPT } from '@/lib/appearance/css';
import { getAppearance, listMedia } from '@/lib/appearance/store';
import { fontVariables } from './fonts';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '_aper',
  icons: { icon: '/favicon.svg' },
  description: 'A calm, local-first command center for Georgia Tech coursework.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Appearance is server-rendered onto <html> so the first paint is already
  // the user's theme, fonts, and accent; `system` is resolved by the boot
  // script before paint.
  const appearance = getAppearance();
  const media = listMedia();
  const dark = appearance.theme === 'dark';
  return (
    <html
      lang="en"
      className={`${fontVariables}${dark ? ' dark' : ''}`}
      data-theme-pref={appearance.theme}
      style={{
        ...(appearanceVars(appearance) as React.CSSProperties),
        colorScheme: appearance.theme === 'system' ? undefined : appearance.theme,
      }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `${THEME_BOOT_SCRIPT};${STUDY_FOCUS_BOOT_SCRIPT}` }} />
        <style id="aper-custom-fonts" dangerouslySetInnerHTML={{ __html: customFontFaces(media) }} />
      </head>
      <body>
        <AppearanceProvider initialAppearance={appearance} initialMedia={media}>
          <AppShell>{children}</AppShell>
        </AppearanceProvider>
      </body>
    </html>
  );
}
