'use client';

/**
 * Dashboard watchlist block — an autocomplete search to add follows and the
 * leaderboard-style followed list below it. Selecting a search result follows
 * the symbol (unless already followed or at the cap).
 */
import SymbolSearch from './SymbolSearch';
import FollowedList from './FollowedList';
import { useFollows, type FollowScope } from '../lib/follows-client';
import { assetClassOf } from '../lib/asset-class';
import styles from './DashboardFollows.module.css';

export default function DashboardFollows({ scope = 'equity' }: { scope?: FollowScope } = {}) {
  const { isFollowing, toggle, symbols, max } = useFollows(scope);
  const atCap = max !== null && symbols.length >= max;
  const isCrypto = scope === 'crypto';

  return (
    <section
      className={styles.wrap}
      data-testid={isCrypto ? 'dashboard-crypto-follows' : 'dashboard-follows'}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{isCrypto ? 'Your crypto watchlist' : 'Your watchlist'}</h2>
        <span className={styles.count}>
          {symbols.length}
          {max !== null && <span className={styles.of}> / {max}</span>}
        </span>
      </div>

      <SymbolSearch
        clearOnSelect
        placeholder={
          isCrypto ? 'Search a coin to follow (e.g. BTC-USD)…' : 'Search a company or ticker to follow…'
        }
        onSelect={(m) => {
          // The crypto watchlist only follows coins; the equity one only stocks.
          if (isCrypto !== (assetClassOf(m.symbol) === 'crypto')) return;
          if (!isFollowing(m.symbol) && !atCap) void toggle(m.symbol);
        }}
      />
      {atCap && (
        <div className={styles.capNote}>
          You’ve reached the {max}-symbol limit. Unfollow one to add another.
        </div>
      )}

      <div className={styles.listWrap}>
        <FollowedList scope={scope} />
      </div>
    </section>
  );
}
