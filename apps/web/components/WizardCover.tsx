/**
 * Vibrant onboarding cover art — inline SVG (self-contained, no image pipeline).
 * Each key gets a bold multi-stop gradient plus a distinct motif, so the wizard
 * cards feel illustrated rather than flat.
 */
import type { ReactNode } from 'react';
import type { CoverArt } from '../lib/guide-content';

const W = 480;
const H = 190;

function Frame({ id, stops, children }: { id: string; stops: [string, string, string]; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.55" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.8" cy="0.2" r="0.9">
          <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

export default function WizardCover({ art }: { art: CoverArt }) {
  switch (art) {
    case 'candles':
      return (
        <Frame id="cov-candles" stops={['#E8B44C', '#E8635C', '#8E2C6F']}>
          <g stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round">
            {[
              [70, 60, 120],
              [130, 40, 150],
              [190, 70, 110],
              [250, 30, 140],
              [310, 55, 100],
              [370, 20, 130],
            ].map(([x, top, bot], k) => (
              <g key={x}>
                <line x1={x} y1={top} x2={x} y2={bot} />
                <rect
                  x={x - 12}
                  y={Math.min(top + 18, bot - 40)}
                  width="24"
                  height="42"
                  rx="3"
                  fill={k % 2 ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.18)'}
                  stroke="none"
                />
              </g>
            ))}
          </g>
        </Frame>
      );
    case 'waves':
      return (
        <Frame id="cov-waves" stops={['#3FCF8E', '#2E77C9', '#6A3FB5']}>
          <g fill="none" strokeWidth="4" strokeLinecap="round">
            <path d="M0 130 C 80 90, 160 170, 240 120 S 400 80, 480 120" stroke="rgba(255,255,255,0.9)" />
            <path d="M0 100 C 90 150, 170 70, 250 110 S 410 150, 480 90" stroke="rgba(255,255,255,0.5)" />
            <path d="M0 155 C 100 120, 180 190, 260 150 S 420 120, 480 160" stroke="rgba(0,0,0,0.18)" />
          </g>
        </Frame>
      );
    case 'grid':
      return (
        <Frame id="cov-grid" stops={['#4453C9', '#2E9BC9', '#25C7C0']}>
          <g stroke="rgba(255,255,255,0.35)" strokeWidth="1.5">
            {[40, 95, 150, 205].map((y) => (
              <line key={y} x1="0" y1={y} x2={W} y2={y} />
            ))}
            {[60, 140, 220, 300, 380, 460].map((x) => (
              <line key={x} x1={x} y1="0" x2={x} y2={H} />
            ))}
          </g>
          <g fill="rgba(255,255,255,0.95)">
            {[[140, 95], [300, 40], [380, 150]].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="7" />
            ))}
          </g>
        </Frame>
      );
    case 'target':
      return (
        <Frame id="cov-target" stops={['#E8635C', '#B5359B', '#5B2C9B']}>
          <g fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4">
            <circle cx={W / 2} cy={H / 2} r="72" opacity="0.4" />
            <circle cx={W / 2} cy={H / 2} r="48" opacity="0.7" />
            <circle cx={W / 2} cy={H / 2} r="24" />
          </g>
          <circle cx={W / 2} cy={H / 2} r="7" fill="rgba(255,255,255,0.95)" />
          <path d={`M${W / 2 + 60} ${H / 2 - 60} L ${W / 2} ${H / 2}`} stroke="rgba(0,0,0,0.25)" strokeWidth="4" />
        </Frame>
      );
    case 'gauge':
      return (
        <Frame id="cov-gauge" stops={['#2FBF8A', '#2E9BC9', '#3A5BD0']}>
          <g fill="none" strokeLinecap="round">
            <path d="M120 150 A 120 120 0 0 1 360 150" stroke="rgba(255,255,255,0.35)" strokeWidth="14" />
            <path d="M120 150 A 120 120 0 0 1 300 58" stroke="rgba(255,255,255,0.95)" strokeWidth="14" />
          </g>
          <g stroke="rgba(0,0,0,0.3)" strokeWidth="5" strokeLinecap="round">
            <line x1={W / 2} y1="150" x2="300" y2="72" />
          </g>
          <circle cx={W / 2} cy="150" r="9" fill="rgba(255,255,255,0.95)" />
        </Frame>
      );
    case 'shield':
      return (
        <Frame id="cov-shield" stops={['#E8635C', '#E8934C', '#B5359B']}>
          <g stroke="rgba(255,255,255,0.9)" strokeWidth="4" fill="none">
            {[0, 1, 2, 3, 4].map((k) => {
              const x = 70 + k * 70;
              const h = 40 + k * 22;
              return <rect key={k} x={x} y={H - 24 - h} width="34" height={h} rx="4" fill="rgba(255,255,255,0.18)" />;
            })}
            <path d="M40 150 L 130 60 L 200 110 L 300 40 L 440 40" stroke="rgba(255,255,255,0.95)" />
          </g>
        </Frame>
      );
    case 'horizon':
      return (
        <Frame id="cov-horizon" stops={['#5B2C9B', '#B5359B', '#E8B44C']}>
          <circle cx={W / 2} cy="128" r="46" fill="rgba(255,255,255,0.9)" />
          <g stroke="rgba(255,255,255,0.5)" strokeWidth="3">
            {[-3, -2, -1, 1, 2, 3].map((k) => (
              <line key={k} x1={W / 2 + k * 34} y1="30" x2={W / 2 + k * 46} y2="90" />
            ))}
          </g>
          <line x1="0" y1="128" x2={W} y2="128" stroke="rgba(0,0,0,0.25)" strokeWidth="4" />
        </Frame>
      );
  }
}
