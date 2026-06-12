/**
 * Signal family grid — design §6.2 item 6. Four cards, each with a centered
 * −1…+1 score bar, the family weight, and every component's vote (▲/▼/•).
 * Every reason string the engine emitted renders here — nothing is hidden.
 */
import Link from 'next/link';
import { DEFAULT_CONFIG } from '@thresher/engine';
import type { AnalysisResult, Detail, FamilyKey } from '@thresher/engine';
import styles from './FamilyGrid.module.css';

const FAMILY_NAMES: Record<FamilyKey, string> = {
  trend: 'Trend',
  momentum: 'Momentum',
  volume: 'Volume',
  structure: 'Structure',
};

/** Composite must clear ±this for a direction call (engine config, not a UI number). */
const DIRECTION_THRESHOLD = DEFAULT_CONFIG.direction.threshold;
/**
 * A family reads BULLISH/BEARISH once |score| exceeds the engine's own notion of
 * a meaningful lean — the dissent threshold from the confidence penalties.
 */
const LEAN_THRESHOLD = DEFAULT_CONFIG.confidence.dissentThreshold;

/** Display sign with a true minus (U+2212), matching the prototype's typography. */
function signed(x: number, digits: number): string {
  return `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;
}

type Lean = 'bull' | 'bear' | 'flat';

function leanOf(score: number): Lean {
  if (score > LEAN_THRESHOLD) return 'bull';
  if (score < -LEAN_THRESHOLD) return 'bear';
  return 'flat';
}

const LEAN_WORD: Record<Lean, string> = { bull: 'BULLISH', bear: 'BEARISH', flat: 'NEUTRAL' };

function glyph(ok: Detail['ok']): string {
  if (ok > 0) return '▲';
  if (ok < 0) return '▼';
  return '•';
}

export interface FamilyGridProps {
  families: AnalysisResult['families'];
  composite: number;
}

export function FamilyGrid({ families, composite }: FamilyGridProps) {
  return (
    <section>
      <h2 className={`kicker ${styles.kicker}`}>
        Signal families · composite{' '}
        <Link href="/methodology/engine/composite" className="deep-link">
          {signed(composite, 3)}
        </Link>{' '}
        (long ≥ +{DIRECTION_THRESHOLD} · short ≤ −{DIRECTION_THRESHOLD})
      </h2>
      <div className={styles.grid} data-testid="family-grid">
        {families.map((f) => {
          const lean = leanOf(f.score);
          return (
            <article key={f.key} className={`panel ${styles.card}`} data-testid={`family-card-${f.key}`}>
              <header className={styles.cardHead}>
                <div>
                  <Link href="/methodology/engine/families" className={`deep-link ${styles.name}`}>
                    {FAMILY_NAMES[f.key]}
                  </Link>
                  <div className={`mono ${styles.weight}`}>
                    weight{' '}
                    <Link href="/methodology/engine/weights" className="deep-link">
                      {Math.round(f.weight * 100)}%
                    </Link>
                  </div>
                </div>
                <span className={`mono ${styles.word}`} data-lean={lean}>
                  {LEAN_WORD[lean]} {signed(f.score, 2)}
                </span>
              </header>
              <div className={styles.bar} aria-hidden="true">
                <span className={styles.barCenter} />
                <span
                  className={styles.barFill}
                  data-lean={lean}
                  style={{
                    left: f.score >= 0 ? '50%' : `${50 + f.score * 50}%`,
                    width: `${Math.abs(f.score) * 50}%`,
                  }}
                />
              </div>
              <ul className={styles.details}>
                {f.details.map((d, i) => (
                  <li key={i} className={styles.detail}>
                    <span className={`mono ${styles.glyph}`} data-ok={d.ok}>
                      {glyph(d.ok)}
                    </span>
                    <span className={styles.detailText}>{d.text}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default FamilyGrid;
