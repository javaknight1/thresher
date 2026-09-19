'use client';

/**
 * Client-side preferences store, shared across the app via a module-level
 * snapshot + useSyncExternalStore (mirrors lib/follows-client). One source of
 * truth so a change in /settings updates every consumer (theme, default
 * timeframe, sizer, board) live.
 *
 * Persistence, most-durable first:
 *   - Signed in (Clerk configured): Clerk `unsafeMetadata.prefs` — follows the
 *     user across devices. Registered by <PrefsBoot>'s Clerk bridge.
 *   - Always: localStorage (`thresher:prefs`) — the open-mode store (CI / e2e /
 *     keyless), and a synchronous cache the pre-paint theme script reads.
 *
 * DISPLAY / CONVENIENCE ONLY — prefs never change engine math (CLAUDE.md).
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  type Prefs,
  type ThemePref,
} from './config';

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];
const TIMEFRAMES: readonly Prefs['defaultTimeframe'][] = ['intraday', 'swing', 'position'];
const RISK_PCTS: readonly number[] = [0.5, 1, 2, 3];
const BOARD_TABS: readonly Prefs['boardTab'][] = [
  'top', 'following', 'intraday', 'swing', 'position',
];
const BOARD_DIRECTIONS: readonly Prefs['boardDirection'][] = ['all', 'long', 'short'];
const BOARD_MIN_RRS: readonly number[] = [0, 1.5, 2, 3];
const BOARD_SORTS: readonly Prefs['boardSort'][] = ['score', 'quality', 'rr', 'confidence'];

/** Merge an untrusted blob over the defaults, dropping any invalid field. */
export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    theme: pick(r.theme, THEMES, DEFAULT_PREFS.theme),
    defaultTimeframe: pick(r.defaultTimeframe, TIMEFRAMES, DEFAULT_PREFS.defaultTimeframe),
    accountSize:
      typeof r.accountSize === 'string'
        ? r.accountSize.replace(/[^0-9.]/g, '')
        : DEFAULT_PREFS.accountSize,
    riskPct: pick(r.riskPct, RISK_PCTS, DEFAULT_PREFS.riskPct),
    boardTab: pick(r.boardTab, BOARD_TABS, DEFAULT_PREFS.boardTab),
    boardDirection: pick(r.boardDirection, BOARD_DIRECTIONS, DEFAULT_PREFS.boardDirection),
    boardMinRR: pick(r.boardMinRR, BOARD_MIN_RRS, DEFAULT_PREFS.boardMinRR),
    boardSort: pick(r.boardSort, BOARD_SORTS, DEFAULT_PREFS.boardSort),
  };
}

// ---- module state -------------------------------------------------------

let state: Prefs = DEFAULT_PREFS;
let loaded = false;
const subscribers = new Set<() => void>();
/** Registered by the Clerk bridge when signed in; persists prefs remotely. */
let remotePersist: ((prefs: Prefs) => void) | null = null;

function emit(): void {
  for (const cb of subscribers) cb();
}

function readLocal(): Prefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    return raw ? normalizePrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(prefs: Prefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Resolve the theme to the concrete 'light'|'dark' actually painted. */
export function resolveTheme(theme: ThemePref): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** Reflect the current theme onto <html data-theme>. Base tokens = dark. */
export function applyTheme(theme: ThemePref): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}

// Re-apply when the OS theme flips, but only while the pref is 'system'.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme('system');
  });
}

let hydrateStarted = false;
/** First-subscribe hydration: pull localStorage into the store + apply theme. */
function hydrate(): void {
  if (hydrateStarted) return;
  hydrateStarted = true;
  const local = readLocal();
  if (local) state = local;
  loaded = true;
  applyTheme(state.theme);
  emit();
}

/**
 * Load prefs from the signed-in Clerk user and register the remote persister.
 * Remote wins over the local cache when present (cross-device consistency);
 * the merged result is also cached to localStorage so the pre-paint script and
 * open-mode fallback stay current.
 */
export function registerRemoteBackend(remotePrefs: unknown, persist: (prefs: Prefs) => void): void {
  remotePersist = persist;
  if (remotePrefs != null) {
    state = normalizePrefs(remotePrefs);
    writeLocal(state);
  }
  loaded = true;
  applyTheme(state.theme);
  emit();
}

// Remote (Clerk) writes are debounced so a burst of edits (typing an account
// size) collapses into one metadata update; localStorage stays immediate.
let remoteTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRemote(): void {
  if (!remotePersist) return;
  if (remoteTimer) clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    remoteTimer = null;
    remotePersist?.(state);
  }, 600);
}

/** Update one or more prefs; persists to every configured backend. */
export function setPrefs(patch: Partial<Prefs>): void {
  state = normalizePrefs({ ...state, ...patch });
  loaded = true;
  writeLocal(state);
  scheduleRemote();
  applyTheme(state.theme);
  emit();
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  setPrefs({ [key]: value } as Partial<Prefs>);
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  hydrate();
  return () => subscribers.delete(cb);
}
function getSnapshot(): Prefs {
  return state;
}
// SSR + first hydration render use defaults; the real prefs arrive after mount,
// so there is no hydration mismatch (the follows-client pattern).
function getServerSnapshot(): Prefs {
  return DEFAULT_PREFS;
}
function subscribeLoaded(cb: () => void): () => void {
  return subscribe(cb);
}
function getLoaded(): boolean {
  return loaded;
}

export interface UsePrefs {
  prefs: Prefs;
  /** false until the store has hydrated (from localStorage or Clerk) */
  loaded: boolean;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
}

export function usePrefs(): UsePrefs {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isLoaded = useSyncExternalStore(subscribeLoaded, getLoaded, () => false);
  const setPrefCb = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPref(key, value),
    [],
  );
  return { prefs, loaded: isLoaded, setPref: setPrefCb, setPrefs };
}
