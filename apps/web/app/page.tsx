/**
 * Landing page (public, /). Marketing entry for signed-out visitors. When Clerk
 * is configured, signed-in users are redirected to /app by the middleware, so
 * they never see this. CTAs point to sign-up/sign-in when auth is on, or
 * straight to the board when it's off (local/CI).
 */
import Link from 'next/link';
import { authEnabled } from '../lib/auth';
import Footer from '../components/Footer';
import styles from './landing.module.css';

const VALUE_PROPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'A full trade story — or an honest refusal',
    body: 'Ticker and timeframe in, complete plan out: entry, stop, target, reasoning, and a confidence read. When the signals don’t agree, it refuses and tells you why — no forced trades.',
  },
  {
    title: 'Five gates before any trade',
    body: 'Edge, conviction, structure, expected value, and event risk are checked in order. A setup only shows when all five pass; otherwise you see exactly which one stopped it.',
  },
  {
    title: 'Every number is auditable',
    body: 'This isn’t a black box. Each indicator and score links to a methodology page with the formula behind it. Confidence is “signal agreement”, never a promised win rate.',
  },
  {
    title: 'A morning shortlist',
    body: 'The Top board scans a live universe across hourly, daily, and weekly candles and ranks the setups clearing every gate — your first look each morning.',
  },
];

export default function Landing() {
  const authed = authEnabled();
  const startHref = authed ? '/sign-up' : '/app';
  const signInHref = authed ? '/sign-in' : '/app';

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.wordmark}>THRESHER</div>
        <nav className={styles.navLinks}>
          <Link href="/guide" className="deep-link mono">
            guide
          </Link>
          {authed && (
            <Link href={signInHref} className="deep-link mono" data-testid="landing-signin">
              sign in
            </Link>
          )}
          <Link href={startHref} className={styles.cta} data-testid="landing-cta">
            {authed ? 'Get started' : 'Open the board'} →
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.kicker}>technical confluence desk</div>
        <h1 className={styles.headline}>
          A complete trade story from entry to exit — or an honest refusal.
        </h1>
        <p className={styles.sub}>
          Thresher reads price and volume the way a disciplined technician does: it scores the
          confluence across trend, momentum, volume, and structure, then either lays out the full
          plan or tells you there isn’t one worth taking.
        </p>
        <div className={styles.heroCtas}>
          <Link href={startHref} className={styles.ctaLarge} data-testid="hero-cta">
            {authed ? 'Get started' : 'Open the board'} →
          </Link>
          <Link href="/guide" className={styles.ctaGhost}>
            See how it works
          </Link>
        </div>
      </section>

      <section className={styles.grid}>
        {VALUE_PROPS.map((v) => (
          <div key={v.title} className={styles.card}>
            <h2 className={styles.cardTitle}>{v.title}</h2>
            <p className={styles.cardBody}>{v.body}</p>
          </div>
        ))}
      </section>

      <Footer />
    </div>
  );
}
