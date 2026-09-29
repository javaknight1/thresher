/**
 * Classify a cron-scan failure into a stable reason code + a human-readable,
 * one-line message safe to show in a CI annotation.
 *
 * Why not just key off the stage: the Cloudflare subrequest limit is an
 * invocation-wide counter, so it usually throws on the *final* store write even
 * though the *cause* is the scan fan-out. Keying the hint off `stage` alone
 * mislabels that as an Upstash/store problem ("check the env vars") when the real
 * fix is to shrink the scan. So we classify by the error's CONTENT first, then
 * fall back to the stage.
 */
export type CronStage = 'follows' | 'scan' | 'store';

export type CronFailureReason =
  | 'subrequest-limit'
  | 'cpu-or-timeout'
  | 'store-config'
  | 'provider'
  | 'follows'
  | 'unknown';

export interface CronFailure {
  reason: CronFailureReason;
  /** one-line, human-readable — safe for a CI annotation / log line */
  message: string;
}

export interface CronErrorContext {
  scope: string;
  timeframe: string;
  universeSize: number;
}

/** Raw "Name: message" for the error, for embedding in the human message. */
function rawText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export function classifyCronError(
  err: unknown,
  stage: CronStage,
  ctx: CronErrorContext,
): CronFailure {
  const raw = rawText(err);
  const text = raw.toLowerCase();
  const where = `${ctx.scope}/${ctx.timeframe}`;
  const n = ctx.universeSize;

  // 1) Subrequest budget — an invocation-wide counter, so it can trip during ANY
  //    stage (usually the final store write). Check FIRST so we never blame
  //    Upstash for what is really a too-large scan fan-out.
  if (text.includes('subrequest')) {
    return {
      reason: 'subrequest-limit',
      message:
        `Cloudflare's free-tier subrequest limit (50 per request) was exceeded while refreshing ` +
        `the ${where} board${n ? ` (${n} symbols)` : ''}. Each symbol costs several subrequests ` +
        `(bars, cache, earnings), so the fan-out is over budget — reduce the scanned universe ` +
        `(scan.maxUniverse / crypto.maxScanUniverse) or move to Workers Paid.`,
    };
  }

  // 2) Hard runtime kill (CPU time / memory). When caught, the message mentions
  //    CPU/time; the uncatchable variant surfaces as an edge 1101 (handled in the
  //    workflow, since the isolate is killed before this code runs).
  if (
    text.includes('exceeded cpu') ||
    text.includes('cpu time') ||
    text.includes('time limit') ||
    text.includes('never generate a response')
  ) {
    return {
      reason: 'cpu-or-timeout',
      message:
        `The ${where} refresh exceeded the Worker's CPU/time budget before finishing` +
        `${n ? ` (${n} symbols)` : ''}. Reduce the scanned universe or move to Workers Paid.`,
    };
  }

  // 3) Genuine store failure (not a subrequest trip). Missing/incorrect Upstash
  //    config or a transient Upstash error.
  if (stage === 'store' || text.includes('upstash') || text.includes('redis')) {
    return {
      reason: 'store-config',
      message:
        `Writing the ${where} board to the store failed — check the Upstash runtime env vars on ` +
        `the Worker (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Underlying error: ${raw}.`,
    };
  }

  // 4) Reading the followed universe failed.
  if (stage === 'follows') {
    return {
      reason: 'follows',
      message:
        `Reading the followed universe for ${where} failed — check the follow-store ` +
        `configuration. Underlying error: ${raw}.`,
    };
  }

  // 5) Scan stage, no known limit → almost always a transient data-provider error.
  if (stage === 'scan') {
    return {
      reason: 'provider',
      message:
        `The ${where} scan failed while fetching market data — usually a transient data-provider ` +
        `error or rate-limit. Underlying error: ${raw}.`,
    };
  }

  return {
    reason: 'unknown',
    message: `The ${where} refresh failed unexpectedly. Underlying error: ${raw}.`,
  };
}
