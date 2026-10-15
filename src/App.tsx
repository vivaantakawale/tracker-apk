import { useEffect } from 'react';
import { ChartLine, House, Settings } from 'lucide-react';
import { StoreProvider, useStoreState } from './state/store';
import { UIProvider, useUI, type Tab } from './state/ui';
import { HomeScreen } from './screens/HomeScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Onboarding } from './screens/Onboarding';
import { SheetHost } from './components/sheets/SheetHost';
import type { ThemePreference } from './lib/types';
import { syncStatusBar } from './lib/platform';

const NAV: { tab: Tab; label: string; Icon: typeof House }[] = [
  { tab: 'home', label: 'Home', Icon: House },
  { tab: 'progress', label: 'Progress', Icon: ChartLine },
  { tab: 'settings', label: 'Settings', Icon: Settings },
];

function BottomNavigation() {
  const { tab, setTab } = useUI();
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {NAV.map(({ tab: t, label, Icon }) => (
          <button key={t} type="button" className="nav-item" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            <Icon size={22} strokeWidth={tab === t ? 2.1 : 1.8} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useUI();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Applies light/dark, following the OS when set to "system". */
function useTheme(pref: ThemePreference | null) {
  useEffect(() => {
    if (!pref) return;
    try {
      localStorage.setItem('wt-theme', pref);
    } catch {
      /* optional cache to avoid a flash on next load */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      const bg = dark ? '#0e100f' : '#ffffff';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
      void syncStatusBar(dark, bg);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

function Shell() {
  const { state, retry } = useStoreState();
  const { tab } = useUI();
  useTheme(state.status === 'ready' ? state.data.settings.theme : null);

  if (state.status === 'loading') {
    return <div className="center-screen muted" aria-busy="true">Loading…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="center-screen">
        <div className="stack" style={{ maxWidth: 320 }}>
          <h1 className="title">Couldn't open your data</h1>
          <p className="muted">{state.error}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            Private browsing modes may block local storage. Nothing has been deleted.
          </p>
          <button type="button" className="btn btn--primary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!state.data.settings.onboarding_completed) return <Onboarding />;

  return (
    <div className="app">
      {tab === 'home' && <HomeScreen />}
      {tab === 'progress' && <ProgressScreen />}
      {tab === 'settings' && <SettingsScreen />}
      <BottomNavigation />
      <SheetHost />
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
