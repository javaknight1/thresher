'use client';

/**
 * Dashboard "Following" manager — the user's watchlist. Add a ticker, unfollow
 * one, and jump to its analysis. Shares the app-wide follows store, so changes
 * here reflect on the board's Following tab and the ★ button immediately.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useFollows } from '../lib/follows-client';
import { normalizeSymbol } from '../lib/follow-store';
import styles from './FollowingManager.module.css';

const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;

export default function FollowingManager() {
  const { symbols, max, loaded, isFollowing, toggle } = useFollows();
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atCap = symbols.length >= max;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = normalizeSymbol(input);
    setMsg(null);
    if (!SYMBOL_PATTERN.test(sym)) {
      setMsg('Enter a valid ticker (e.g. NVDA).');
      return;
    }
    if (isFollowing(sym)) {
      setMsg(`Already following ${sym}.`);
      setInput('');
      return;
    }
    if (atCap) {
      setMsg(`You can follow up to ${max} symbols. Unfollow one first.`);
      return;
    }
    setBusy(true);
    const res = await toggle(sym);
    setBusy(false);
    if (res.ok) setInput('');
    else setMsg(res.error ?? 'Could not follow that symbol.');
  };

  return (
    <section className={styles.wrap} data-testid="following-manager">
      <div className={styles.head}>
        <h2 className={styles.title}>Following</h2>
        <span className={styles.count}>
          {symbols.length} / {max}
        </span>
      </div>

      <form className={styles.addRow} onSubmit={add}>
        <input
          className={styles.input}
          data-testid="follow-add-input"
          placeholder="Add a ticker…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={10}
          aria-label="Add a ticker to follow"
        />
        <button className={styles.addBtn} type="submit" disabled={busy || atCap}>
          Add
        </button>
      </form>
      {msg && (
        <div className={styles.msg} data-testid="follow-msg">
          {msg}
        </div>
      )}

      {loaded && symbols.length === 0 && (
        <div className={styles.empty}>
          You’re not following anything yet. Add a ticker above, or tap ☆ Follow on any analysis.
        </div>
      )}

      <ul className={styles.list}>
        {symbols.map((sym) => (
          <li key={sym} className={styles.item} data-testid={`following-${sym}`}>
            <Link href={`/analyze?symbol=${sym}`} className={styles.symbol}>
              {sym}
            </Link>
            <button
              className={styles.remove}
              data-testid={`unfollow-${sym}`}
              onClick={() => void toggle(sym)}
              title={`Unfollow ${sym}`}
              aria-label={`Unfollow ${sym}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
