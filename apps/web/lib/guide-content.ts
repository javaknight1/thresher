/**
 * Guide content — the single source shared by the /guide page and the
 * first-login onboarding wizard (the wizard shows these sections as cards; the
 * guide page renders them plus a glossary and the honest-limits note).
 */
export type CoverArt =
  | 'candles'
  | 'waves'
  | 'grid'
  | 'target'
  | 'gauge'
  | 'shield'
  | 'horizon';

export interface GuideSection {
  id: string;
  title: string;
  /** short lead paragraph */
  lead: string;
  /** supporting bullet points */
  points: string[];
  /** cover-art key for the wizard card */
  cover: CoverArt;
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'what',
    title: 'What Thresher does',
    lead: 'Give it a ticker and a candle size. It reads the chart the way a disciplined technician would and either lays out a complete trade — entry, stop, target — or refuses when the signals don’t line up.',
    points: [
      'It never forces a trade: a low-agreement setup returns an honest “no trade”, not a weak one.',
      'Everything it shows is auditable — each number links to the methodology behind it.',
    ],
    cover: 'candles',
  },
  {
    id: 'families',
    title: 'How it reads the chart',
    lead: 'Thresher doesn’t rely on one indicator. It scores four independent “families” of signals and combines their votes — a trade needs them to broadly agree.',
    points: [
      'Trend — is price making higher highs (or lower lows)?',
      'Momentum — is the move gaining or losing steam?',
      'Volume — is real participation behind the move?',
      'Structure — where are the support/resistance levels?',
    ],
    cover: 'waves',
  },
  {
    id: 'board',
    title: 'Reading the board',
    lead: 'The Top tab ranks the best setups across Hourly, Daily, and Weekly candles. Each row is one setup that cleared every gate.',
    points: [
      'Bias — LONG (expecting up) or SHORT (expecting down).',
      'Entry / Stop / Target — the trade levels. Stop is your risk; Target is the goal.',
      'R:R — reward-to-risk. 2.00 means the target is twice as far as the stop.',
      'Agree — how strongly the signals agree, 0–100. It is not a win rate.',
      'Score — a 0–100 setup-quality blend of EV, agreement, and R:R (minus risk flags). Not a win rate.',
      'The counts (“42 refused”) show how few names qualify at once — that’s normal.',
    ],
    cover: 'grid',
  },
  {
    id: 'plan',
    title: 'Reading a trade plan',
    lead: 'Click any row (or search a ticker) for the full plan. Risk is measured in “R” — 1R is the distance from your entry to your stop.',
    points: [
      'Entry, Stop, and Target each show the reasoning (“basis”) for the level.',
      'R:R ties it together: you risk 1R to make the reward, in R.',
      'Long: stop sits below entry, target above. Short mirrors it.',
      'Size the position yourself — Thresher gives the levels, not your risk budget.',
    ],
    cover: 'target',
  },
  {
    id: 'terms',
    title: 'The key terms',
    lead: 'A few words you’ll see everywhere. None of them is a promise about the future.',
    points: [
      'R — one unit of risk (entry → stop). R:R — how many R the target is away.',
      'Agreement (Confidence) — how strongly the four families agree, 0–100. Not a win rate.',
      'Setup Score — the board’s 0–100 value metric: a blend of illustrative EV, agreement, and R:R, minus risk flags.',
      'Illustrative EV — expected value using agreement as a stand-in probability — a quality check, not a forecast, until outcomes are measured.',
    ],
    cover: 'gauge',
  },
  {
    id: 'gates',
    title: 'The five gates',
    lead: 'Before proposing anything, Thresher runs five checks in order and stops at the first that fails — that’s why most names show “no trade”.',
    points: [
      'Edge — is there a clear direction at all?',
      'Conviction — do the signals agree enough?',
      'Structure — is the reward worth the risk?',
      'Expected value — does the edge beat break-even?',
      'Event risk — is an earnings report too close?',
    ],
    cover: 'shield',
  },
  {
    id: 'honest',
    title: 'The honest part',
    lead: 'Agreement and illustrative EV measure how the signals line up — not the future. Thresher reads only price and volume; it can’t see news, fundamentals, or what happens next.',
    points: [
      'Confidence is “signal agreement”, never a promised win rate.',
      'Nothing here is financial advice — the decision, and the risk, are yours.',
      'You’re ready. Open the board and start exploring.',
    ],
    cover: 'horizon',
  },
];

export interface GlossaryEntry {
  term: string;
  def: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  { term: 'Bias', def: 'The trade direction — LONG (expecting the price to rise) or SHORT (to fall).' },
  { term: 'Entry / Stop / Target', def: 'Where you’d get in, where you’d cut the loss, and where you’d take the gain.' },
  { term: 'R (risk unit)', def: 'One R is the distance from entry to your stop — your defined risk on the trade.' },
  { term: 'R:R (reward-to-risk)', def: 'How many R the target is away. 2.0 means the target is twice as far as the stop.' },
  { term: 'Agreement / Confidence', def: 'How strongly trend, momentum, volume, and structure agree (0–100). Signal agreement — deliberately NOT a win rate until outcomes are calibrated.' },
  { term: 'Setup Score', def: 'The board’s 0–100 value metric: a relative blend of illustrative EV, agreement, and R:R, minus deductions for risk flags (earnings, overhead, outlier R:R). A ranking score — not a win rate or expected return.' },
  { term: 'Quality', def: 'A simpler ranking number kept alongside Setup Score: (Agreement ÷ 100) × R:R.' },
  { term: 'Illustrative EV', def: 'Expected value in R using agreement as a stand-in probability. “Illustrative” because that probability isn’t yet verified against real results.' },
  { term: 'Gate', def: 'One of five sequential checks (Edge, Conviction, Structure, Expected value, Event risk). All must pass for a trade to show.' },
  { term: 'Refusal / No trade', def: 'A first-class result: the setup failed a gate, so Thresher declines rather than show a weak trade.' },
  { term: 'Candle / timeframe', def: 'Hourly, Daily, or Weekly bars — the horizon the analysis runs on.' },
  { term: '⚠ Outlier', def: 'A flag on an unusually large R:R (target far from entry) — worth a sanity-check before acting.' },
];
