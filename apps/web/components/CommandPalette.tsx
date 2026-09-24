'use client';

/**
 * Command palette (⌘K / Ctrl+K) — a global launcher on every app page. Search a
 * ticker (autocomplete → Analyze), jump to a page, open a followed stock, or a
 * methodology topic. Opened by the keyboard shortcut or the header button
 * (which dispatches the `thresher:command-palette` event).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SymbolMatch } from '../lib/contracts';
import { useFollows } from '../lib/follows-client';
import Logo from './Logo';
import styles from './CommandPalette.module.css';

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  /** ticker for a logo chip (symbol items) */
  ticker?: string;
  group: string;
}

const NAV: Item[] = [
  { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', group: 'Go to' },
  { id: 'nav-leaderboard', label: 'Leaderboard', href: '/leaderboard', group: 'Go to' },
  { id: 'nav-stocks', label: 'Stocks', href: '/stocks', group: 'Go to' },
  { id: 'nav-crypto', label: 'Crypto', href: '/crypto', group: 'Go to' },
  { id: 'nav-search', label: 'Search a ticker', href: '/analyze', group: 'Go to' },
  { id: 'nav-brokerage', label: 'Brokerages', href: '/brokerage', group: 'Go to' },
  { id: 'nav-guide', label: 'Guide', href: '/guide', group: 'Go to' },
  { id: 'nav-methodology', label: 'Methodology', href: '/methodology', group: 'Go to' },
  { id: 'nav-settings', label: 'Settings', href: '/settings', group: 'Go to' },
];

const METHODOLOGY: Item[] = [
  { id: 'm-gates', label: 'Gates', hint: 'methodology', href: '/methodology/engine/gates', group: 'Methodology' },
  { id: 'm-stops', label: 'Stops', hint: 'methodology', href: '/methodology/engine/stops', group: 'Methodology' },
  { id: 'm-targets', label: 'Targets', hint: 'methodology', href: '/methodology/engine/targets', group: 'Methodology' },
  { id: 'm-confidence', label: 'Confidence', hint: 'methodology', href: '/methodology/engine/confidence', group: 'Methodology' },
];

const matches = (item: Item, q: string) =>
  item.label.toLowerCase().includes(q) || (item.hint ?? '').toLowerCase().includes(q);

export default function CommandPalette() {
  const router = useRouter();
  const { symbols } = useFollows();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tickers, setTickers] = useState<SymbolMatch[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setTickers([]);
    setActive(0);
  }, []);

  // Global open: ⌘K / Ctrl+K, plus the header button's custom event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('thresher:command-palette', onEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('thresher:command-palette', onEvent);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced ticker autocomplete.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setTickers([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const body = (await res.json()) as { results?: SymbolMatch[] };
        if (seq.current === id) setTickers(body.results ?? []);
      } catch {
        if (seq.current === id) setTickers([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const followItems: Item[] = useMemo(
    () =>
      symbols.map((s) => ({
        id: `follow-${s}`,
        label: s,
        hint: 'following',
        href: `/analyze?symbol=${s}`,
        ticker: s,
        group: 'Following',
      })),
    [symbols],
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tickerItems: Item[] = tickers.map((t) => ({
      id: `ticker-${t.symbol}`,
      label: t.symbol,
      hint: t.name ?? undefined,
      href: `/analyze?symbol=${t.symbol}`,
      ticker: t.symbol,
      group: 'Tickers',
    }));
    if (!q) {
      // Default view: navigation + your watchlist.
      return [...NAV, ...followItems];
    }
    const staticMatches = [...NAV, ...METHODOLOGY, ...followItems].filter((i) => matches(i, q));
    // De-dupe a followed symbol that also comes back from the ticker search.
    const seen = new Set(staticMatches.map((i) => i.ticker).filter(Boolean));
    return [...staticMatches, ...tickerItems.filter((t) => !seen.has(t.ticker))];
  }, [query, tickers, followItems]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, items.length - 1)));
  }, [items.length]);

  const select = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      close();
      router.push(item.href);
    },
    [router, close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(items[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  if (!open) return null;

  // Group items in list order while keeping a flat index for keyboard nav.
  let lastGroup = '';

  return (
    <div className={styles.overlay} onMouseDown={close} data-testid="command-palette">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className={styles.input}
          data-testid="cmdk-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tickers, pages, methodology…"
          aria-label="Command palette search"
          autoComplete="off"
          spellCheck={false}
        />
        <ul className={styles.list} role="listbox">
          {items.length === 0 && <li className={styles.empty}>No matches</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id}>
                {header && <div className={styles.group}>{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                  data-testid={`cmdk-item-${item.id}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(item);
                  }}
                >
                  {item.ticker ? (
                    <Logo ticker={item.ticker} label={item.ticker} size={22} />
                  ) : (
                    <span className={styles.dot} aria-hidden="true" />
                  )}
                  <span className={styles.label}>{item.label}</span>
                  {item.hint && <span className={styles.hint}>{item.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
