import { Screensaver } from '@/components/ambient/screensaver';
import { Customizer } from '@/components/appearance/customizer';
import { CommandPalette } from '@/components/command-palette';
import { Rail } from './rail';
import { getShellData } from './shell-data';

/**
 * Persistent chrome rendered once by the root layout: the Study Hub-style
 * rail (desktop) / drawer + top bar (mobile), the command palette host, and
 * the main column every page renders into.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const data = getShellData();
  return (
    <>
      <a
        href="#main"
        className="sr focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-float)]"
      >
        Skip to content
      </a>
      <Rail data={data} />
      <main id="main" className="min-h-dvh min-w-0 lg:pl-[var(--rail-w)]">
        {children}
      </main>
      <CommandPalette />
      <Customizer />
      <Screensaver />
    </>
  );
}
