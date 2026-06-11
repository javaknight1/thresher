import React, { useState, useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ============================================================
   THRESHER — technical confluence desk (prototype)
   Engine: deterministic synthetic OHLCV → indicators → four
   signal families → composite score → trade plan + confidence.
   Swap genSeries() for a real data endpoint in production.
   ============================================================ */

/* ---------- deterministic RNG ---------- */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- synthetic OHLCV, seeded by ticker ---------- */
const TF = {
  intraday: { label: "Intraday", bars: 240, unit: "hour", barLabel: "1h bars · ~6 weeks" },
  swing:    { label: "Swing",    bars: 250, unit: "day",  barLabel: "daily bars · ~1 year" },
  position: { label: "Position", bars: 200, unit: "week", barLabel: "weekly bars · ~4 years" },
};

function genSeries(ticker, tfKey) {
  const cfg = TF[tfKey];
  const seed = hashStr(ticker + "::" + tfKey);
  const rng = mulberry32(seed);
  const basePrice = 8 + rng() * 470;
  // regime params from the hash — different tickers feel different
  let drift = (rng() - 0.42) * 0.0035;      // slight long bias, can be negative
  const vol = 0.008 + rng() * 0.02;         // per-bar volatility
  const regimeFlip = 0.012 + rng() * 0.02;  // chance the trend regime shifts
  const baseVol = 1e5 + rng() * 9e5;

  const bars = [];
  let c = basePrice;
  const now = new Date();
  for (let i = 0; i < cfg.bars; i++) {
    if (rng() < regimeFlip) drift = (rng() - 0.45) * 0.004;
    const r = drift + gauss(rng) * vol;
    const o = c;
    c = Math.max(0.5, c * (1 + r));
    const wick = Math.abs(gauss(rng)) * vol * c * 0.8;
    const h = Math.max(o, c) + wick;
    const l = Math.max(0.1, Math.min(o, c) - wick);
    const v = baseVol * (0.6 + rng() * 0.8 + Math.abs(r) * 60);
    const d = new Date(now);
    const back = cfg.bars - i;
    if (cfg.unit === "hour") d.setHours(d.getHours() - back);
    else if (cfg.unit === "day") d.setDate(d.getDate() - back);
    else d.setDate(d.getDate() - back * 7);
    bars.push({ t: d, o, h, l, c, v });
  }
  return bars;
}

/* ---------- indicators ---------- */
const last = (a) => a[a.length - 1];

function smaSeries(vals, n) {
  const out = new Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}
function emaSeries(vals, n) {
  const out = new Array(vals.length).fill(null);
  const k = 2 / (n + 1);
  let e = vals[0];
  for (let i = 0; i < vals.length; i++) {
    e = i === 0 ? vals[0] : vals[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}
function rsiWilder(closes, n = 14) {
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function atrWilder(bars, n = 14) {
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const { h, l } = bars[i], pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = trs.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
  return a;
}
function macdLast(closes) {
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => e12[i] - e26[i]);
  const sig = emaSeries(line, 9);
  const hist = line.map((x, i) => x - sig[i]);
  return {
    line: last(line), signal: last(sig),
    hist: last(hist), histPrev: hist[hist.length - 4],
  };
}
function adxWilder(bars, n = 14) {
  let sTR = 0, sP = 0, sN = 0;
  const dxs = [];
  let trS = null, pS = null, nS = null;
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, ph = bars[i - 1].h, pl = bars[i - 1].l, pc = bars[i - 1].c;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph, dn = pl - l;
    const pdm = up > dn && up > 0 ? up : 0;
    const ndm = dn > up && dn > 0 ? dn : 0;
    if (i <= n) { sTR += tr; sP += pdm; sN += ndm; if (i === n) { trS = sTR; pS = sP; nS = sN; } }
    else { trS = trS - trS / n + tr; pS = pS - pS / n + pdm; nS = nS - nS / n + ndm; }
    if (i >= n && trS > 0) {
      const pdi = 100 * pS / trS, ndi = 100 * nS / trS;
      const dx = (pdi + ndi) > 0 ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0;
      dxs.push(dx);
    }
  }
  let adx = dxs.slice(0, n).reduce((s, x) => s + x, 0) / Math.min(n, dxs.length);
  for (let i = n; i < dxs.length; i++) adx = (adx * (n - 1) + dxs[i]) / n;
  return adx;
}
function obvDelta(bars, lookback = 20) {
  const obv = [0];
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].c > bars[i - 1].c ? bars[i].v : bars[i].c < bars[i - 1].c ? -bars[i].v : 0;
    obv.push(obv[i - 1] + d);
  }
  return last(obv) - obv[Math.max(0, obv.length - 1 - lookback)];
}
function pivotLevels(bars, w = 5) {
  const res = [], sup = [];
  for (let i = w; i < bars.length - w; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (bars[j].h > bars[i].h) isHigh = false;
      if (bars[j].l < bars[i].l) isLow = false;
    }
    if (isHigh) res.push(bars[i].h);
    if (isLow) sup.push(bars[i].l);
  }
  return { res, sup };
}

/* ---------- the confluence engine ---------- */
function clampS(x) { return Math.max(-1, Math.min(1, x)); }

function analyze(ticker, tfKey) {
  const bars = genSeries(ticker, tfKey);
  const closes = bars.map((b) => b.c);
  const close = last(closes);

  const sma20 = smaSeries(closes, 20);
  const sma50 = smaSeries(closes, 50);
  const atr = atrWilder(bars, 14);
  const rsi = rsiWilder(closes, 14);
  const macd = macdLast(closes);
  const adx = adxWilder(bars, 14);
  const obvD = obvDelta(bars, 20);
  const priceD = close - closes[closes.length - 21];

  const vols = bars.map((b) => b.v);
  const vol20 = vols.slice(-20).reduce((s, x) => s + x, 0) / 20;
  const vol5 = vols.slice(-5).reduce((s, x) => s + x, 0) / 5;
  const volRatio = vol5 / vol20;

  const { res, sup } = pivotLevels(bars, 5);
  const resistance = res.filter((x) => x > close * 1.004).sort((a, b) => a - b)[0] ?? close + 2.5 * atr;
  const support = sup.filter((x) => x < close * 0.996).sort((a, b) => b - a)[0] ?? close - 2.5 * atr;

  // Bollinger %B
  const m20 = last(sma20);
  const sd = Math.sqrt(closes.slice(-20).reduce((s, x) => s + (x - m20) ** 2, 0) / 20);
  const pb = sd > 0 ? (close - (m20 - 2 * sd)) / (4 * sd) : 0.5;

  /* --- family 1: trend (weight .35) --- */
  const tDetails = [];
  let t = 0;
  const s50 = last(sma50), s50prev = sma50[sma50.length - 11];
  if (close > s50) { t += 0.4; tDetails.push({ ok: 1, txt: `Price above 50-bar SMA (${fmt(s50)})` }); }
  else { t -= 0.4; tDetails.push({ ok: -1, txt: `Price below 50-bar SMA (${fmt(s50)})` }); }
  if (last(sma20) > s50) { t += 0.3; tDetails.push({ ok: 1, txt: "20 SMA above 50 SMA (bullish stack)" }); }
  else { t -= 0.3; tDetails.push({ ok: -1, txt: "20 SMA below 50 SMA (bearish stack)" }); }
  if (s50 > s50prev) { t += 0.3; tDetails.push({ ok: 1, txt: "50 SMA sloping upward" }); }
  else { t -= 0.3; tDetails.push({ ok: -1, txt: "50 SMA sloping downward" }); }
  let adxMult = 1, choppy = false;
  if (adx >= 25) tDetails.push({ ok: 1, txt: `ADX ${adx.toFixed(0)} — established trend` });
  else if (adx >= 18) { adxMult = 0.8; tDetails.push({ ok: 0, txt: `ADX ${adx.toFixed(0)} — developing trend` }); }
  else { adxMult = 0.5; choppy = true; tDetails.push({ ok: -1, txt: `ADX ${adx.toFixed(0)} — choppy, low trend conviction` }); }
  const trendScore = clampS(t * adxMult);

  /* --- family 2: momentum (weight .30) --- */
  const mDetails = [];
  let m = 0;
  if (macd.line > macd.signal) { m += 0.4; mDetails.push({ ok: 1, txt: "MACD above signal line" }); }
  else { m -= 0.4; mDetails.push({ ok: -1, txt: "MACD below signal line" }); }
  if (macd.hist > macd.histPrev) { m += 0.2; mDetails.push({ ok: 1, txt: "MACD histogram expanding upward" }); }
  else { m -= 0.2; mDetails.push({ ok: -1, txt: "MACD histogram fading" }); }
  let rsiHot = false, rsiCold = false;
  if (rsi > 72) { m += 0.1; rsiHot = true; mDetails.push({ ok: 0, txt: `RSI ${rsi.toFixed(0)} — strong but overbought` }); }
  else if (rsi >= 55) { m += 0.3; mDetails.push({ ok: 1, txt: `RSI ${rsi.toFixed(0)} — bullish momentum zone` }); }
  else if (rsi <= 28) { m -= 0.1; rsiCold = true; mDetails.push({ ok: 0, txt: `RSI ${rsi.toFixed(0)} — weak but oversold` }); }
  else if (rsi <= 45) { m -= 0.3; mDetails.push({ ok: -1, txt: `RSI ${rsi.toFixed(0)} — bearish momentum zone` }); }
  else mDetails.push({ ok: 0, txt: `RSI ${rsi.toFixed(0)} — neutral` });
  const momScore = clampS(m);

  /* --- family 3: volume (weight .15) --- */
  const vDetails = [];
  let v = 0;
  if (obvD > 0 && priceD > 0) { v += 0.5; vDetails.push({ ok: 1, txt: "OBV rising with price — accumulation" }); }
  else if (obvD < 0 && priceD < 0) { v -= 0.5; vDetails.push({ ok: -1, txt: "OBV falling with price — distribution" }); }
  else if (obvD > 0 && priceD <= 0) { v += 0.2; vDetails.push({ ok: 0, txt: "OBV diverging bullishly from price" }); }
  else { v -= 0.2; vDetails.push({ ok: 0, txt: "OBV diverging bearishly from price" }); }
  let thin = false;
  if (volRatio > 1.2) { v += 0.3 * Math.sign(priceD || 1); vDetails.push({ ok: Math.sign(priceD || 1), txt: `Volume ${(volRatio * 100 - 100).toFixed(0)}% above average — conviction behind the move` }); }
  else if (volRatio < 0.8) { thin = true; vDetails.push({ ok: 0, txt: "Volume running thin vs. 20-bar average" }); }
  else vDetails.push({ ok: 0, txt: "Volume in line with average" });
  const volScore = clampS(v);

  /* --- family 4: structure (weight .20) --- */
  const sDetails = [];
  let st = 0;
  const room = resistance - close, cushion = close - support;
  if (room > cushion * 1.3) { st += 0.4; sDetails.push({ ok: 1, txt: `${fmt(room)} of room to resistance vs ${fmt(cushion)} above support` }); }
  else if (cushion > room * 1.3) { st -= 0.4; sDetails.push({ ok: -1, txt: `Resistance ${fmt(room)} away is closer than support — limited upside room` }); }
  else sDetails.push({ ok: 0, txt: "Roughly equidistant between support and resistance" });
  if (close > m20) { st += 0.2; sDetails.push({ ok: 1, txt: "Trading above the 20-bar mean" }); }
  else { st -= 0.2; sDetails.push({ ok: -1, txt: "Trading below the 20-bar mean" }); }
  if (pb > 0.98) { st -= 0.2; sDetails.push({ ok: -1, txt: "Pressing the upper Bollinger band — stretched" }); }
  else if (pb < 0.02) { st += 0.2; sDetails.push({ ok: 0, txt: "Pinned to the lower Bollinger band — washed out" }); }
  const structScore = clampS(st);

  /* --- composite --- */
  const families = [
    { key: "trend", name: "Trend", score: trendScore, weight: 0.35, details: tDetails, meta: `SMA 20/50 · slope · ADX ${adx.toFixed(0)}` },
    { key: "momentum", name: "Momentum", score: momScore, weight: 0.30, details: mDetails, meta: `MACD · RSI ${rsi.toFixed(0)}` },
    { key: "volume", name: "Volume", score: volScore, weight: 0.15, details: vDetails, meta: `OBV · rel-vol ${volRatio.toFixed(2)}×` },
    { key: "structure", name: "Structure", score: structScore, weight: 0.20, details: sDetails, meta: `S/R pivots · Bollinger %B ${(pb * 100).toFixed(0)}` },
  ];
  const composite = families.reduce((s, f) => s + f.score * f.weight, 0);

  let direction = "none";
  if (composite >= 0.22) direction = "long";
  else if (composite <= -0.22) direction = "short";

  /* --- confidence with explicit penalties --- */
  const penalties = [];
  let conf = Math.min(95, 35 + Math.abs(composite) * 75);
  if (direction !== "none") {
    if (choppy) { conf -= 12; penalties.push("ADX below 18 — choppy tape (−12)"); }
    const dirSign = direction === "long" ? 1 : -1;
    families.forEach((f) => {
      if (Math.abs(f.score) > 0.15 && Math.sign(f.score) !== dirSign) {
        conf -= 8; penalties.push(`${f.name} family disagrees with the trade (−8)`);
      }
    });
    if (direction === "long" && rsiHot) { conf -= 8; penalties.push("RSI overbought against a fresh long (−8)"); }
    if (direction === "short" && rsiCold) { conf -= 8; penalties.push("RSI oversold against a fresh short (−8)"); }
    if (thin) { conf -= 5; penalties.push("Thin volume — weak participation (−5)"); }
  }
  conf = Math.round(Math.max(5, Math.min(95, conf)));

  /* --- trade plan --- */
  let plan = null;
  let noTradeReason = null;
  if (direction === "none") {
    noTradeReason = "Signal families net out near zero — no edge in either direction. The engine requires confluence before it will hand you a trade.";
  } else {
    const sign = direction === "long" ? 1 : -1;
    const structStop = direction === "long" ? support - 0.45 * atr : resistance + 0.45 * atr;
    const wideCap = close - sign * 2.2 * atr;
    const tightFloor = close - sign * 0.8 * atr;
    let stop = direction === "long" ? Math.max(structStop, wideCap) : Math.min(structStop, wideCap);
    stop = direction === "long" ? Math.min(stop, tightFloor) : Math.max(stop, tightFloor);
    const risk = Math.abs(close - stop);

    const structTarget = direction === "long" ? resistance : support;
    const structRR = Math.abs(structTarget - close) / risk;
    let target, targetBasis, overheadWarn = false;
    if (structRR >= 1.4) {
      target = structTarget;
      targetBasis = direction === "long" ? "nearest resistance pivot" : "nearest support pivot";
    } else {
      target = close + sign * Math.max(2 * risk, 2.5 * atr);
      targetBasis = "2R / 2.5×ATR projection";
      overheadWarn = true;
    }
    const reward = Math.abs(target - close);
    const rr = reward / risk;

    if (rr < 1.2) {
      direction = "none";
      noTradeReason = `A ${direction} setup exists but the structure only offers ${rr.toFixed(2)}:1 risk/reward — below the 1.2 floor. Pass and wait for a better entry.`;
    } else {
      plan = {
        entry: close, stop, target, risk, reward, rr,
        riskPct: (risk / close) * 100,
        rewardPct: (reward / close) * 100,
        stopBasis: direction === "long" ? "below nearest support − 0.45×ATR (capped at 2.2×ATR)" : "above nearest resistance + 0.45×ATR (capped at 2.2×ATR)",
        targetBasis, overheadWarn,
        evPct: (conf / 100) * ((reward / close) * 100) - (1 - conf / 100) * ((risk / close) * 100),
      };
    }
  }

  /* --- narrative --- */
  const dirWord = direction === "long" ? "LONG" : direction === "short" ? "SHORT" : "NO TRADE";
  const lead = families.filter((f) => Math.abs(f.score) >= 0.3).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  let story;
  if (direction === "none") {
    story = noTradeReason;
  } else {
    const drivers = lead.map((f) => f.name.toLowerCase()).join(", ") || "a mild balance of signals";
    story = `${ticker} sets up ${dirWord} on the ${TF[tfKey].label.toLowerCase()} timeframe, driven primarily by ${drivers}. ` +
      `Enter near ${fmt(close)}, with the stop at ${fmt(plan.stop)} (${plan.stopBasis}) risking ${plan.riskPct.toFixed(1)}%. ` +
      `The target at ${fmt(plan.target)} (${plan.targetBasis}) offers ${plan.rewardPct.toFixed(1)}% — ${plan.rr.toFixed(1)}:1 reward to risk.` +
      (plan.overheadWarn ? ` Note: price must clear nearby ${direction === "long" ? "resistance" : "support"} to reach the projected target.` : "") +
      (penalties.length ? ` Confidence is reduced by: ${penalties.map((p) => p.replace(/ \(−\d+\)/, "")).join("; ")}.` : "");
  }

  /* --- chart data --- */
  const slice = Math.min(130, bars.length);
  const chart = bars.slice(-slice).map((b, i) => {
    const gi = bars.length - slice + i;
    return {
      label: fmtDate(b.t, tfKey),
      close: round2(b.c),
      sma20: sma20[gi] ? round2(sma20[gi]) : null,
      sma50: sma50[gi] ? round2(sma50[gi]) : null,
    };
  });

  return {
    ticker, tfKey, close, atr, rsi, adx, volRatio,
    support, resistance, families, composite, direction, conf,
    penalties, plan, noTradeReason, story, chart,
  };
}

/* ---------- formatting ---------- */
function fmt(x) { return "$" + (x >= 100 ? x.toFixed(2) : x.toFixed(2)); }
function round2(x) { return Math.round(x * 100) / 100; }
function fmtDate(d, tfKey) {
  if (tfKey === "intraday") return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/* ---------- palette ---------- */
const C = {
  bg: "#0E1116", panel: "#151B23", panel2: "#10151C", border: "#27303C",
  text: "#E8EBF0", mut: "#8C96A6", amber: "#E8B44C",
  long: "#3FCF8E", short: "#F26969", neutral: "#8C96A6",
};
const dirColor = (d) => (d === "long" ? C.long : d === "short" ? C.short : C.neutral);

/* ---------- small components ---------- */
function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 16px", borderRadius: 999, cursor: "pointer",
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 0.5,
      background: active ? C.amber : "transparent",
      color: active ? "#1A1408" : C.mut,
      border: `1px solid ${active ? C.amber : C.border}`,
      transition: "all .15s",
    }}>{children}</button>
  );
}

function ConfidenceBar({ conf, direction }) {
  const col = conf >= 70 ? C.long : conf >= 45 ? C.amber : C.short;
  const label = conf >= 70 ? "HIGH" : conf >= 45 ? "MODERATE" : "LOW";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>CONFIDENCE</span>
        <span style={{ fontSize: 12, color: col, fontFamily: "'IBM Plex Mono', monospace" }}>{conf} / 100 · {label}</span>
      </div>
      <div style={{ height: 8, background: C.panel2, borderRadius: 4, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ width: `${conf}%`, height: "100%", background: `linear-gradient(90deg, ${col}66, ${col})`, transition: "width .4s" }} />
      </div>
    </div>
  );
}

/* signature element: the risk/reward ladder */
function RRLadder({ plan, direction }) {
  if (!plan) return null;
  const lo = Math.min(plan.stop, plan.target, plan.entry);
  const hi = Math.max(plan.stop, plan.target, plan.entry);
  const span = hi - lo || 1;
  const pos = (p) => ((hi - p) / span) * 100; // % from top
  const rows = [
    { p: plan.target, name: "TARGET", col: C.long, sub: `+${plan.rewardPct.toFixed(1)}%` },
    { p: plan.entry, name: "ENTRY", col: C.amber, sub: "now" },
    { p: plan.stop, name: "STOP", col: C.short, sub: `−${plan.riskPct.toFixed(1)}%` },
  ];
  const greenTop = pos(direction === "long" ? plan.target : plan.entry);
  const greenH = Math.abs(pos(plan.entry) - pos(plan.target));
  const redTop = pos(direction === "long" ? plan.entry : plan.stop);
  const redH = Math.abs(pos(plan.entry) - pos(plan.stop));
  return (
    <div style={{ display: "flex", gap: 14, height: 190, marginTop: 4 }}>
      <div style={{ position: "relative", width: 26, borderRadius: 6, background: C.panel2, border: `1px solid ${C.border}` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: `${greenTop}%`, height: `${greenH}%`, background: `${C.long}33`, borderTop: `2px solid ${C.long}`, borderRadius: "6px 6px 0 0" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: `${redTop}%`, height: `${redH}%`, background: `${C.short}2C`, borderBottom: `2px solid ${C.short}`, borderRadius: "0 0 6px 6px" }} />
        <div style={{ position: "absolute", left: -4, right: -4, top: `calc(${pos(plan.entry)}% - 1px)`, height: 2, background: C.amber }} />
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ position: "absolute", top: `calc(${pos(r.p)}% - 16px)`, left: 0 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: r.col, letterSpacing: 1 }}>{r.name}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: C.text }}>{fmt(r.p)} <span style={{ fontSize: 11, color: C.mut }}>{r.sub}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FamilyCard({ f, direction }) {
  const s = f.score;
  const col = s > 0.12 ? C.long : s < -0.12 ? C.short : C.neutral;
  const word = s > 0.12 ? "BULLISH" : s < -0.12 ? "BEARISH" : "NEUTRAL";
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: C.text }}>{f.name}</div>
          <div style={{ fontSize: 10.5, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{f.meta} · w {Math.round(f.weight * 100)}%</div>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: col, letterSpacing: 1 }}>{word} {s >= 0 ? "+" : ""}{s.toFixed(2)}</span>
      </div>
      <div style={{ height: 5, background: C.panel2, borderRadius: 3, margin: "10px 0 12px", position: "relative", border: `1px solid ${C.border}` }}>
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: C.border }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: s >= 0 ? "50%" : `${50 + s * 50}%`,
          width: `${Math.abs(s) * 50}%`, background: col, borderRadius: 3,
        }} />
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {f.details.map((d, i) => (
          <li key={i} style={{ fontSize: 12.5, color: C.mut, padding: "3px 0", display: "flex", gap: 8 }}>
            <span style={{ color: d.ok > 0 ? C.long : d.ok < 0 ? C.short : C.neutral, fontFamily: "'IBM Plex Mono', monospace" }}>
              {d.ok > 0 ? "▲" : d.ok < 0 ? "▼" : "•"}
            </span>
            <span style={{ color: "#B9C1CD" }}>{d.txt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- main app ---------- */
const SAMPLES = ["NVDA", "AAPL", "TSLA", "XOM", "JPM", "COIN"];

export default function ThresherDesk() {
  const [input, setInput] = useState("NVDA");
  const [ticker, setTicker] = useState("NVDA");
  const [tf, setTf] = useState("swing");

  const a = useMemo(() => (ticker ? analyze(ticker, tf) : null), [ticker, tf]);

  const run = (t) => {
    const clean = (t ?? input).trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
    if (!clean) return;
    setInput(clean);
    setTicker(clean);
  };

  const dCol = a ? dirColor(a.direction) : C.neutral;
  const dWord = a ? (a.direction === "long" ? "LONG" : a.direction === "short" ? "SHORT" : "NO TRADE") : "";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        input:focus { outline: none; border-color: ${C.amber} !important; }
        ::placeholder { color: ${C.mut}; opacity: .6; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 4, color: C.amber }}>THRESHER</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 3 }}>technical confluence desk — full trade story from entry to exit</div>
          </div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: 1.5,
            color: C.amber, border: `1px solid ${C.amber}55`, padding: "5px 10px", borderRadius: 6, background: `${C.amber}10`,
          }}>PROTOTYPE · SYNTHETIC DATA</div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="TICKER"
            style={{
              background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, padding: "10px 14px", width: 130,
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, letterSpacing: 2,
            }}
          />
          <button onClick={() => run()} style={{
            background: C.amber, color: "#1A1408", border: "none", borderRadius: 8,
            padding: "10px 22px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
            fontSize: 14, cursor: "pointer",
          }}>Analyze</button>
          <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
            {Object.keys(TF).map((k) => (
              <Pill key={k} active={tf === k} onClick={() => setTf(k)}>{TF[k].label}</Pill>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: C.mut }}>try:</span>
          {SAMPLES.map((s) => (
            <button key={s} onClick={() => run(s)} style={{
              background: "transparent", border: `1px solid ${C.border}`, color: ticker === s ? C.amber : C.mut,
              borderRadius: 6, padding: "3px 10px", fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11.5, cursor: "pointer",
            }}>{s}</button>
          ))}
          <span style={{ fontSize: 11, color: C.mut, marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace" }}>
            {TF[tf].barLabel}
          </span>
        </div>

        {a && (
          <>
            {/* trade card + ladder */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16, marginTop: 24 }}>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 28 }}>{a.ticker}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: C.mut }}>{fmt(a.close)}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, letterSpacing: 2,
                    color: dCol, border: `1.5px solid ${dCol}`, borderRadius: 6, padding: "4px 14px",
                    background: `${dCol}14`,
                  }}>{dWord}</span>
                  {a.plan && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.text }}>
                      {a.plan.rr.toFixed(1)}:1 <span style={{ color: C.mut, fontSize: 11 }}>R:R</span>
                    </span>
                  )}
                </div>

                {a.plan ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 18 }}>
                    {[
                      ["ENTRY", fmt(a.plan.entry), C.amber, "market / current"],
                      ["STOP LOSS", fmt(a.plan.stop), C.short, `−${a.plan.riskPct.toFixed(1)}% · ${a.plan.stopBasis.split(" (")[0]}`],
                      ["TARGET", fmt(a.plan.target), C.long, `+${a.plan.rewardPct.toFixed(1)}% · ${a.plan.targetBasis}`],
                      ["ILLUSTRATIVE EV", `${a.plan.evPct >= 0 ? "+" : ""}${a.plan.evPct.toFixed(1)}%`, a.plan.evPct >= 0 ? C.long : C.short, "treats confidence as win-rate — not calibrated"],
                    ].map(([k, val, col, sub]) => (
                      <div key={k} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, letterSpacing: 1.4, color: C.mut, fontFamily: "'IBM Plex Mono', monospace" }}>{k}</div>
                        <div style={{ fontSize: 19, color: col, fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>{val}</div>
                        <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    marginTop: 18, padding: "14px 16px", borderRadius: 8,
                    background: C.panel2, border: `1px dashed ${C.border}`, color: "#B9C1CD", fontSize: 13.5, lineHeight: 1.55,
                  }}>{a.noTradeReason}</div>
                )}

                <div style={{ marginTop: 18 }}>
                  <ConfidenceBar conf={a.conf} direction={a.direction} />
                  {a.penalties.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {a.penalties.map((p, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", padding: "2px 0" }}>⚠ {p}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 1.4, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>TRADE LADDER</div>
                {a.plan ? <RRLadder plan={a.plan} direction={a.direction} /> : (
                  <div style={{ color: C.mut, fontSize: 12.5, lineHeight: 1.6, marginTop: 8 }}>
                    No ladder — the engine isn't offering a trade here. Levels it's watching:
                    <div style={{ marginTop: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                      <div style={{ color: C.short }}>R {fmt(a.resistance)}</div>
                      <div style={{ color: C.text, margin: "4px 0" }}>· {fmt(a.close)}</div>
                      <div style={{ color: C.long }}>S {fmt(a.support)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* chart */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 12px 8px 0", marginTop: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.4, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", margin: "0 0 8px 22px" }}>
                PRICE · SMA20 · SMA50 {a.plan ? "· TRADE LEVELS" : "· S/R LEVELS"}
              </div>
              <ResponsiveContainer width="100%" height={330}>
                <ComposedChart data={a.chart} margin={{ top: 8, right: 70, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: C.mut, fontSize: 10, fontFamily: "IBM Plex Mono" }} interval="preserveStartEnd" minTickGap={48} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: C.mut, fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={58} tickFormatter={(v) => "$" + v} />
                  <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 12 }} labelStyle={{ color: C.mut }} />
                  <Line type="monotone" dataKey="sma50" stroke="#5A6B85" dot={false} strokeWidth={1.4} name="SMA 50" />
                  <Line type="monotone" dataKey="sma20" stroke="#8FA3C4" dot={false} strokeWidth={1.4} name="SMA 20" />
                  <Line type="monotone" dataKey="close" stroke={C.amber} dot={false} strokeWidth={2} name="Close" />
                  {a.plan && <ReferenceLine y={round2(a.plan.target)} stroke={C.long} strokeDasharray="5 4" label={{ value: "TARGET", fill: C.long, fontSize: 10, position: "right", fontFamily: "IBM Plex Mono" }} />}
                  {a.plan && <ReferenceLine y={round2(a.plan.entry)} stroke={C.amber} strokeDasharray="5 4" label={{ value: "ENTRY", fill: C.amber, fontSize: 10, position: "right", fontFamily: "IBM Plex Mono" }} />}
                  {a.plan && <ReferenceLine y={round2(a.plan.stop)} stroke={C.short} strokeDasharray="5 4" label={{ value: "STOP", fill: C.short, fontSize: 10, position: "right", fontFamily: "IBM Plex Mono" }} />}
                  {!a.plan && <ReferenceLine y={round2(a.resistance)} stroke={C.short} strokeDasharray="5 4" label={{ value: "R", fill: C.short, fontSize: 10, position: "right", fontFamily: "IBM Plex Mono" }} />}
                  {!a.plan && <ReferenceLine y={round2(a.support)} stroke={C.long} strokeDasharray="5 4" label={{ value: "S", fill: C.long, fontSize: 10, position: "right", fontFamily: "IBM Plex Mono" }} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* story */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${dCol}`, borderRadius: 12, padding: "18px 22px", marginTop: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.4, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8 }}>THE TRADE STORY</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "#CBD2DC" }}>{a.story}</div>
            </div>

            {/* families */}
            <div style={{ fontSize: 11, letterSpacing: 1.4, color: C.mut, fontFamily: "'IBM Plex Mono', monospace", margin: "26px 0 10px 2px" }}>
              SIGNAL FAMILIES · COMPOSITE {a.composite >= 0 ? "+" : ""}{a.composite.toFixed(3)} (long ≥ +0.22 · short ≤ −0.22)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {a.families.map((f) => <FamilyCard key={f.key} f={f} direction={a.direction} />)}
            </div>

            {/* footer */}
            <div style={{ marginTop: 28, fontSize: 11.5, color: C.mut, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              Prototype running on deterministic synthetic data seeded by ticker — not real market prices. Nothing here is financial
              advice or a prediction of returns; the engine reports technical structure and the math of a defined-risk setup.
              Confidence reflects signal agreement, not a calibrated win probability. In the production build, the data layer
              swaps to live OHLCV and the scoring gets backtested before any score is shown.
            </div>
          </>
        )}
      </div>
    </div>
  );
}