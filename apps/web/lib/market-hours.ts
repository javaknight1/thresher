/**
 * US equity regular-trading-hours check — display-only (never feeds the engine).
 *
 * Approximation: Mon–Fri, 09:30–16:00 America/New_York. Market holidays are
 * IGNORED (a documented simplification, like the earnings weekday counter), so
 * this can report "open" on a holiday. Good enough for a "market closed —
 * showing last session" hint on the Hourly board. Pure: the date is passed in.
 */
export function isUsMarketOpen(now: Date): boolean {
  // Resolve the wall clock in New York regardless of the server/browser zone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  // '24' can appear at midnight in some environments; normalize to 0.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const minutes = hour * 60 + minute;
  const OPEN = 9 * 60 + 30; // 09:30 ET
  const CLOSE = 16 * 60; // 16:00 ET
  return minutes >= OPEN && minutes < CLOSE;
}
