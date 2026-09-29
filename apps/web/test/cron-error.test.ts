import { describe, expect, it } from 'vitest';
import { classifyCronError } from '../lib/cron-error';

const ctx = { scope: 'equity', timeframe: 'swing', universeSize: 20 };

describe('classifyCronError', () => {
  it('labels a subrequest-limit error as such even when it throws at the store stage', () => {
    // The real-world case: the invocation-wide subrequest counter trips on the
    // final Upstash write, so stage === "store" — but the cause is the scan.
    const err = new Error(
      'Too many subrequests by single Worker invocation. To configure this limit, refer to https://developers.cloudflare.com/workers/wrangler/configuration/#limits',
    );
    const out = classifyCronError(err, 'store', ctx);
    expect(out.reason).toBe('subrequest-limit');
    expect(out.message).toMatch(/subrequest limit/i);
    expect(out.message).toMatch(/reduce the scanned universe|Workers Paid/i);
    // Must NOT misattribute it to Upstash env vars.
    expect(out.message).not.toMatch(/UPSTASH_REDIS/);
  });

  it('classifies a CPU/time kill', () => {
    const out = classifyCronError(new Error('Worker exceeded CPU time limit'), 'scan', ctx);
    expect(out.reason).toBe('cpu-or-timeout');
    expect(out.message).toMatch(/CPU\/time budget/);
  });

  it('a genuine store error points at the Upstash env vars', () => {
    const out = classifyCronError(new Error('fetch failed: ECONNREFUSED'), 'store', ctx);
    expect(out.reason).toBe('store-config');
    expect(out.message).toMatch(/UPSTASH_REDIS_REST_URL/);
  });

  it('a scan-stage error with no known limit is treated as a provider error', () => {
    const out = classifyCronError(new Error('Yahoo 429 Too Many Requests'), 'scan', ctx);
    expect(out.reason).toBe('provider');
    expect(out.message).toMatch(/data-provider/);
  });

  it('a follows-stage error points at the follow store', () => {
    const out = classifyCronError(new Error('boom'), 'follows', ctx);
    expect(out.reason).toBe('follows');
    expect(out.message).toMatch(/follow-store/);
  });

  it('includes the scope/timeframe and symbol count in the message', () => {
    const out = classifyCronError(new Error('Too many subrequests'), 'store', {
      scope: 'crypto',
      timeframe: 'intraday',
      universeSize: 24,
    });
    expect(out.message).toMatch(/crypto\/intraday/);
    expect(out.message).toMatch(/24 symbols/);
  });

  it('falls back to unknown for an unclassified stage, echoing the raw error', () => {
    const out = classifyCronError('weird string error', 'mystery' as never, ctx);
    expect(out.reason).toBe('unknown');
    expect(out.message).toContain('weird string error');
  });
});
