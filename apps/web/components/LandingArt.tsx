/**
 * Landing-page visual aids — an inline SVG hero illustration (a schematic trade
 * plan: rising price with target/entry/stop levels + a proportional reward/risk
 * gauge, echoing the real Trade Ladder) and the value-prop card icons. All
 * theme-aware via CSS tokens; no raster assets, no dependencies.
 */
import type { SVGProps } from 'react';

/** The hero chart illustration. Decorative. */
export function HeroGraphic(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 560 380"
      role="img"
      aria-label="A schematic trade plan: rising price with target, entry, and stop levels beside a reward-to-risk gauge."
      {...props}
    >
      {/* panel */}
      <rect x="0.5" y="0.5" width="559" height="379" rx="18" fill="var(--panel2, var(--panel))" stroke="var(--border)" />

      {/* header chips */}
      <g fontFamily="var(--font-mono)">
        <rect x="26" y="24" width="128" height="26" rx="13" fill="var(--panel)" stroke="var(--border)" />
        <text x="42" y="41" fontSize="12" fill="var(--muted)">AAPL · Daily</text>
        <rect x="164" y="24" width="60" height="26" rx="13" fill="color-mix(in srgb, var(--long) 18%, transparent)" />
        <text x="180" y="41" fontSize="11" fill="var(--long)">LONG</text>
      </g>

      {/* faint gridlines */}
      <g stroke="var(--border)" strokeWidth="1" opacity="0.35">
        <line x1="26" y1="150" x2="444" y2="150" />
        <line x1="26" y1="255" x2="444" y2="255" />
      </g>

      {/* price area + line (rising) */}
      <path d="M40 300 L104 262 L164 276 L224 214 L286 196 L350 150 L410 112 L410 320 L40 320 Z" fill="var(--amber)" opacity="0.09" />
      <polyline points="40,300 104,262 164,276 224,214 286,196 350,150 410,112" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* level lines: target / entry / stop */}
      <line x1="26" y1="112" x2="444" y2="112" stroke="var(--long)" strokeWidth="1.5" strokeDasharray="5 5" />
      <line x1="26" y1="210" x2="444" y2="210" stroke="var(--amber)" strokeWidth="1.5" />
      <line x1="26" y1="300" x2="444" y2="300" stroke="var(--short)" strokeWidth="1.5" strokeDasharray="5 5" />

      {/* current-price marker */}
      <circle cx="410" cy="112" r="4.5" fill="var(--amber)" stroke="var(--panel2, var(--panel))" strokeWidth="2" />

      {/* proportional reward/risk gauge (the Trade Ladder motif) */}
      <g>
        <rect x="474" y="112" width="22" height="188" rx="7" fill="var(--panel)" stroke="var(--border)" />
        <rect x="474" y="112" width="22" height="98" fill="color-mix(in srgb, var(--long) 24%, transparent)" />
        <rect x="474" y="210" width="22" height="90" fill="color-mix(in srgb, var(--short) 22%, transparent)" />
        <line x1="470" y1="210" x2="500" y2="210" stroke="var(--amber)" strokeWidth="2" />
      </g>

      {/* bottom summary */}
      <g fontFamily="var(--font-mono)" fontSize="12.5">
        <text x="26" y="352" fill="var(--muted)">Entry </text>
        <text x="70" y="352" fill="var(--text)">$214.10</text>
        <text x="140" y="352" fill="var(--short)">Stop $205.90</text>
        <text x="248" y="352" fill="var(--long)">Target $233.00</text>
        <text x="372" y="352" fill="var(--amber)">2.0R</text>
      </g>
    </svg>
  );
}

const iconBase: SVGProps<SVGSVGElement> = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** "A full trade story — or an honest refusal" */
export function IconPlan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 3.5L16 11H5" />
      <circle cx="5" cy="4" r="1.4" />
    </svg>
  );
}

/** "Five gates before any trade" */
export function IconGates(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M12 3l7 3v5c0 4-3 7-7 10-4-3-7-6-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** "Every number is auditable" */
export function IconAudit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </svg>
  );
}

/** "A morning shortlist" */
export function IconShortlist(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconBase} {...props}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4 5.5l1.2 1.2L7.5 4.4" />
      <path d="M4 11.5l1.2 1.2 2.3-2.3" />
      <circle cx="4.6" cy="18" r="1.1" />
    </svg>
  );
}
