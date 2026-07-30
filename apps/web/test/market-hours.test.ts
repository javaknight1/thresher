import { describe, expect, it } from 'vitest';
import { isUsMarketOpen } from '../lib/market-hours';

// June 2024 is EDT (UTC-4), so 13:30Z = 09:30 ET, 20:00Z = 16:00 ET.
describe('isUsMarketOpen', () => {
  it('is open mid-session on a weekday', () => {
    expect(isUsMarketOpen(new Date('2024-06-03T14:00:00Z'))).toBe(true); // Mon 10:00 ET
  });

  it('is open exactly at 09:30 ET and closed just before', () => {
    expect(isUsMarketOpen(new Date('2024-06-03T13:30:00Z'))).toBe(true); // 09:30 ET
    expect(isUsMarketOpen(new Date('2024-06-03T13:29:00Z'))).toBe(false); // 09:29 ET
  });

  it('is closed at and after 16:00 ET', () => {
    expect(isUsMarketOpen(new Date('2024-06-03T20:00:00Z'))).toBe(false); // 16:00 ET
    expect(isUsMarketOpen(new Date('2024-06-03T21:00:00Z'))).toBe(false); // 17:00 ET
  });

  it('is closed on weekends', () => {
    expect(isUsMarketOpen(new Date('2024-06-01T15:00:00Z'))).toBe(false); // Saturday
    expect(isUsMarketOpen(new Date('2024-06-02T15:00:00Z'))).toBe(false); // Sunday
  });
});
