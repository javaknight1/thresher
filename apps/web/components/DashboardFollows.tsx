'use client';

/**
 * Dashboard watchlist block — an autocomplete search to add follows and the
 * leaderboard-style followed list below it. Selecting a search result follows
 * the symbol (unless already followed or at the cap).
 */
import SymbolSearch from './SymbolSearch';
import FollowedList from './FollowedList';
import { useFollows } from '../lib/follows-client';
import styles from './DashboardFollows.module.css';

export default function DashboardFollows() {
  const { isFollowing, toggle, symbols, max } = useFollows();
  const atCap = max !== null && symbols.length >= max;

  return (
    <section className={styles.wrap} data-testid="dashboard-follows">
      <div className={styles.head}>
        <h2 className={styles.title}>Your watchlist</h2>
        <span className={styles.count}>
          {symbols.length}
          {max !== null && <span className={styles.of}> / {max}</span>}
        </span>
      </div>

      <SymbolSearch
        clearOnSelect
        placeholder="Search a company or ticker to follow…"
        onSelect={(m) => {
          if (!isFollowing(m.symbol) && !atCap) void toggle(m.symbol);
        }}
      />
      {atCap && (
        <div className={styles.capNote}>
          You’ve reached the {max}-symbol limit. Unfollow one to add another.
        </div>
      )}

      <div className={styles.listWrap}>
        <FollowedList />
      </div>
    </section>
  );
}
