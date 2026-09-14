'use client';

/**
 * Copy-the-current-URL button. On mobile it offers the native share sheet when
 * available; otherwise it copies the link to the clipboard and briefly confirms.
 * The Analyze URL carries ?symbol=&timeframe=, so a copied link reopens the
 * exact same analysis.
 */
import { useState } from 'react';
import styles from './ShareButton.module.css';

export default function ShareButton({ label = 'Copy link' }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = typeof window === 'undefined' ? '' : window.location.href;
    // Prefer the native share sheet where it exists (mobile).
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // user dismissed, or share failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (insecure context / denied) — nothing else to do
    }
  };

  return (
    <button
      type="button"
      className={styles.btn}
      data-testid="share-link"
      onClick={onClick}
      title="Copy a shareable link to this analysis"
    >
      <span aria-hidden="true" className={styles.icon}>
        {copied ? '✓' : '🔗'}
      </span>
      {copied ? 'Copied!' : label}
    </button>
  );
}
