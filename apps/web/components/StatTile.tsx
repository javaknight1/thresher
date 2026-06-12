'use client';

/**
 * One stat tile in the trade card (design §6.2 item 2): mono number with a
 * basis caption. The number deep-links to its methodology page when `href`
 * is given (design §6.5 — every displayed number is auditable).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './TradeCard.module.css';

export interface StatTileProps {
  label: string;
  value: string;
  color: 'amber' | 'long' | 'short';
  caption: ReactNode;
  testId: string;
  href?: string;
}

export default function StatTile({ label, value, color, caption, testId, href }: StatTileProps) {
  return (
    <div data-testid={testId} className={styles.tile}>
      <div className="kicker">{label}</div>
      <div className={`mono ${styles.tileValue}`} data-color={color}>
        {href ? (
          <Link href={href} className="deep-link">
            {value}
          </Link>
        ) : (
          value
        )}
      </div>
      <div className={styles.tileCaption}>{caption}</div>
    </div>
  );
}
