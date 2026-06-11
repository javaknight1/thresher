import { describe, expect, it } from 'vitest';
import { computeConfidence, type ConfidenceInput } from '../src/confidence';
import { DEFAULT_CONFIG } from '../src/config';
import type { FamilyKey } from '../src/types';

const cfg = DEFAULT_CONFIG;

const noFlags = {
  choppy: false,
  rsiHot: false,
  rsiCold: false,
  thin: false,
  earningsInWindow: false,
};

const allFlags = {
  choppy: true,
  rsiHot: true,
  rsiCold: true,
  thin: true,
  earningsInWindow: true,
};

function fam(key: FamilyKey, score: number): { key: FamilyKey; score: number } {
  return { key, score };
}

describe('computeConfidence — base', () => {
  it('caps the base at 95: |S| = 1 gives 95, not 110', () => {
    const input: ConfidenceInput = {
      composite: 1,
      direction: 'long',
      families: [],
      flags: noFlags,
    };
    const result = computeConfidence(input, cfg);
    expect(result.score).toBe(95);
    expect(result.bucket).toBe('high');
    expect(result.penalties).toEqual([]);
  });

  it('clamps to the 5 floor under huge penalties', () => {
    // All four families dissent (-8 each) + choppy -12 + rsiHot -8 + thin -5
    // + earnings -10 = -67; base 35 + 0 => 35 - 67 = -32 → clamps to 5.
    const input: ConfidenceInput = {
      composite: 0,
      direction: 'long',
      families: [
        fam('trend', -0.5),
        fam('momentum', -0.5),
        fam('volume', -0.5),
        fam('structure', -0.5),
      ],
      flags: allFlags,
    };
    const result = computeConfidence(input, cfg);
    expect(result.score).toBe(5);
    expect(result.bucket).toBe('low');
  });
});

describe('computeConfidence — II.9 worked example', () => {
  it('QQXR swing: composite +0.745, thin volume only → 86, high', () => {
    const input: ConfidenceInput = {
      composite: 0.745,
      direction: 'long',
      families: [
        fam('trend', 0.8),
        fam('momentum', 0.9),
        fam('volume', 0.5),
        fam('structure', 0.6),
      ],
      flags: { ...noFlags, thin: true },
    };
    const result = computeConfidence(input, cfg);
    // base 35 + 0.745×75 = 90.875; − 5 = 85.875 → rounds to 86
    expect(result.score).toBe(86);
    expect(result.bucket).toBe('high');
    expect(result.penalties).toEqual([
      { reason: 'Thin volume — weak participation', points: -5 },
    ]);
  });

  it('counterfactual: composite +0.25, choppy + momentum dissent + thin → 29, low', () => {
    const input: ConfidenceInput = {
      composite: 0.25,
      direction: 'long',
      families: [
        fam('trend', 0.5),
        fam('momentum', -0.4),
        fam('volume', 0.5),
        fam('structure', 0.6),
      ],
      flags: { ...noFlags, choppy: true, thin: true },
    };
    const result = computeConfidence(input, cfg);
    // base 35 + 0.25×75 = 53.75; − (12 + 8 + 5) = 28.75 → rounds to 29
    expect(result.score).toBe(29);
    expect(result.bucket).toBe('low');
    expect(result.penalties).toEqual([
      { reason: 'ADX below 18 — choppy tape', points: -12 },
      { reason: 'Momentum family disagrees with the trade', points: -8 },
      { reason: 'Thin volume — weak participation', points: -5 },
    ]);
  });
});

describe('computeConfidence — penalties only apply with a direction', () => {
  it('direction none → no penalties even with all flags set and dissenters', () => {
    const input: ConfidenceInput = {
      composite: 0.1,
      direction: 'none',
      families: [fam('trend', -0.9), fam('momentum', 0.9)],
      flags: allFlags,
    };
    const result = computeConfidence(input, cfg);
    expect(result.penalties).toEqual([]);
    // base = 35 + 0.1×75 = 42.5 → rounds to 43 (low/moderate boundary check is separate)
    expect(result.score).toBe(43);
  });
});

describe('computeConfidence — dissent threshold is strict', () => {
  it('opposing family at exactly |0.15| does NOT dissent', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [fam('momentum', -0.15)],
      flags: noFlags,
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([]);
  });

  it('opposing family at |0.16| dissents with the family name capitalized', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [fam('momentum', -0.16)],
      flags: noFlags,
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([
      { reason: 'Momentum family disagrees with the trade', points: -8 },
    ]);
  });

  it('a short is dissented by a positive family, not a negative one', () => {
    const input: ConfidenceInput = {
      composite: -0.5,
      direction: 'short',
      families: [fam('trend', 0.16), fam('volume', -0.9)],
      flags: noFlags,
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([
      { reason: 'Trend family disagrees with the trade', points: -8 },
    ]);
  });

  it('aligned families never dissent regardless of magnitude', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [fam('trend', 1), fam('momentum', 0.16)],
      flags: noFlags,
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([]);
  });
});

describe('computeConfidence — RSI extreme penalty is direction-specific', () => {
  it('rsiHot penalizes a long', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [],
      flags: { ...noFlags, rsiHot: true },
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([
      { reason: 'RSI overbought against a fresh long', points: -8 },
    ]);
  });

  it('rsiHot on a SHORT applies no penalty', () => {
    const input: ConfidenceInput = {
      composite: -0.5,
      direction: 'short',
      families: [],
      flags: { ...noFlags, rsiHot: true },
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([]);
  });

  it('rsiCold penalizes a short', () => {
    const input: ConfidenceInput = {
      composite: -0.5,
      direction: 'short',
      families: [],
      flags: { ...noFlags, rsiCold: true },
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([
      { reason: 'RSI oversold against a fresh short', points: -8 },
    ]);
  });

  it('rsiCold on a LONG applies no penalty', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [],
      flags: { ...noFlags, rsiCold: true },
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([]);
  });
});

describe('computeConfidence — registry order and remaining penalties', () => {
  it('emits earnings penalty with its reason string', () => {
    const input: ConfidenceInput = {
      composite: 0.5,
      direction: 'long',
      families: [],
      flags: { ...noFlags, earningsInWindow: true },
    };
    expect(computeConfidence(input, cfg).penalties).toEqual([
      { reason: 'Earnings within the veto window', points: -10 },
    ]);
  });

  it('orders penalties: choppy, dissent (family order), rsi, thin, earnings', () => {
    const input: ConfidenceInput = {
      composite: 0.3,
      direction: 'long',
      families: [fam('volume', -0.2), fam('structure', -0.2)],
      flags: { choppy: true, rsiHot: true, rsiCold: false, thin: true, earningsInWindow: true },
    };
    const reasons = computeConfidence(input, cfg).penalties.map((p) => p.reason);
    expect(reasons).toEqual([
      'ADX below 18 — choppy tape',
      'Volume family disagrees with the trade',
      'Structure family disagrees with the trade',
      'RSI overbought against a fresh long',
      'Thin volume — weak participation',
      'Earnings within the veto window',
    ]);
  });
});

describe('computeConfidence — buckets', () => {
  it('70 is high, 69 is moderate, 45 is moderate, 44 is low', () => {
    // base = 35 + |S|×75: pick composites that land exactly on the boundaries.
    const at = (composite: number, direction: 'long' | 'none' = 'none') =>
      computeConfidence({ composite, direction, families: [], flags: noFlags }, cfg);
    expect(at(35 / 75).score).toBe(70); // base 70
    expect(at(35 / 75).bucket).toBe('high');
    expect(at(34 / 75).score).toBe(69);
    expect(at(34 / 75).bucket).toBe('moderate');
    expect(at(10 / 75).score).toBe(45);
    expect(at(10 / 75).bucket).toBe('moderate');
    expect(at(9 / 75).score).toBe(44);
    expect(at(9 / 75).bucket).toBe('low');
  });
});
