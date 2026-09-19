import { describe, it, expect } from 'vitest';
import { normalizePrefs, resolveTheme } from '../lib/prefs';
import { DEFAULT_PREFS } from '../lib/config';

describe('normalizePrefs', () => {
  it('returns the defaults for empty / nullish input', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({})).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid fields and drops invalid ones back to defaults', () => {
    const out = normalizePrefs({
      theme: 'light',
      defaultTimeframe: 'position',
      riskPct: 2,
      boardTab: 'following',
      boardDirection: 'long',
      boardMinRR: 1.5,
      boardSort: 'rr',
    });
    expect(out.theme).toBe('light');
    expect(out.defaultTimeframe).toBe('position');
    expect(out.riskPct).toBe(2);
    expect(out.boardTab).toBe('following');
    expect(out.boardDirection).toBe('long');
    expect(out.boardMinRR).toBe(1.5);
    expect(out.boardSort).toBe('rr');
  });

  it('rejects out-of-range / wrong-type values', () => {
    const out = normalizePrefs({
      theme: 'ultraviolet',
      defaultTimeframe: 'yearly',
      riskPct: 7, // not an offered step
      boardMinRR: 5, // not an offered floor
      boardSort: 'lucky',
    });
    expect(out.theme).toBe(DEFAULT_PREFS.theme);
    expect(out.defaultTimeframe).toBe(DEFAULT_PREFS.defaultTimeframe);
    expect(out.riskPct).toBe(DEFAULT_PREFS.riskPct);
    expect(out.boardMinRR).toBe(DEFAULT_PREFS.boardMinRR);
    expect(out.boardSort).toBe(DEFAULT_PREFS.boardSort);
  });

  it('sanitizes the account-size string to digits and dots', () => {
    expect(normalizePrefs({ accountSize: '$12,500.50' }).accountSize).toBe('12500.50');
    expect(normalizePrefs({ accountSize: 25000 }).accountSize).toBe(DEFAULT_PREFS.accountSize);
  });

  it('is a merge — a partial patch keeps the rest at defaults', () => {
    const out = normalizePrefs({ theme: 'dark' });
    expect(out).toEqual({ ...DEFAULT_PREFS, theme: 'dark' });
  });
});

describe('resolveTheme', () => {
  it('passes explicit choices through', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system to dark when no matchMedia is available (SSR/node)', () => {
    expect(resolveTheme('system')).toBe('dark');
  });
});
