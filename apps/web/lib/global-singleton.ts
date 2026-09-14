/**
 * Cache a value on globalThis so it survives Next.js dev-mode HMR — which
 * re-evaluates modules and would otherwise reset a plain module-level singleton
 * (losing in-memory state between navigations) — and is shared across every
 * route in the same process. Harmless in production. Used for the in-memory
 * fallback stores (bar cache, profile cache, scan board, rate limiter, follows).
 */
export function globalSingleton<T>(key: string, factory: () => T): T {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  if (!(key in g)) g[key] = factory();
  return g[key] as T;
}
