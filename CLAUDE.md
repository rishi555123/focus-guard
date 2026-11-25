# CLAUDE.md

Notes for AI coding sessions on Focus Guard. Read this first, then README.md, CONTRIBUTING.md and ROADMAP.md.

## What it is

A Manifest V3 extension for Chrome and Edge that blocks AI chat sites (and AI parts of other sites, like `github.com/copilot`) during timed coding sessions. **Core principle: friction, not a ban; hints, not answers.** A blocked site shows a "Your brain first." page with questions to try. Still stuck? Answer three questions (what you tried, expected, got), wait, and get a short pass for that one site, plus a "Copy as AI prompt" that asks for a hint, not the solution. Keep new features in that spirit.

Installed with Load unpacked from GitHub releases; not in any store. Website in `site/`, deployed by Netlify from `main`.

## Architecture

- `src/background/background.js`: the service worker. Sessions, blocking rules (`declarativeNetRequest` dynamic rules, redirecting to the block page), passes, alarms, stats, notifications, install-time migrations. It loads `src/shared/` files with `importScripts`.
- `src/popup/`, `src/blocked/` (block page), `src/welcome/` (setup checklist).
- `src/shared/`: `constants.js` (all the numbers), `sites.js` (blocklist entries: `cleanSite`, `entryMatches`, `entryRegex`, `entryCovers`, app builders group), `reason.js` (unlock answers, mashing check, AI prompt), `streaks.js` (daily history, streak, weeks), `theme.js` (light/dark before first paint), `browser.js` (Chrome vs Edge wording), `setup.js`, `style.css`.
- Plain scripts, no modules: shared files define globals, so **script order in the HTML matters** (`constants.js` first).

**Data** is all in `chrome.storage.local`: `sites`, `knownDefaults`, `blockAppBuilders`, `session {startedAt, endsAt, minutes}`, `pass {domain, domains, until}` (despite the names, these hold blocklist entries, which can include a path), `stats {blocked, sessions, minutes, unlocks, log[20], days{YYYY-MM-DD: {sessions, minutes}}}`, `lastMinutes`, `geminiOff`, `copilotOff`, `theme` (missing = Auto). Pages also keep a `localStorage` copy of `theme` so it applies before the first paint.

**Messages** to the background (`chrome.runtime.sendMessage`, handled one at a time by `serial()`): `start`, `stop`, `blocked`, `unlock`, `sitesChanged`, `testNotification`. **Alarms**: `sessionEnd`, `tick`, `passWarn`, `passEnd`.

**Service worker rules:** Chrome can stop it at any time, so keep **no state in memory** that matters. Everything is in storage, and `reconcile()` rebuilds alarms and rules from it on startup, install and changes.

**Split Incognito mode** (`"incognito": "split"`): Chrome runs a second copy of the background script for Incognito. The copies share `chrome.storage.local` but can't message each other and each sees only its own tabs. Each copy remembers its own writes (`save()` / `forget()`) and reacts to the other's through `storage.onChanged`. **The normal copy owns** install-time work, ending sessions on time (and counting them), and ending passes with their notifications. The Incognito copy only syncs its rules and tabs. Don't add work that both copies would do twice.

## Rules

- **No dependencies, no build step.** Plain HTML, CSS and JavaScript; tests use Node's built-in `node --test` (Node 22+).
- **Numbers live in `src/shared/constants.js`.** `tests/constants.test.js` fails if one is typed out elsewhere in `src/`. Docs repeat them: update the files CONTRIBUTING lists when one changes.
- **Every change to stored data needs migration code and upgrade tests** from 1.0.0 and 1.1.0 saved data (see the upgrade tests in `tests/background.test.js`). A missing key must keep meaning the old behaviour.
- **Everything the block page loads must be in `web_accessible_resources`** (and in the allowlist in `tests/manifest.test.js`).
- **`PRIVACY.md` and `site/privacy.html` change together**, with a new effective date. Update them whenever what's stored changes.
- **`CHANGELOG.md` and `site/releases.html` stay in sync** for released versions (tests check every bullet). New work goes under `[Unreleased]`.
- Keep the colour contrast tests passing in light and dark (`tests/style.test.js`, `tests/contrast.js`).
- Don't change extension behaviour in docs-only work.

## How the owner likes to work

- Inspect and propose a plan before writing code; collect open decisions in one list.
- One commit per task, on a branch, with a CHANGELOG bullet where it fits.
- Run `node --test` before every commit, on the exact staged files.
- Show a diff summary (and screenshots for UI changes, light and dark) before committing.
- **No push, merge, tag or release without the owner's OK.** Merge PRs with a merge commit, never squash.

## Release checklist

CONTRIBUTING.md ("Make a release") has the full steps: bump `manifest.json` version; CHANGELOG `[Unreleased]` → `[x.y.z] - date`; add the version to `site/releases.html` with the Latest badge and its download button; update README, site and TESTING.md; merge to `main`; build `dist/focus-guard-x.y.z.zip` and `dist/focus-guard.zip` with `git archive` from the merged commit; tag `vx.y.z`; GitHub release with both zips; check the live site and its download links.

## Gotchas from 1.1

- **Windows line endings.** The checkout has CRLF (`core.autocrlf`); the repository has LF. When editing files with a script, keep each file's own line endings. Build zips with `git -c core.autocrlf=false archive` so they contain LF.
- **OneDrive locks files.** The repo is in a OneDrive folder; `git stash -u` once failed halfway removing an empty folder. Prefer exporting a tree (`git archive <tree> | tar -x`) to a scratch folder to test exact commits, instead of stashing.
- **Escaping when editing through a shell.** Python heredocs turned `\b`, `\n` and `\\` in JavaScript regexes and strings into the wrong characters more than once. For lines with backslashes, use a direct file edit, or check the result with `node --check` and `grep`.
- **`vm` cross-realm objects in tests.** Arrays and objects created inside a `vm` context aren't `deepStrictEqual` to ones from the test file, even when they look the same. Compare `structuredClone(...)` copies.
- **Fakes must match the real HTML.** The fake pages in the tests start with every element visible and enabled. Read `hidden` and `disabled` from the real HTML, or set them in the script on load.
