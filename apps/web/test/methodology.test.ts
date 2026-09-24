import { describe, expect, it } from 'vitest';
import {
  getExample,
  getLimitations,
  getOverview,
  getSection,
  listSlugs,
} from '../lib/methodology';

const INDICATOR_SLUGS = [
  'sma',
  'ema',
  'macd',
  'rsi',
  'atr',
  'adx',
  'obv',
  'relative-volume',
  'bollinger',
  'pivots',
];

const ENGINE_SLUGS = [
  'families',
  'weights',
  'composite',
  'confidence',
  'stops',
  'targets',
  'gates',
  'sizing',
];

const CRYPTO_SLUGS = [
  'scope',
  'asset-class',
  'changes',
  'profile',
  'earnings',
  'sizing',
  'volume',
  'guardrails',
  'example',
  'limitations',
];

// The public methodology pages must stay math-only: no repo paths, file names,
// hosting, or config-object identifiers (standing content rule).
const IMPL_LEAKS = [
  'packages/engine',
  'packages/options-engine',
  'apps/web',
  'config.ts',
  'CRYPTO_CONFIG',
  'DEFAULT_CONFIG',
  'THRESHER-DESIGN',
  'design doc',
  'Cloudflare',
  'Upstash',
  'Supabase',
  'Yahoo',
];

describe('lib/methodology', () => {
  it('exposes the expected slugs in order', () => {
    expect(listSlugs('indicators')).toEqual(INDICATOR_SLUGS);
    expect(listSlugs('engine')).toEqual(ENGINE_SLUGS);
    expect(listSlugs('crypto')).toEqual(CRYPTO_SLUGS);
  });

  it.each(INDICATOR_SLUGS)('indicator slug "%s" resolves to a non-empty section', (slug) => {
    const section = getSection('indicators', slug);
    expect(section).not.toBeNull();
    expect(section?.slug).toBe(slug);
    expect(section?.number).toMatch(/^I\.\d+$/);
    expect(section?.title.length).toBeGreaterThan(0);
    expect(section?.markdown.length).toBeGreaterThan(0);
  });

  it.each(ENGINE_SLUGS)('engine slug "%s" resolves to a non-empty section', (slug) => {
    const section = getSection('engine', slug);
    expect(section).not.toBeNull();
    expect(section?.slug).toBe(slug);
    expect(section?.number).toMatch(/^II\.\d+$/);
    expect(section?.title.length).toBeGreaterThan(0);
    expect(section?.markdown.length).toBeGreaterThan(0);
  });

  it.each(CRYPTO_SLUGS)('crypto slug "%s" resolves to a non-empty section', (slug) => {
    const section = getSection('crypto', slug);
    expect(section).not.toBeNull();
    expect(section?.slug).toBe(slug);
    expect(section?.number).toMatch(/^IV\.\d+$/);
    expect(section?.title.length).toBeGreaterThan(0);
    expect(section?.markdown.length).toBeGreaterThan(0);
  });

  it('every rendered section is math-only (no repo/impl/hosting references)', () => {
    const rendered = [
      getOverview(),
      ...INDICATOR_SLUGS.map((s) => getSection('indicators', s)?.markdown ?? ''),
      ...ENGINE_SLUGS.map((s) => getSection('engine', s)?.markdown ?? ''),
      ...CRYPTO_SLUGS.map((s) => getSection('crypto', s)?.markdown ?? ''),
    ].join('\n');
    for (const leak of IMPL_LEAKS) {
      expect(rendered, `rendered methodology leaks "${leak}"`).not.toContain(leak);
    }
  });

  it('returns null for unknown slugs', () => {
    expect(getSection('indicators', 'vwap')).toBeNull();
    expect(getSection('indicators', 'families')).toBeNull(); // wrong part
    expect(getSection('engine', 'rsi')).toBeNull(); // wrong part
    expect(getSection('engine', '')).toBeNull();
  });

  it('overview contains the pipeline diagram', () => {
    const overview = getOverview();
    expect(overview.length).toBeGreaterThan(0);
    expect(overview).toContain('Pipeline overview');
    expect(overview).toContain('Refusal gates G1–G5');
  });

  it('worked example (II.9) is present', () => {
    const example = getExample();
    expect(example.number).toBe('II.9');
    expect(example.markdown).toContain('QQXR');
  });

  it('limitations (II.10) carry the verbatim disclaimer', () => {
    const limitations = getLimitations();
    expect(limitations.number).toBe('II.10');
    expect(limitations.markdown).toContain('Nothing here is financial advice.');
  });
});
