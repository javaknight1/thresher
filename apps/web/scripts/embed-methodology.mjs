/**
 * Embeds docs/THRESHER-METHODOLOGY.md into a TS module so the /methodology
 * pages render from bundled content rather than reading the filesystem at
 * runtime. The Cloudflare Workers runtime has no filesystem (cwd is /bundle),
 * so the previous fs.readFileSync approach 500'd in production.
 *
 * Runs before every dev/build/test/deploy (see package.json). The generated
 * file is committed so a fresh checkout typechecks before the first build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const docPath = join(here, '..', '..', '..', 'docs', 'THRESHER-METHODOLOGY.md');
const outPath = join(here, '..', 'lib', 'methodology-doc.generated.ts');

const content = readFileSync(docPath, 'utf8');
const banner =
  '// AUTO-GENERATED from docs/THRESHER-METHODOLOGY.md by scripts/embed-methodology.mjs.\n' +
  '// Do not edit by hand; run `pnpm --filter @thresher/web embed:methodology` to refresh.\n';
writeFileSync(outPath, `${banner}export const METHODOLOGY_DOC = ${JSON.stringify(content)};\n`);

console.log(`embedded methodology doc (${content.length} chars) → lib/methodology-doc.generated.ts`);
