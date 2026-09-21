'use client';

import { useState } from 'react';
import styles from './internal.module.css';

type Result = { ok: boolean; message: string } | null;

async function call(body: Record<string, unknown>): Promise<Result> {
  try {
    const res = await fetch('/api/internal/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Result;
  } catch {
    return { ok: false, message: 'request failed' };
  }
}

export default function MaintenancePanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [symbol, setSymbol] = useState('');
  const [key, setKey] = useState('');

  const run = async (id: string, body: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(id);
    const r = await call(body);
    setResults((s) => ({ ...s, [id]: r }));
    setBusy(null);
  };

  const Res = ({ id }: { id: string }) => {
    const r = results[id];
    if (!r) return null;
    return (
      <span className={styles.result} data-testid={`result-${id}`}>
        {r.ok ? '✓ ' : '✗ '}
        {r.message}
      </span>
    );
  };

  return (
    <section className={styles.card}>
      <div className={styles.actionRow}>
        <button
          className={styles.btn}
          disabled={busy !== null}
          onClick={() => run('scan', { action: 'scan' })}
          data-testid="action-scan"
        >
          Run scan now
        </button>
        <span className={styles.dim}>refresh all boards + capture earnings</span>
        <Res id="scan" />
      </div>

      <div className={styles.actionRow}>
        <input
          className={styles.input}
          placeholder="SYMBOL"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          aria-label="symbol to refresh"
        />
        <button
          className={styles.btn}
          disabled={busy !== null || !symbol}
          onClick={() => run('refresh', { action: 'refresh', symbol })}
          data-testid="action-refresh"
        >
          Force-refresh bars
        </button>
        <span className={styles.dim}>bust cached bars so the next analysis re-fetches</span>
        <Res id="refresh" />
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.btn}
          disabled={busy !== null}
          onClick={() =>
            run('prune', { action: 'prune-universe' }, 'Remove any 0-follower symbols from the scan universe?')
          }
          data-testid="action-prune"
        >
          Prune universe drift
        </button>
        <span className={styles.dim}>remove 0-follower symbols from the scan universe</span>
        <Res id="prune" />
      </div>

      <div className={styles.actionRow}>
        <input
          className={styles.input}
          placeholder="exact key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="key to delete"
        />
        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          disabled={busy !== null || !key}
          onClick={() => run('del', { action: 'del', key }, `Delete key "${key}"? This cannot be undone.`)}
          data-testid="action-del"
        >
          Delete key
        </button>
        <Res id="del" />
      </div>
    </section>
  );
}
