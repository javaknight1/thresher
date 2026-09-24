# Releasing Thresher

How we version and ship Thresher, and how the changelog is kept. Companion to
`MANUAL.md` (human setup steps) and `COSTS.md` (service pricing). Modeled on the
same approach used in sibling projects — good, prefixed commit messages ARE the
changelog.

## TL;DR

```bash
# 1. bump the version of record (root package.json "version"), commit as release:
# 2. push master, then tag and push the tag:
git tag v0.2.0 && git push origin v0.2.0
# 3. write the GitHub Release notes (the changelog) for that tag.
```

A **release = bump the version + push a `v*` tag + publish the GitHub Release**.

> ⚠️ **Deploy today is NOT tag-gated.** Thresher's git-connected Cloudflare
> Workers build **auto-deploys every push to `master`** (see `MANUAL.md`). So a
> tag is currently a **release marker** — it fixes the version and produces the
> changelog — while the actual deploy already happened on the push. Gating
> deploys on tags (like Travelify does on Vercel) is a **v0.2.0 automation** item
> (see "Roadmap for the release pipeline" below).

## What owns what

- **Version of record = root `package.json` `"version"`.** One number per
  release for the whole product. (The workspace packages `@thresher/web` and
  `@thresher/engine` keep their own independent package versions; those are
  library versions, not the product release number.)
- **Changelog = GitHub Releases, full stop.** Each release's notes are the
  **user-facing commit subjects since the previous tag** — drop `chore`,
  `docs`, `ci`, `build`, `test`, `style`, and `release` types. So writing clean
  Conventional Commits (`feat(web): …`, `fix(engine): …`) is writing the
  changelog. We do **not** render a changelog inside the app.
- **The gates are the quality bar.** `pnpm typecheck && pnpm lint && pnpm test`
  must be green before you tag (CLAUDE.md). Engine coverage ≥ 90%.

## Versioning (SemVer, pre-1.0 beta)

| Bump | For | Example |
|---|---|---|
| **PATCH** `0.1.x` | fixes only | `0.1.0 → 0.1.1` |
| **MINOR** `0.x.0` | new features (breaking OK pre-1.0) | `0.1.0 → 0.2.0` |
| **MAJOR** `1.0.0` | GA — only when we leave beta | — |

**`origin/master` is `0.15.0`**. The next batch ships as `0.15.1` (fixes) or
`0.16.0` (features).

## Cutting a release

1. Pick the bump (patch/minor) from what changed since the last tag.
2. Edit the root `package.json` `"version"` to the new number. Commit it alone
   as `release: vX.Y.Z` and push `master`.
3. Confirm the gates are green: `pnpm typecheck && pnpm lint && pnpm test`.
4. Tag and push:
   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
5. Publish the GitHub Release for the tag with the user-facing commit subjects
   since the previous tag as the notes:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z — <headline>" --notes "…"
   ```
6. Confirm the deploy: Cloudflare already built from the `master` push — check
   `https://thresher.sharkfins.xyz` loads and a known ticker analyzes.

## The bootstrap release

- **v0.1.0 — manual baseline** ✅ Hand-tagged on the current MVP with
  hand-written notes. It predates any release automation (there is none yet), so
  tagging it triggers nothing beyond marking the version and publishing the
  changelog. Everything up to and including the engine (M0), the Analyze page +
  live Yahoo data (M1), the Scan/Leaderboard, Clerk auth, Upstash, the
  onboarding/guide, Setup Score, brokerage tab + logos, and the cron precompute.

From here, each release is v0.1.x / v0.2.0 / … by the steps above.

## Roadmap for the release pipeline (deferred — target v0.2.0)

Thresher's baseline is intentionally manual. When we automate (mirroring the
sibling project's v0.2.0 step), add:

- [ ] **Surface the version** in three places: `/version` (plain-string route),
  `/api/health` (`version.app`), and the site footer.
- [ ] **`pnpm bump`** helper that auto-detects the next version from the commits
  since the last tag (refusing any non-increasing/invalid version).
- [ ] **`scripts/gh-release.sh`** — build the release notes from user-facing
  commit subjects since the previous tag (the filter above), so `gh release`
  isn't hand-assembled.
- [x] **CI** (`.github/workflows/ci.yml`) — typecheck + lint + unit tests on
  every push to `master` and on PRs.
- [x] **Security auto-release** — when `dependabot-automerge.yml` merges a
  *security* update (PR references a GHSA/CVE), it bumps the patch version,
  tags, and publishes the GitHub Release automatically. Routine dependency
  bumps merge without a release. (This bot path does NOT update the
  "`origin/master` is `X`" pointer above — re-sync it on the next manual
  release; it's just a doc note, not the source of truth.)
- [ ] **General release workflow:** a `v*`-tag workflow that publishes the
  GitHub Release for *manual* releases too (notes = user-facing commit subjects
  since the previous tag), so tagging is all that's needed.
- [ ] **Decide deploy gating:** either keep Cloudflare auto-deploy on `master`
  (tags stay pure markers) or gate production on tags. If we gate, document it
  here and flip the Cloudflare build trigger.
- [ ] **Migrations (once Supabase lands):** expand/contract only; run migrations
  before the deploy; never drop-and-deploy in one release. (No database yet, so
  nothing to migrate today.)
