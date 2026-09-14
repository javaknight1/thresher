/**
 * PageHero — the shared gradient header used across the app (introduced on the
 * dashboard). A rounded, amber/green-tinted panel with an optional kicker, a
 * bold title, a subtitle, and an optional right-side actions slot. Keeps every
 * top-of-page consistent.
 */
import type { ReactNode } from 'react';
import styles from './PageHero.module.css';

export default function PageHero({
  kicker,
  title,
  children,
  actions,
  testid,
}: {
  kicker?: string;
  title: string;
  /** subtitle / description */
  children?: ReactNode;
  /** right-side slot (buttons, etc.) */
  actions?: ReactNode;
  testid?: string;
}) {
  return (
    <section className={styles.hero} data-testid={testid}>
      <div className={styles.text}>
        {kicker && <div className={styles.kicker}>{kicker}</div>}
        <h1 className={styles.title}>{title}</h1>
        {children && <p className={styles.sub}>{children}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}
