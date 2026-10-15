# Weight Tracker

A private, mobile-first personal weight tracker. Local-first: there is no account, no backend, and no cloud sync.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

**On an Android phone:** run `npm run dev -- --host` and open the printed network URL on the phone (same Wi-Fi).
To install it to the home screen with offline support, host `dist/` over HTTPS (any static host works). Chrome only
enables service workers and installation on HTTPS or `localhost`.

## Android app (APK)

The web app is wrapped as a native Android app with [Capacitor](https://capacitorjs.com) (`android/`, `capacitor.config.ts`).
Inside the app, data lives in the app's private storage, so clearing Chrome doesn't affect it. It survives app updates
and is deleted only if the app is uninstalled. Exports open Android's share sheet (save to Drive, Files, etc.), and the
back button closes dialogs and then returns to Home.

**Builds run on GitHub.** `.github/workflows/android.yml` runs on every push to `main`: tests → web build →
`cap sync` → signed release APK → signature check → GitHub Release named `v1.0.<build number>`.
Download the APK from the repository's **Releases** page on the phone.

One-time setup: add two repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `ANDROID_KEYSTORE_BASE64.txt` from the signing folder |
| `ANDROID_KEYSTORE_PASSWORD` | contents of `ANDROID_KEYSTORE_PASSWORD.txt` |

The signing key (`weighttracker-release.p12`) is kept **outside the repository** and must never be committed.
Every release must be signed with the same key, or Android won't install it as an update. Keep a backup of it.

The app id `app.weighttracker.personal` must not change, because Android treats a different id as a different app.

The web version still runs in a browser (`npm run dev`) for development.

## Stack

React 18, TypeScript (strict), Vite, `lucide-react` icons, plain CSS with design tokens (light/dark). The chart is a
small custom SVG component. Persistence uses IndexedDB through a thin wrapper (`src/lib/db.ts`).

## Structure

```
src/lib/          business logic (no React): types, units, dates, stats, goal, milestones,
                  forecast, bmi, phases, entries (validation), backup (CSV/JSON), db (IndexedDB)
src/state/        StoreProvider (data + actions), useDerived (all statistics), UI context (sheets, toasts, nav)
src/components/   chart, cards, history list, calendar, sheets (dialogs)
src/screens/      Home, Progress, Settings, Onboarding
```

## Data

- Stored in the browser's IndexedDB database `weight-tracker` (stores: `entries`, `goals`, `phases`, `settings`).
- Weights are stored in **kilograms**. Pounds are converted only for display and input (1 lb = 0.45359237 kg).
- Statistics, BMI, goal progress, milestones and forecasts are always **derived** from stored records, never stored.
- Every multi-record write (restore, goal switch, phase switch) runs in a single transaction, so it either fully applies or fully rolls back.

### Export / restore (Settings → Data)

- **Export CSV**: every reading (`id, measured_at (UTC ISO), weight_kg, notes, created_at, updated_at`), with a
  `# weight-tracker-csv v1` first line. Values are RFC 4180-escaped and protected against spreadsheet formula injection.
- **Download JSON backup**: everything (entries, goals including history, phases, settings), with `format`, `version` and `exported_at`.
- **Restore from backup**: the file is validated first. You then choose:
  - *Merge*: adds only records that aren't already present. Duplicates are skipped, so importing the same file twice does nothing.
  - *Replace*: replaces everything, after an explicit confirmation. A "Back up current data" button is offered first.

## Calculation rules

| Statistic | Rule |
|---|---|
| Current weight | Most recent reading by measurement time (ties: creation time, then id). |
| Daily summary | Mean of a local calendar day's readings. Individual readings are kept unchanged. |
| 7 / 30-day change | Latest reading minus the last reading on or before (latest date − N days). If that reading is more than 3 / 7 days older than the comparison date, the app shows "Not enough data". |
| 7-day average | Mean of daily summaries in the last 7 calendar days. Missing days are skipped, never counted as zero. |
| Week-over-week | 7-day average vs. the 7 days before it. |
| Rolling average line | For each logged day, mean of daily summaries in that day and the 6 before it. Shown once at least 3 days in the window have data. |
| Rate per week | Least-squares slope of daily summaries over 28 days (needs ≥ 5 days spanning ≥ 7). |
| Goal progress | `(current − start) / (target − start)`. The bar is clamped to 0–100%; the number is not. A target within 0.05 kg of the start is a maintenance goal (±1 kg). |
| Goal completion | "Target reached" is computed live from the latest reading. Marking a goal *completed* is a separate explicit action, and a completed goal can be reactivated. |
| Milestones | First reading on or after the goal start that crosses each threshold (1 / 2.5 / 5 … kg or 2 / 5 / 10 … lb; 25 / 50 / 75 / 100% of the goal). Fully derived, so they never duplicate and they update when entries change. |
| Forecast | Regression over the last 42 days (needs ≥ 10 logged days spanning ≥ 14). Uses the fitted trend value as "current". Hidden when the trend is flat (< 0.05 kg/week), moving away from the target, or more than 2 years out. Shown as early/mid/late month plus a ±1 SE range. |
| Phases | Inclusive date ranges that cannot overlap, so at most one is active. Stats use only readings inside the phase's dates. |
| BMI | kg / m², from the latest reading. Standard adult categories. Never stored. |
| Chart gaps | The x-axis is real time. The line breaks where readings are more than 7 days apart. Smoothing uses monotone cubic interpolation, which never overshoots the data. |

Rounding happens only at display time.
