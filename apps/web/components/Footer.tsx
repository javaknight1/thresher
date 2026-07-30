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

export default function Footer() {
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
      </nav>
      <Disclaimer />
    </footer>
  );
}
