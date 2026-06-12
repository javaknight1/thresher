'use client';

/**
 * Signal-agreement bar. The label is "SIGNAL AGREEMENT" — never
 * "probability" or "win rate" — a CLAUDE.md hard product rule until the
 * calibration pipeline exists. Color and word come from the engine's bucket.
 */
import Link from 'next/link';
import type { Confidence } from '@thresher/engine';
import styles from './TradeCard.module.css';

const BUCKET_WORD = { high: 'HIGH', moderate: 'MODERATE', low: 'LOW' } as const;

export default function ConfidenceBar({ confidence }: { confidence: Confidence }) {
  const { score, bucket } = confidence;
  return (
    <div data-testid="confidence-bar">
      <div className={styles.confHead}>
        <span className="kicker">Signal agreement</span>
        <span className={`mono ${styles.confScore}`} data-bucket={bucket}>
          <Link href="/methodology/engine/confidence" className="deep-link">
            {score} / 100
          </Link>{' '}
          · {BUCKET_WORD[bucket]}
        </span>
      </div>
      <div
        className={styles.confTrack}
        role="meter"
        aria-label="signal agreement"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <div className={styles.confFill} data-bucket={bucket} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
