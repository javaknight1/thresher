/**
 * Upstash Management API — account-level usage for the /internal quota panel
 * (Tier B). This is a DIFFERENT credential from the Redis REST token: the
 * Management API (api.upstash.com) reports commands/storage/bandwidth used vs
 * the plan caps, which the data-plane token can't see.
 *
 * Auth: HTTP Basic, username = UPSTASH_EMAIL, password = UPSTASH_API_KEY.
 * Absent env => { configured: false }. SERVER-ONLY.
 */
const BASE = 'https://api.upstash.com/v2/redis';

/** Free-tier fallbacks, used only when the database endpoint doesn't report a limit. */
const FREE_TIER = {
  monthlyCommands: 500_000,
  storageBytes: 256 * 1024 * 1024, // 256 MB
};

export interface UpstashUsage {
  configured: boolean;
  error?: string;
  dbName?: string | null;
  region?: string | null;
  commandsThisMonth?: number | null;
  commandLimit?: number | null;
  storageBytes?: number | null;
  storageLimit?: number | null;
  bandwidthBytes?: number | null;
}

function creds(): { email: string; apiKey: string; id: string } | null {
  const email = process.env.UPSTASH_EMAIL;
  const apiKey = process.env.UPSTASH_API_KEY;
  const id = process.env.UPSTASH_REDIS_ID;
  return email && apiKey && id ? { email, apiKey, id } : null;
}

async function fetchJson(
  path: string,
  auth: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.status === 401 ? 'auth failed (401) — check email/API key' : `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: (await res.json()) as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// Per-isolate cache so a page reload doesn't hammer the Management API.
let cache: { at: number; value: UpstashUsage } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Current usage vs plan caps, or { configured:false } when the API creds are absent. */
export async function fetchUpstashUsage(now: () => number = Date.now): Promise<UpstashUsage> {
  if (cache && now() - cache.at < TTL_MS) return cache.value;

  const c = creds();
  if (!c) return { configured: false };

  const auth = Buffer.from(`${c.email}:${c.apiKey}`).toString('base64');
  const [stats, db] = await Promise.all([
    fetchJson(`/stats/${c.id}`, auth),
    fetchJson(`/database/${c.id}`, auth),
  ]);

  if (!stats.ok) {
    const value: UpstashUsage = { configured: true, error: stats.error };
    cache = { at: now(), value };
    return value;
  }

  const s = stats.data;
  const d = db.ok ? db.data : {};
  const value: UpstashUsage = {
    configured: true,
    dbName: str(d.database_name) ?? str(d.database_id),
    region: str(d.region) ?? str(d.primary_region),
    commandsThisMonth: num(s.total_monthly_requests),
    commandLimit: num(d.db_request_limit) ?? FREE_TIER.monthlyCommands,
    storageBytes: num(s.current_storage) ?? num(s.total_monthly_storage),
    storageLimit: num(d.db_disk_threshold) ?? FREE_TIER.storageBytes,
    bandwidthBytes: num(s.total_monthly_bandwidth),
  };
  cache = { at: now(), value };
  return value;
}
