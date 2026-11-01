'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { appearanceVars, customFontFaces } from '@/lib/appearance/css';
import type { Appearance, AppearanceMedia } from '@/lib/appearance/schema';

export type CustomizerSection =
  | 'background'
  | 'type'
  | 'color'
  | 'greeting'
  | 'layout'
  | 'screensaver';

type AppearanceContextValue = {
  appearance: Appearance;
  media: AppearanceMedia[];
  /** Apply immediately, persist after a short pause. */
  update: (next: Appearance | ((current: Appearance) => Appearance)) => void;
  /** Upload an image or font; resolves with the stored item. */
  uploadMedia: (
    file: Blob,
    name: string,
    meta?: Partial<AppearanceMedia>,
  ) => Promise<AppearanceMedia>;
  deleteMedia: (id: string) => Promise<void>;
  resolvedTheme: 'light' | 'dark';
  customizer: { open: boolean; section: CustomizerSection };
  openCustomizer: (section?: CustomizerSection) => void;
  closeCustomizer: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export const mediaUrl = (id: string) => `/api/appearance/media/${id}`;

const darkQuery = '(prefers-color-scheme: dark)';

function subscribeSystemTheme(listener: () => void) {
  const query = window.matchMedia(darkQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function applyAppearance(appearance: Appearance, systemDark: boolean) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(appearanceVars(appearance)))
    root.style.setProperty(name, value);
  root.dataset.themePref = appearance.theme;
  const dark =
    appearance.theme === 'dark' ||
    (appearance.theme === 'system' && systemDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function AppearanceProvider({
  initialAppearance,
  initialMedia,
  children,
}: {
  initialAppearance: Appearance;
  initialMedia: AppearanceMedia[];
  children: React.ReactNode;
}) {
  const [appearance, setAppearance] = useState(initialAppearance);
  const [media, setMedia] = useState(initialMedia);
  const [customizer, setCustomizer] = useState<{
    open: boolean;
    section: CustomizerSection;
  }>({
    open: false,
    section: 'background',
  });
  const [saveState, setSaveState] =
    useState<AppearanceContextValue['saveState']>('idle');
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    () => window.matchMedia(darkQuery).matches,
    () => initialAppearance.theme === 'dark',
  );
  const pending = useRef<Appearance | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    applyAppearance(appearance, systemDark);
  }, [appearance, systemDark]);

  useEffect(() => {
    const id = 'aper-custom-fonts';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = customFontFaces(media);
  }, [media]);

  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    setSaveState('saving');
    try {
      const response = await fetch('/api/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  const update = useCallback<AppearanceContextValue['update']>(
    (next) => {
      setAppearance((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        pending.current = value;
        return value;
      });
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (!pending.current) return;
      void fetch('/api/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.current),
        keepalive: true,
      });
      pending.current = null;
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const uploadMedia = useCallback<AppearanceContextValue['uploadMedia']>(
    async (file, name, meta) => {
      const form = new FormData();
      form.set('file', file, name);
      if (meta) form.set('meta', JSON.stringify(meta));
      const response = await fetch('/api/appearance/media', {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as {
        item?: AppearanceMedia;
        media?: AppearanceMedia[];
        error?: string;
      };
      if (!response.ok || !payload.item)
        throw new Error(payload.error ?? 'Upload failed.');
      setMedia(payload.media ?? []);
      return payload.item;
    },
    [],
  );

  const deleteMedia = useCallback<AppearanceContextValue['deleteMedia']>(
    async (id) => {
      await flush();
      const response = await fetch(`/api/appearance/media/${id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as {
        media?: AppearanceMedia[];
        appearance?: Appearance;
      };
      if (!response.ok) throw new Error('Could not delete that file.');
      setMedia(payload.media ?? []);
      if (payload.appearance) setAppearance(payload.appearance);
    },
    [flush],
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      media,
      update,
      uploadMedia,
      deleteMedia,
      resolvedTheme:
        appearance.theme === 'dark' ||
        (appearance.theme === 'system' && systemDark)
          ? 'dark'
          : 'light',
      customizer,
      openCustomizer: (section) =>
        setCustomizer((current) => ({
          open: true,
          section: section ?? current.section,
        })),
      closeCustomizer: () =>
        setCustomizer((current) => ({ ...current, open: false })),
      saveState,
    }),
    [
      appearance,
      media,
      update,
      uploadMedia,
      deleteMedia,
      systemDark,
      customizer,
      saveState,
    ],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context)
    throw new Error('useAppearance must be used inside AppearanceProvider');
  return context;
}
