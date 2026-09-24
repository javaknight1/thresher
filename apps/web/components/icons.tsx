/**
 * Small inline nav icons — 16px, stroke=currentColor, no dependency. Prepended
 * to the header links (design: hyperlink + icon).
 */
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

export function IconLeaderboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function IconBrokerage(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21h18" />
      <path d="M4 10h16" />
      <path d="M12 3 4 7h16l-8-4z" />
      <path d="M6 10v11" />
      <path d="M10 10v11" />
      <path d="M14 10v11" />
      <path d="M18 10v11" />
    </svg>
  );
}

export function IconStocks(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {/* two candlesticks */}
      <path d="M7 3v3" />
      <path d="M7 14v4" />
      <rect x="4.5" y="6" width="5" height="8" />
      <path d="M17 6v2" />
      <path d="M17 16v3" />
      <rect x="14.5" y="8" width="5" height="8" />
    </svg>
  );
}

export function IconCrypto(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5h4a1.75 1.75 0 0 1 0 3.5h-4z" />
      <path d="M9.5 12h4.5a1.75 1.75 0 0 1 0 3.5H9.5z" />
      <path d="M11 7v1.5" />
      <path d="M11 15.5V17" />
      <path d="M13 7v1.5" />
      <path d="M13 15.5V17" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
