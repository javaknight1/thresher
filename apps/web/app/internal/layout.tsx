/**
 * /internal — a HIDDEN ops console (not linked in nav/palette; sign-in gated in
 * proxy.ts). Compact, tool-like chrome: a logo-only header + a side-nav across
 * the sections (Overview / Data browser / Integrity / Maintenance).
 */
import type { ReactNode } from 'react';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import InternalNav from './InternalNav';
import styles from './internal.module.css';

export const metadata = { title: 'Internal — Thresher', robots: { index: false } };

export default function InternalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader minimal />
      <div className={styles.shell}>
        <aside className={styles.side}>
          <div className={styles.sideHeading}>Internal</div>
          <InternalNav />
        </aside>
        <main className={styles.main} data-testid="internal-page">
          {children}
        </main>
      </div>
      <Footer minimal />
    </>
  );
}
