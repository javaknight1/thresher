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
