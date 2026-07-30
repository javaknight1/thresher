/**
 * Brokerage affiliate partners shown on /brokerage.
 *
 * ⚠️ The `href` values are PLACEHOLDERS — replace each with your real affiliate
 * link once you're in the brokerage's program. Links render with
 * rel="sponsored noopener noreferrer" and an FTC-style disclosure is shown.
 */
export interface Brokerage {
  name: string;
  blurb: string;
  tag: string;
  /** domain, used for the logo (logo.dev) */
  domain: string;
  /** affiliate URL — replace the placeholder */
  href: string;
}

export const BROKERAGE_DISCLOSURE =
  'Some links below are affiliate links: if you open an account we may earn a commission, at no cost to you. This is not a recommendation or financial advice — compare brokers yourself.';

export const BROKERAGES: readonly Brokerage[] = [
  {
    name: 'Robinhood',
    domain: 'robinhood.com',
    tag: 'Commission-free · beginner-friendly',
    blurb: 'Simple mobile-first trading for stocks and options with no commissions.',
    href: 'https://example.com/affiliate/robinhood',
  },
  {
    name: 'Webull',
    domain: 'webull.com',
    tag: 'Active traders · free',
    blurb: 'Commission-free trading with extended-hours data and charting for active traders.',
    href: 'https://example.com/affiliate/webull',
  },
  {
    name: 'Fidelity',
    domain: 'fidelity.com',
    tag: 'Full-service',
    blurb: 'Long-established full-service broker: research, retirement accounts, and fractional shares.',
    href: 'https://example.com/affiliate/fidelity',
  },
  {
    name: 'Charles Schwab',
    domain: 'schwab.com',
    tag: 'Full-service · thinkorswim',
    blurb: 'Broad product range plus the thinkorswim platform for options and technical traders.',
    href: 'https://example.com/affiliate/schwab',
  },
  {
    name: 'Interactive Brokers',
    domain: 'interactivebrokers.com',
    tag: 'Pro · global',
    blurb: 'Low-cost access to global markets with professional-grade tools and margin.',
    href: 'https://example.com/affiliate/ibkr',
  },
  {
    name: 'tastytrade',
    domain: 'tastytrade.com',
    tag: 'Options-focused',
    blurb: 'Platform built around options and derivatives with active-trader pricing.',
    href: 'https://example.com/affiliate/tastytrade',
  },
];
