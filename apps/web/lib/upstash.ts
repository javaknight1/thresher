/**
 * One place to ask "is Upstash configured?" — the bar cache, profile cache,
 * scan-board store, and rate limiter all gate on the same pair of env vars, so
 * the check (and the exact env-var names) live here rather than copy-pasted
 * into each `createX()`.
 */
export function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
