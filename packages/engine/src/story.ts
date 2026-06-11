/**
 * Trade-story generator: assembles drivers, levels, caveats, and penalty
 * reasons into the narrative paragraph (design §6.2 item 5). Pure string
 * assembly — every number it cites was computed upstream.
 */
import type {
  Confidence,
  Direction,
  EngineFlags,
  FamilyResult,
  Plan,
  Refusal,
  Timeframe,
} from './types';
import type { EngineConfig } from './config';
import { fmtPrice } from './util';

export interface StoryInput {
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  families: readonly FamilyResult[];
  confidence: Confidence;
  plan: Plan | null;
  refusal: Refusal | null;
  levels: { support: number; resistance: number };
  flags: EngineFlags;
}

/** Families that meaningfully drove the call, strongest first. */
function drivers(families: readonly FamilyResult[], threshold: number): string {
  const lead = families
    .filter((f) => Math.abs(f.score) >= threshold)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map((f) => f.key);
  return lead.length > 0 ? lead.join(', ') : 'a mild balance of signals';
}

export function buildStory(input: StoryInput, cfg: EngineConfig): string {
  const { symbol, timeframe, direction, plan, refusal, levels, confidence, flags } = input;
  const watching = `Watching resistance ${fmtPrice(levels.resistance)} and support ${fmtPrice(levels.support)}.`;

  if (refusal !== null && refusal.gate === 'G1') {
    return (
      'Signal families net out near zero — no edge in either direction. ' +
      'The engine requires confluence before it will hand you a trade. ' +
      watching
    );
  }

  if (refusal !== null || plan === null) {
    const lean = direction === 'none' ? 'flat' : direction.toUpperCase();
    const reason = refusal ? refusal.reason : 'no plan available';
    return `${symbol} leans ${lean} on the ${timeframe} timeframe, but the engine refuses the trade — ${reason}. ${watching}`;
  }

  const dirWord = direction.toUpperCase();
  const lead = drivers(input.families, cfg.story.driverThreshold);

  let story =
    `${symbol} sets up ${dirWord} on the ${timeframe} timeframe, driven primarily by ${lead}. ` +
    `Enter near ${fmtPrice(plan.entry)}, with the stop at ${fmtPrice(plan.stop)} (${plan.stopBasis}) risking ${plan.riskPct.toFixed(1)}%. ` +
    `The target at ${fmtPrice(plan.target)} (${plan.targetBasis}) offers ${plan.rewardPct.toFixed(1)}% — ${plan.rr.toFixed(1)}:1 reward to risk.`;

  if (plan.overheadWarning) {
    const barrier = direction === 'long' ? 'resistance' : 'support';
    story += ` Note: price must clear nearby ${barrier} to reach the projected target.`;
  }
  if (confidence.penalties.length > 0) {
    story += ` Confidence is reduced by: ${confidence.penalties.map((p) => p.reason).join('; ')}.`;
  }
  if (flags.earningsFlag) {
    story += ' Earnings are ahead — flagged for awareness; the position timeframe does not veto on events.';
  }
  return story;
}
