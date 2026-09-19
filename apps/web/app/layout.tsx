import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { authEnabled } from '../lib/auth';
import { PREFS_STORAGE_KEY } from '../lib/config';
import PrefsBoot from '../components/PrefsBoot';
import './globals.css';

/**
 * Set <html data-theme> before first paint (no theme flash). Reads the same
 * localStorage blob lib/prefs writes; falls back to the OS preference.
 */
const THEME_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREFS_STORAGE_KEY}')||'{}');var t=(p&&p.theme)||'system';var d=t==='light'?'light':t==='dark'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',d);}catch(e){}})();`;

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Thresher — technical confluence desk',
  description:
    'Ticker and timeframe in, complete trade story out — entry, stop, target, reasoning, and honest confidence, or an honest refusal.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const tree = (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <PrefsBoot />
        {children}
      </body>
    </html>
  );
  // ClerkProvider only when keys are configured; otherwise the app renders open.
  return authEnabled() ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
