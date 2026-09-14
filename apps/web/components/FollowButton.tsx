'use client';

/**
 * ★ Follow toggle for a symbol. Shares the app-wide follows store, so following
 * here updates the board's "Following" tab and the dashboard manager too.
 * Disabled (with a hint) when adding would exceed the per-user cap.
 */
import { useState } from 'react';
import { useFollows } from '../lib/follows-client';
import styles from './FollowButton.module.css';

export default function FollowButton({ symbol }: { symbol: string }) {
  const { isFollowing, toggle, symbols, max } = useFollows();
  const [busy, setBusy] = useState(false);
  const following = isFollowing(symbol);
  const atCap = !following && symbols.length >= max;

  const onClick = async () => {
    setBusy(true);
    await toggle(symbol);
    setBusy(false);
  };

  return (
    <button
      type="button"
      className={`${styles.btn} ${following ? styles.on : ''}`}
      data-testid={`follow-${symbol}`}
      aria-pressed={following}
      disabled={busy || atCap}
      onClick={onClick}
      title={
        atCap
          ? `You can follow up to ${max} symbols`
          : following
            ? `Unfollow ${symbol}`
            : `Follow ${symbol}`
      }
    >
      <span aria-hidden="true" className={styles.star}>
        {following ? '★' : '☆'}
      </span>
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
