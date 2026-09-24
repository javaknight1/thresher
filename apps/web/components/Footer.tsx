/**
 * Shared site footer — the same on every page (design: keep the main pages
 * clean, move reference links out of the headers). Carries the Guide and
 * Methodology links plus the standing disclaimer, which is required on every
 * page that shows a trade plan (methodology II.10) — rendering it here satisfies
 * that everywhere at once.
 */
import Link from 'next/link';
import Disclaimer from './Disclaimer';
import styles from './Footer.module.css';

export default function Footer({
  minimal = false,
  assetClass = 'equity',
}: {
  minimal?: boolean;
  /** Crypto pages get a 24/7 + unreliable-volume caveat in the disclaimer. */
  assetClass?: 'equity' | 'crypto';
}) {
  // Internal/tool pages: version only — no reference links or trade disclaimer.
  if (minimal) {
    return (
      <footer className={styles.footer} data-testid="site-footer">
        <nav className={styles.links} aria-label="version">
          {process.env.NEXT_PUBLIC_APP_VERSION && (
            <span className={styles.version} data-testid="app-version">
              v{process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          )}
        </nav>
      </footer>
    );
  }

  return (
    <footer className={styles.footer} data-testid="site-footer">
      <nav className={styles.links} aria-label="reference">
        <Link href="/guide" className="deep-link mono" data-testid="footer-guide">
          guide
        </Link>
        <Link href="/methodology" className="deep-link mono" data-testid="footer-methodology">
          methodology
        </Link>
        {process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN && (
          <a
            href="https://logo.dev"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.attribution}
          >
            Logos by Logo.dev
          </a>
        )}
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <span className={styles.version} data-testid="app-version">
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </span>
        )}
      </nav>
      <Disclaimer assetClass={assetClass} />
    </footer>
  );
}
