'use client';

/**
 * Company context panel — display-only fundamentals (name, valuation, earnings,
 * analyst view, peers). Deliberately separate from the trade card: this is
 * external data (Yahoo), NOT part of the engine's signal, so it carries no
 * /methodology deep-links and a standing "context only" note. No predictive
 * phrasing anywhere.
 */
import type { ProfileResponse } from '../lib/api-types';
import styles from './CompanyPanel.module.css';

const DASH = '—';

function fmtMarketCap(x: number | null): string {
  if (x === null) return DASH;
  const abs = Math.abs(x);
  if (abs >= 1e12) return `$${(x / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(2)}M`;
  return `$${x.toFixed(0)}`;
}

function fmtVolume(x: number | null): string {
  if (x === null) return DASH;
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(x);
}

const fmtNum = (x: number | null, digits = 2): string => (x === null ? DASH : x.toFixed(digits));
const fmtPrice = (x: number | null): string => (x === null ? DASH : `$${x.toFixed(2)}`);
const fmtPct = (ratio: number | null): string =>
  ratio === null ? DASH : `${(ratio * 100).toFixed(2)}%`;
/** Earnings surprise is a decimal ratio (0.042 → +4.2%). */
const fmtSurprise = (ratio: number | null): string =>
  ratio === null ? DASH : `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100).toFixed(1)}%`;

function fmtDate(iso: string | null): string {
  if (iso === null) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? DASH
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CompanyPanel({
  data,
  onPeerSelect,
}: {
  data: ProfileResponse;
  onPeerSelect: (symbol: string) => void;
}) {
  const { profile, stale } = data;
  const f = profile.fundamentals;
  const range =
    f.fiftyTwoWeekLow !== null && f.fiftyTwoWeekHigh !== null
      ? `${fmtPrice(f.fiftyTwoWeekLow)} – ${fmtPrice(f.fiftyTwoWeekHigh)}`
      : DASH;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Market cap', value: fmtMarketCap(profile.marketCap) },
    { label: 'P/E (ttm)', value: fmtNum(f.trailingPE, 1) },
    { label: 'Fwd P/E', value: fmtNum(f.forwardPE, 1) },
    { label: 'EPS (ttm)', value: fmtPrice(f.trailingEps) },
    { label: 'Fwd EPS', value: fmtPrice(f.forwardEps) },
    { label: 'Beta', value: fmtNum(f.beta, 2) },
    { label: 'Div yield', value: fmtPct(f.dividendYield) },
    { label: 'PEG', value: fmtNum(f.pegRatio, 2) },
    { label: 'P/B', value: fmtNum(f.priceToBook, 2) },
    { label: '52-wk range', value: range },
    { label: 'Avg volume', value: fmtVolume(f.averageVolume) },
    { label: 'Shares out', value: fmtVolume(f.sharesOutstanding) },
  ];

  const subtitle = [profile.exchange, profile.sector, profile.industry].filter(Boolean).join(' · ');
  const a = profile.analyst;

  return (
    <section
      data-testid="company-panel"
      className={`panel ${styles.panel}`}
      aria-label="company context"
    >
      <header className={styles.head}>
        <div>
          <div className={styles.kicker}>
            COMPANY CONTEXT{stale && <span className={styles.stale}>STALE</span>}
          </div>
          <h2 className={styles.name}>{profile.name ?? profile.symbol}</h2>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        {profile.website && (
          <a
            className="deep-link mono"
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
          >
            website ↗
          </a>
        )}
      </header>

      {profile.description && <p className={styles.description}>{profile.description}</p>}

      <div className={styles.stats}>
        {stats.map((s) => (
          <div key={s.label} className={styles.stat}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={`mono ${styles.statValue}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.cols}>
        <div className={styles.col}>
          <div className={styles.colKicker}>
            EARNINGS{' '}
            <span className={styles.next}>next {fmtDate(profile.earnings.nextDate)}</span>
          </div>
          {profile.earnings.history.length > 0 ? (
            <table className={styles.earnings}>
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>Est.</th>
                  <th>Actual</th>
                  <th>Surprise</th>
                </tr>
              </thead>
              <tbody>
                {profile.earnings.history.map((q) => (
                  <tr key={q.quarter ?? `${q.epsActual}-${q.epsEstimate}`}>
                    <td>{fmtDate(q.quarter)}</td>
                    <td className="mono">{fmtPrice(q.epsEstimate)}</td>
                    <td className="mono">{fmtPrice(q.epsActual)}</td>
                    <td
                      className="mono"
                      data-sign={
                        q.surprisePercent === null ? 'na' : q.surprisePercent >= 0 ? 'pos' : 'neg'
                      }
                    >
                      {fmtSurprise(q.surprisePercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.empty}>No recent earnings history.</div>
          )}
        </div>

        <div className={styles.col}>
          <div className={styles.colKicker}>ANALYST VIEW</div>
          {a && (a.targetMean !== null || a.numberOfAnalysts !== null) ? (
            <div className={styles.analyst}>
              <div className={styles.analystRow}>
                <span>Mean target</span>
                <span className="mono">{fmtPrice(a.targetMean)}</span>
              </div>
              <div className={styles.analystRow}>
                <span>Range</span>
                <span className="mono">
                  {fmtPrice(a.targetLow)} – {fmtPrice(a.targetHigh)}
                </span>
              </div>
              <div className={styles.analystRow}>
                <span>Consensus</span>
                <span className="mono">{a.recommendation ?? DASH}</span>
              </div>
              <div className={styles.analystRow}>
                <span>Analysts</span>
                <span className="mono">{a.numberOfAnalysts ?? DASH}</span>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>No analyst coverage.</div>
          )}

          {profile.peers.length > 0 && (
            <>
              <div className={styles.colKicker}>PEERS</div>
              <div className={styles.peers}>
                {profile.peers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`mono ${styles.peer}`}
                    onClick={() => onPeerSelect(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className={styles.note}>
        Context only — fundamentals are not part of the engine&apos;s signal, which reads price and
        volume alone. Source: Yahoo Finance, as of {fmtDate(data.fetchedAt)}.
      </p>
    </section>
  );
}
