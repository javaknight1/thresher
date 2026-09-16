/**
 * Landing page (public, /). Marketing entry for signed-out visitors. When Clerk
 * is configured, signed-in users are redirected to /leaderboard by the
 * middleware, so they never see this. CTAs point to sign-up/sign-in when auth
 * is on, or straight to the board when it's off (local/CI).
 *
 * Shares the app's header bar (Brandmark + full-width bar) and design language
 * (gradient hero, accent cards) so it's consistent with the rest of the app.
 */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { authEnabled } from '../lib/auth';
import Footer from '../components/Footer';
import Brandmark from '../components/Brandmark';
import { HeroGraphic, IconPlan, IconGates, IconAudit, IconShortlist } from '../components/LandingArt';
import styles from './landing.module.css';

const GATES = [
  { id: 'G1', label: 'Edge' },
  { id: 'G2', label: 'Conviction' },
  { id: 'G3', label: 'Structure' },
  { id: 'G4', label: 'Expected value' },
  { id: 'G5', label: 'Event risk' },
] as const;

const VALUE_PROPS = [
  {
    Icon: IconPlan,
    accent: 'var(--amber)',
    title: 'A full trade story — or an honest refusal',
    body: 'Ticker and timeframe in, complete plan out: entry, stop, target, reasoning, and a confidence read. When the signals don’t agree, it refuses and tells you why — no forced trades.',
  },
  {
    Icon: IconGates,
    accent: 'var(--long)',
    title: 'Five gates before any trade',
    body: 'Edge, conviction, structure, expected value, and event risk are checked in order. A setup only shows when all five pass; otherwise you see exactly which one stopped it.',
  },
  {
    Icon: IconAudit,
    accent: '#6ea8fe',
    title: 'Every number is auditable',
    body: 'This isn’t a black box. Each indicator and score links to a methodology page with the formula behind it. Confidence is “signal agreement”, never a promised win rate.',
  },
  {
    Icon: IconShortlist,
    accent: '#b58cff',
    title: 'A morning shortlist',
    body: 'The Top board scans a live universe across hourly, daily, and weekly candles and ranks the setups clearing every gate — your first look each morning.',
  },
] as const;

export default function Landing() {
  const authed = authEnabled();
  const startHref = authed ? '/sign-up' : '/leaderboard';
  const signInHref = authed ? '/sign-in' : '/leaderboard';
  const startLabel = authed ? 'Get started' : 'Open the board';

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.inner}>
          <Brandmark href="/" />
          <nav className={styles.nav} aria-label="primary">
            <Link href="/guide" className={styles.navLink}>
              Guide
            </Link>
            {authed && (
              <Link href={signInHref} className={styles.navLink} data-testid="landing-signin">
                Sign in
              </Link>
            )}
            <Link href={startHref} className={styles.cta} data-testid="landing-cta">
              {startLabel} →
            </Link>
          </nav>
        </div>
      </header>

      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.kicker}>technical confluence desk</div>
            <h1 className={styles.headline}>
              A complete trade story from entry to exit — or an honest refusal.
            </h1>
            <p className={styles.sub}>
              Thresher reads price and volume the way a disciplined technician does: it scores the
              confluence across trend, momentum, volume, and structure, then either lays out the
              full plan or tells you there isn’t one worth taking.
            </p>
            <div className={styles.heroCtas}>
              <Link href={startHref} className={styles.ctaLarge} data-testid="hero-cta">
                {startLabel} →
              </Link>
              <Link href="/guide" className={styles.ctaGhost}>
                See how it works
              </Link>
            </div>
          </div>
          <div className={styles.heroArt}>
            <HeroGraphic className={styles.heroSvg} />
          </div>
        </section>

        <section className={styles.gates} aria-label="the five gates">
          <div className={styles.gatesLabel}>Every setup clears five gates, in order</div>
          <ol className={styles.gatesRow}>
            {GATES.map((g) => (
              <li key={g.id} className={styles.gate}>
                <span className={styles.gateNum}>{g.id}</span>
                <span className={styles.gateName}>{g.label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.grid}>
          {VALUE_PROPS.map(({ Icon, accent, title, body }) => (
            <div key={title} className={styles.card} style={{ '--accent': accent } as CSSProperties}>
              <span className={styles.cardIcon}>
                <Icon />
              </span>
              <div>
                <h2 className={styles.cardTitle}>{title}</h2>
                <p className={styles.cardBody}>{body}</p>
              </div>
            </div>
          ))}
        </section>

        <Footer />
      </div>
    </>
  );
}
