'use client';

/**
 * Symbol autocomplete — type a company name or ticker ("nvid" → NVIDIA) and pick
 * from a dropdown that shows each match's logo, ticker, and company name. Backed
 * by /api/v1/search (debounced). Keyboard-navigable (↑/↓/Enter/Esc).
 */
import { useEffect, useRef, useState } from 'react';
import type { SymbolMatch } from '../lib/contracts';
import Logo from './Logo';
import styles from './SymbolSearch.module.css';

interface Props {
  onSelect: (match: SymbolMatch) => void;
  placeholder?: string;
  /** clear the box after choosing (the "add to watchlist" flow) vs. keep the ticker */
  clearOnSelect?: boolean;
  autoFocus?: boolean;
  /** test-id prefix for the input/menu — scope it when two searches share a page */
  testId?: string;
}

export default function SymbolSearch({
  onSelect,
  placeholder = 'Search a company or ticker…',
  clearOnSelect = false,
  autoFocus = false,
  testId = 'symbol-search',
}: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Debounced query → /api/v1/search. A monotonic seq guards against out-of-order
  // responses (an earlier, slower request landing after a later one).
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
        });
        const body = (await res.json()) as { results?: SymbolMatch[] };
        if (seq.current === id) {
          setResults(body.results ?? []);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        if (seq.current === id) setResults([]);
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  // Close when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (m: SymbolMatch) => {
    onSelect(m);
    setOpen(false);
    if (clearOnSelect) {
      setQ('');
      setResults([]);
    } else {
      setQ(m.symbol);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = results[active] ?? results[0];
      if (m) choose(m);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <span className={styles.icon} aria-hidden="true">
        ⌕
      </span>
      <input
        className={styles.input}
        data-testid={`${testId}-input`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label="Search for a stock"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />
      {open && (
        <ul className={styles.menu} data-testid={`${testId}-menu`} role="listbox">
          {results.length === 0 && !loading && <li className={styles.empty}>No matches</li>}
          {results.map((m, i) => (
            <li
              key={m.symbol}
              role="option"
              aria-selected={i === active}
              className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
              data-testid={`search-result-${m.symbol}`}
              onMouseEnter={() => setActive(i)}
              // mousedown (not click) fires before the input blur that would close the menu
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
            >
              <Logo ticker={m.symbol} label={m.symbol} size={26} />
              <span className={styles.sym}>{m.symbol}</span>
              <span className={styles.name}>{m.name ?? m.exchange ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
