/**
 * Differences between running in a browser and inside the Android app
 * (Capacitor). Native plugins are imported lazily so the web build never
 * loads them.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export type SaveResult = 'saved' | 'cancelled';

/**
 * Browser: triggers a normal file download.
 * Android: writes the file to the app's cache and opens the share sheet so the
 * user can save it to Google Drive, Files, email, etc.
 */
export async function saveTextFile(filename: string, text: string, mime: string): Promise<SaveResult> {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const file = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [file.uri], dialogTitle: 'Save or send file' });
    return 'saved';
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled';
    throw e;
  }
}

/** Match the Android status bar to the app theme. No-op in the browser. */
export async function syncStatusBar(dark: boolean, color: string): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color });
    // Style.Dark = light icons, for a dark background.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* cosmetic only */
  }
}

/** Register the Android back button handler; returns a cleanup function. */
export function onBackButton(handler: () => void): () => void {
  if (!isNative) return () => {};
  let remove: (() => void) | null = null;
  let cancelled = false;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', handler).then((h) => {
      if (cancelled) void h.remove();
      else remove = () => void h.remove();
    }),
  );
  return () => {
    cancelled = true;
    remove?.();
  };
}

export async function minimizeApp(): Promise<void> {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.minimizeApp();
}
