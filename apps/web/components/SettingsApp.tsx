'use client';

/**
 * /settings — Thresher's own preferences (display/convenience only; never
 * engine math — CLAUDE.md). Reads and writes the shared prefs store (lib/prefs),
 * which persists to Clerk metadata when signed in, else localStorage. Every
 * control is live: a change applies immediately across the app.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import SiteHeader from './SiteHeader';
import Footer from './Footer';
import PageHero from './PageHero';
import OnboardingWizard from './OnboardingWizard';
import { usePrefs } from '../lib/prefs';
import { seedDefaultFollows } from '../lib/follows-client';
import { WEB_CONFIG } from '../lib/config';
import type {
  BoardDirection,
  BoardSort,
  BoardTab,
  Prefs,
  ThemePref,
} from '../lib/config';
import type { Timeframe } from '@thresher/engine';
import styles from '../app/settings/settings.module.css';

/** A labelled segmented control (the pill pattern used across the app). */
function Segmented<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>{label}</span>
        {hint && <span className={styles.fieldHint}>{hint}</span>}
      </div>
      <div className={styles.pills} role="group" aria-label={label} data-testid={`set-${name}`}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className={`${styles.pill} ${value === o.value ? styles.pillActive : ''}`}
            aria-pressed={value === o.value}
            data-testid={`set-${name}-${o.value}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const THEME_OPTS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const TF_OPTS: ReadonlyArray<{ value: Timeframe; label: string }> = [
  { value: 'intraday', label: 'Hourly' },
  { value: 'swing', label: 'Daily' },
  { value: 'position', label: 'Weekly' },
];
const RISK_OPTS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.5, label: '0.5%' },
  { value: 1, label: '1%' },
  { value: 2, label: '2%' },
  { value: 3, label: '3%' },
];
const TAB_OPTS: ReadonlyArray<{ value: BoardTab; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'following', label: 'Following' },
  { value: 'intraday', label: 'Hourly' },
  { value: 'swing', label: 'Daily' },
  { value: 'position', label: 'Weekly' },
];
const DIR_OPTS: ReadonlyArray<{ value: BoardDirection; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Longs' },
  { value: 'short', label: 'Shorts' },
];
const MINRR_OPTS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Any' },
  { value: 1.5, label: '1.5+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
];
const SORT_OPTS: ReadonlyArray<{ value: BoardSort; label: string }> = [
  { value: 'score', label: 'Score' },
  { value: 'quality', label: 'Quality' },
  { value: 'rr', label: 'R:R' },
  { value: 'confidence', label: 'Agreement' },
];

export default function SettingsApp() {
  const { prefs, setPref } = usePrefs();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [watchlistMsg, setWatchlistMsg] = useState<string | null>(null);

  const set =
    <K extends keyof Prefs>(key: K) =>
    (value: Prefs[K]) =>
      setPref(key, value);

  const restoreWatchlist = async () => {
    setWatchlistMsg('Restoring…');
    try {
      await seedDefaultFollows(WEB_CONFIG.follows.defaultWatchlist);
      setWatchlistMsg(`Added the starter watchlist (${WEB_CONFIG.follows.defaultWatchlist.join(', ')}).`);
    } catch {
      setWatchlistMsg('Could not restore the watchlist — try again.');
    }
  };

  return (
    <>
      <SiteHeader showBack />
      <div className={styles.page} data-testid="settings-page">
        <PageHero kicker="preferences" title="Settings">
          Display and convenience only — these never change the engine’s math, just how Thresher
          looks and what it defaults to.
        </PageHero>

        <section className={`panel ${styles.card}`}>
          <h2 className={styles.cardTitle}>Appearance</h2>
          <Segmented
            name="theme"
            label="Theme"
            hint="System follows your device."
            value={prefs.theme}
            options={THEME_OPTS}
            onChange={set('theme')}
          />
        </section>

        <section className={`panel ${styles.card}`}>
          <h2 className={styles.cardTitle}>Analysis</h2>
          <Segmented
            name="timeframe"
            label="Default timeframe"
            hint="Selected when you open Analyze without one in the link."
            value={prefs.defaultTimeframe}
            options={TF_OPTS}
            onChange={set('defaultTimeframe')}
          />
        </section>

        <section className={`panel ${styles.card}`}>
          <h2 className={styles.cardTitle}>Position sizing</h2>
          <p className={styles.cardNote}>
            Prefill the sizer on every trade plan. Signed in, these follow you across devices.
          </p>
          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <span className={styles.fieldLabel}>Account size</span>
            </div>
            <div className={styles.money}>
              <span className={styles.dollar}>$</span>
              <input
                className={styles.input}
                data-testid="set-account"
                inputMode="decimal"
                value={prefs.accountSize}
                onChange={(e) => setPref('accountSize', e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="10,000"
                aria-label="Default account size in dollars"
              />
            </div>
          </div>
          <Segmented
            name="risk"
            label="Risk / trade"
            value={prefs.riskPct}
            options={RISK_OPTS}
            onChange={set('riskPct')}
          />
        </section>

        <section className={`panel ${styles.card}`}>
          <h2 className={styles.cardTitle}>Leaderboard defaults</h2>
          <p className={styles.cardNote}>
            The starting view and filters when you open the Leaderboard without them in the link.
          </p>
          <Segmented
            name="tab"
            label="View"
            value={prefs.boardTab}
            options={TAB_OPTS}
            onChange={set('boardTab')}
          />
          <Segmented
            name="dir"
            label="Direction"
            value={prefs.boardDirection}
            options={DIR_OPTS}
            onChange={set('boardDirection')}
          />
          <Segmented
            name="minrr"
            label="Minimum R:R"
            value={prefs.boardMinRR}
            options={MINRR_OPTS}
            onChange={set('boardMinRR')}
          />
          <Segmented
            name="sort"
            label="Sort by"
            value={prefs.boardSort}
            options={SORT_OPTS}
            onChange={set('boardSort')}
          />
        </section>

        <section className={`panel ${styles.card}`}>
          <h2 className={styles.cardTitle}>Onboarding</h2>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              data-testid="set-replay-onboarding"
              onClick={() => setWizardOpen(true)}
            >
              Replay the intro
            </button>
            <button
              type="button"
              className={styles.action}
              data-testid="set-restore-watchlist"
              onClick={restoreWatchlist}
            >
              Restore starter watchlist
            </button>
          </div>
          {watchlistMsg && <p className={styles.cardNote} data-testid="set-watchlist-msg">{watchlistMsg}</p>}
        </section>
      </div>
      <Footer />
      {wizardOpen && <OnboardingWizard onClose={() => setWizardOpen(false)} />}
    </>
  );
}
