/**
 * Loader for the /methodology documentation pages.
 *
 * The doc is embedded into the bundle at build time (lib/methodology-doc.generated.ts,
 * produced by scripts/embed-methodology.mjs) and split into sections by its
 * '## ' headings. We embed rather than read the filesystem because the
 * Cloudflare Workers runtime has no filesystem. The doc itself declares the
 * site structure: each Part I/II section is one page.
 *
 * Content is rendered from the doc, never paraphrased — the methodology doc
 * is the binding spec (CLAUDE.md), and II.10 is published verbatim.
 */
import { METHODOLOGY_DOC } from './methodology-doc.generated';

export type MethodologyPart = 'indicators' | 'engine';

export interface MethodologySection {
  /** URL slug, e.g. "rsi" or "gates" (or "example" / "limitations"). */
  slug: string;
  /** Doc section number, e.g. "I.4" or "II.7". */
  number: string;
  /** Full heading text after the number, e.g. "The refusal gates — full math". */
  title: string;
  /** Title truncated at the first " — " for compact nav labels. */
  shortTitle: string;
  /** Section body markdown (heading line excluded; rendered as the page title). */
  markdown: string;
}

/** Slug → doc section number. Order here is the canonical nav order. */
const SLUG_MAPS: Record<MethodologyPart, Record<string, string>> = {
  indicators: {
    sma: 'I.1',
    ema: 'I.2',
    macd: 'I.3',
    rsi: 'I.4',
    atr: 'I.5',
    adx: 'I.6',
    obv: 'I.7',
    'relative-volume': 'I.8',
    bollinger: 'I.9',
    pivots: 'I.10',
  },
  engine: {
    families: 'II.1',
    weights: 'II.2',
    composite: 'II.3',
    confidence: 'II.4',
    stops: 'II.5',
    targets: 'II.6',
    gates: 'II.7',
    sizing: 'II.8',
  },
};

const EXAMPLE_NUMBER = 'II.9';
const LIMITATIONS_NUMBER = 'II.10';

interface RawSection {
  number: string;
  title: string;
  markdown: string;
}

interface ParsedDoc {
  overview: string;
  byNumber: Map<string, RawSection>;
}

let parsed: ParsedDoc | null = null;

const SECTION_HEADING = /^## (I{1,2})\.(\d+)\s+(.+)$/;

function parseDoc(): ParsedDoc {
  if (parsed) return parsed;

  const lines = METHODOLOGY_DOC.split('\n');

  const byNumber = new Map<string, RawSection>();
  const overviewLines: string[] = [];
  let current: { number: string; title: string; lines: string[] } | null = null;
  let inOverview = true;
  let inFence = false;

  const flush = (): void => {
    if (!current) return;
    byNumber.set(current.number, {
      number: current.number,
      title: current.title,
      markdown: current.lines.join('\n').trim(),
    });
    current = null;
  };

  for (const line of lines) {
    const isFenceDelimiter = /^\s*```/.test(line);
    if (isFenceDelimiter) inFence = !inFence;

    // Headings only count outside fenced code blocks (the pipeline diagram
    // is a fence and must stay intact inside the overview).
    if (!inFence && !isFenceDelimiter) {
      if (/^# /.test(line)) {
        // "# Part I — Indicators" / "# Part II — Determination" are structural
        // separators; the top H1 is replaced by the page's own title.
        flush();
        if (/^# Part /.test(line)) inOverview = false;
        continue;
      }
      const match = SECTION_HEADING.exec(line);
      if (match) {
        flush();
        inOverview = false;
        current = { number: `${match[1]}.${match[2]}`, title: match[3].trim(), lines: [] };
        continue;
      }
    }

    if (current) {
      current.lines.push(line);
    } else if (inOverview) {
      overviewLines.push(line);
    }
  }
  flush();

  // Drop a trailing horizontal rule left dangling by the Part I separator.
  const overview = overviewLines.join('\n').trim().replace(/\n---\s*$/, '').trim();

  parsed = { overview, byNumber };
  return parsed;
}

function toSection(slug: string, rawSection: RawSection): MethodologySection {
  return {
    slug,
    number: rawSection.number,
    title: rawSection.title,
    shortTitle: rawSection.title.split(' — ')[0],
    markdown: rawSection.markdown,
  };
}

/** Everything before Part I, including the pipeline diagram. */
export function getOverview(): string {
  return parseDoc().overview;
}

/** Slugs for a part, in canonical nav order. */
export function listSlugs(part: MethodologyPart): string[] {
  return Object.keys(SLUG_MAPS[part]);
}

/** Section for a slug, or null when the slug is unknown (page calls notFound()). */
export function getSection(part: MethodologyPart, slug: string): MethodologySection | null {
  const number = SLUG_MAPS[part][slug];
  if (!number) return null;
  const rawSection = parseDoc().byNumber.get(number);
  return rawSection ? toSection(slug, rawSection) : null;
}

/** All sections for a part, in nav order (used by the layout nav and overview grid). */
export function listSections(part: MethodologyPart): MethodologySection[] {
  return listSlugs(part).flatMap((slug) => {
    const section = getSection(part, slug);
    return section ? [section] : [];
  });
}

function getRequiredSection(slug: string, number: string): MethodologySection {
  const rawSection = parseDoc().byNumber.get(number);
  if (!rawSection) {
    throw new Error(`Methodology doc section ${number} not found (expected for /methodology/${slug}).`);
  }
  return toSection(slug, rawSection);
}

/** II.9 — the worked end-to-end trade derivation. */
export function getExample(): MethodologySection {
  return getRequiredSection('example', EXAMPLE_NUMBER);
}

/** II.10 — limitations; published verbatim per the doc itself. */
export function getLimitations(): MethodologySection {
  return getRequiredSection('limitations', LIMITATIONS_NUMBER);
}
