import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BackupFile } from '../lib/backup';
import { minimizeApp, onBackButton } from '../lib/platform';

export type Tab = 'home' | 'progress' | 'settings';
export type ProgressTab = 'trend' | 'history' | 'goal' | 'phases';

export type SheetSpec =
  | { kind: 'entry-form'; entryId?: string; dateKey?: string }
  | { kind: 'entry-details'; entryId: string }
  | { kind: 'day'; dateKey: string }
  | { kind: 'goal-form'; goalId?: string }
  | { kind: 'phase-form'; phaseId?: string }
  | { kind: 'height' }
  | { kind: 'restore'; backup: BackupFile; fileName: string }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      destructive: boolean;
      resolve: (ok: boolean) => void;
    };

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: { label: string; run: () => void };
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface UIValue {
  tab: Tab;
  setTab(t: Tab): void;
  progressTab: ProgressTab;
  setProgressTab(t: ProgressTab): void;
  sheets: { id: number; spec: SheetSpec }[];
  open(spec: SheetSpec): void;
  close(id?: number): void;
  confirm(o: ConfirmOptions): Promise<boolean>;
  toasts: Toast[];
  toast(message: string, opts?: { tone?: Toast['tone']; action?: Toast['action'] }): void;
  dismissToast(id: number): void;
}

const UIContext = createContext<UIValue | null>(null);

const TABS: Tab[] = ['home', 'progress', 'settings'];
const tabFromHash = (): Tab => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(h) ? (h as Tab) : 'home';
};

export function UIProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [progressTab, setProgressTab] = useState<ProgressTab>('trend');
  const [sheets, setSheets] = useState<{ id: number; spec: SheetSpec }[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setTab = useCallback((t: Tab) => {
    const hash = t === 'home' ? '#/' : `#/${t}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setTabState(t);
    window.scrollTo({ top: 0 });
  }, []);

  const open = useCallback((spec: SheetSpec) => {
    setSheets((s) => [...s, { id: nextId.current++, spec }]);
  }, []);

  const close = useCallback((id?: number) => {
    setSheets((s) => {
      const target = id ?? s[s.length - 1]?.id;
      const closing = s.find((x) => x.id === target);
      if (closing?.spec.kind === 'confirm') closing.spec.resolve(false);
      return s.filter((x) => x.id !== target);
    });
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const once = (v: boolean) => {
          if (!settled) {
            settled = true;
            resolve(v);
          }
        };
        open({
          kind: 'confirm',
          title: o.title,
          message: o.message,
          confirmLabel: o.confirmLabel ?? 'Confirm',
          destructive: o.destructive ?? false,
          resolve: once,
        });
      }),
    [open],
  );

  // Android back button: close the top sheet, else go Home, else background the app.
  const backState = useRef({ sheets, tab });
  backState.current = { sheets, tab };
  useEffect(
    () =>
      onBackButton(() => {
        const { sheets: open, tab: current } = backState.current;
        if (open.length) close();
        else if (current !== 'home') setTab('home');
        else void minimizeApp();
      }),
    [close, setTab],
  );

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<UIValue['toast']>(
    (message, opts) => {
      const id = nextId.current++;
      // One toast at a time keeps feedback calm; the newest replaces the previous one.
      setToasts([{ id, message, tone: opts?.tone ?? 'default', action: opts?.action }]);
      window.setTimeout(() => dismissToast(id), opts?.action ? 6000 : 3500);
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ tab, setTab, progressTab, setProgressTab, sheets, open, close, confirm, toasts, toast, dismissToast }),
    [tab, setTab, progressTab, sheets, open, close, confirm, toasts, toast, dismissToast],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI must be used inside UIProvider');
  return v;
}
