/**
 * Stop placement — the invalidation principle.
 * Spec: docs/THRESHER-METHODOLOGY.md II.5 · docs/THRESHER-DESIGN.md §5.2.
 *
 * The stop lives where the thesis is wrong: below support (long) / above
 * resistance (short), padded by `bufferAtr` so ordinary noise that briefly
 * pierces the level doesn't tag it, capped at `capAtr` from entry so one trade
 * can't be a blowout, and floored at `floorAtr` so normal bar-to-bar variation
 * doesn't shake it out. Price levels are denominated in cents: the stop is
 * rounded with `round2` AFTER both bounds apply (this is how the II.9 worked
 * example's 80.96 reproduces).
 */
import type { Level } from '../types';
import type { EngineConfig } from '../config';
import { fmtPrice, round2 } from '../util';

export interface StopInput {
  direction: 'long' | 'short';
  entry: number;
  atr: number;
  support: Level;
  resistance: Level;
}

export interface StopResult {
  stop: number;
  risk: number;
  /** which bound is binding, with cfg constants interpolated (shown in the UI) */
  basis: string;
}

export function buildStop(input: StopInput, cfg: EngineConfig): StopResult {
  const { direction, entry, atr, support, resistance } = input;
  const { bufferAtr, capAtr, floorAtr } = cfg.stop;

  const anchor = direction === 'long' ? support : resistance;
  const anchorName = direction === 'long' ? 'support' : 'resistance';

  let stop: number;
  let basis: string;

  if (direction === 'long') {
    const structStop = anchor.price - bufferAtr * atr;
    const capStop = entry - capAtr * atr;
    const floorStop = entry - floorAtr * atr;
    const afterCap = Math.max(structStop, capStop);
    const afterFloor = Math.min(afterCap, floorStop);
    stop = round2(afterFloor);
    if (afterCap > floorStop) {
      basis = `${floorAtr}×ATR noise floor (${anchorName} too close)`;
    } else if (capStop > structStop) {
      basis = `${capAtr}×ATR risk cap (${anchorName} too far)`;
    } else {
      basis = `${anchorName} ${fmtPrice(anchor.price)} − ${bufferAtr}×ATR`;
      if (anchor.synthetic) basis += ' (synthetic level)';
    }
  } else {
    // SHORT mirrors exactly (II.5: "mirror all signs").
    const structStop = anchor.price + bufferAtr * atr;
    const capStop = entry + capAtr * atr;
    const floorStop = entry + floorAtr * atr;
    const afterCap = Math.min(structStop, capStop);
    const afterFloor = Math.max(afterCap, floorStop);
    stop = round2(afterFloor);
    if (afterCap < floorStop) {
      basis = `${floorAtr}×ATR noise floor (${anchorName} too close)`;
    } else if (capStop < structStop) {
      basis = `${capAtr}×ATR risk cap (${anchorName} too far)`;
    } else {
      basis = `${anchorName} ${fmtPrice(anchor.price)} + ${bufferAtr}×ATR`;
      if (anchor.synthetic) basis += ' (synthetic level)';
    }
  }

  const risk = direction === 'long' ? entry - stop : stop - entry;
  return { stop, risk, basis };
}
