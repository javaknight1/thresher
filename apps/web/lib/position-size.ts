/**
 * Position sizing — turn a plan (entry + stop) plus the user's account size and
 * per-trade risk into a concrete share count. Pure and framework-free so it can
 * be unit-tested; the engine is untouched (this is a display-side calculator).
 *
 * Convention: "risk" is the dollar amount the user is willing to lose if the
 * stop is hit, expressed as a percentage of account. Shares are floored so the
 * actual risk never exceeds the intended risk.
 */
export interface PositionSizeInput {
  /** total account value in dollars */
  accountSize: number;
  /** percent of account risked on this trade, e.g. 1 = 1% */
  riskPct: number;
  entry: number;
  stop: number;
}

export interface PositionSize {
  /** |entry − stop| — dollars lost per share if stopped out */
  riskPerShare: number;
  /** intended risk = accountSize × riskPct/100 */
  dollarRisk: number;
  /** floor(dollarRisk / riskPerShare) — whole shares */
  shares: number;
  /** shares × entry */
  positionValue: number;
  /** shares × riskPerShare — actual $ at risk (≤ dollarRisk) */
  actualRisk: number;
  /** positionValue as a percent of the account */
  positionPct: number;
}

/** Null when inputs are incomplete/invalid (e.g. no account size, entry == stop). */
export function positionSize(input: PositionSizeInput): PositionSize | null {
  const { accountSize, riskPct, entry, stop } = input;
  if (!(accountSize > 0) || !(riskPct > 0) || !(entry > 0)) return null;

  const riskPerShare = Math.abs(entry - stop);
  if (!(riskPerShare > 0)) return null;

  const dollarRisk = accountSize * (riskPct / 100);
  const shares = Math.floor(dollarRisk / riskPerShare);
  const positionValue = shares * entry;
  const actualRisk = shares * riskPerShare;
  const positionPct = (positionValue / accountSize) * 100;

  return { riskPerShare, dollarRisk, shares, positionValue, actualRisk, positionPct };
}
