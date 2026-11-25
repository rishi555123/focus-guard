# Roadmap

Here's what's done and what's coming next for Focus Guard.

## v1.0 (done)

- [x] Timed coding sessions (25, 50 or 90 minutes)
- [x] Blocking AI chat sites during a session
- [x] Unlocking with a written reason and a 60-second wait
- [x] Stats: sessions finished, focused minutes, AI visits blocked and passes used

## v1.1 (done)

- [x] Daily streaks
- [x] Weekly focus chart
- [x] Dark mode
- [x] Extension icons: an original logo, with toolbar icons that show on dark toolbars too
- [x] Path-based blocking for AI features inside normal sites, such as `github.com/copilot`, `x.com/i/grok`, `bing.com/chat`, `huggingface.co/chat` and Google Search AI Mode (`google.com/search?udm=50`), without blocking the rest of the site
- [x] Optional "AI app builders" group, off by default: `v0.app`, `bolt.new`, `lovable.dev`
- [x] Smarter unlock reason: replace the single text box with guided questions (what did you try, what did you expect, what happened instead) and reject keyboard-mashing like random letters
- [x] Real Incognito support with split mode: coordinate the two copies of the background script through shared storage, then test timers, rules and notifications in real Chrome
- [x] ~~Friendlier Incognito block: send blocked Incognito tabs to a hosted GitHub Pages explanation instead of Chrome's error page~~ Not needed: with split mode, Incognito tabs get the real block page

## v1.2 ideas

Not promises, just a sorted list to pick from. **Effort**: S (an afternoon), M (a few days), L (a week or more). **Risk**: how likely it is to break something that works today, or to need careful testing in a real browser.

### Quick wins

- [ ] **No theme flash on the Incognito block page.** The block page in a new Incognito window can flash the other theme (a known 1.1 limitation). The redirect rules could pass the theme in the block page's address, so it's right before the first paint. The popup and checklist would still flash, but rarely matter there. *Effort S, risk low.*
- [ ] **Announce unlock progress to screen readers.** The unlock status line ("Wait 45s…", "Pass granted…", errors) isn't a live region yet, so a screen reader doesn't hear it change. *Effort S, risk low.*
- [ ] **Bigger touch targets in the popup.** The Auto / Light / Dark buttons and the week arrows are about 24 to 28 px tall; 44 px is the usual minimum. *Effort S, risk low (the popup gets taller).*
- [ ] **Google AI Mode on country sites.** Only `google.com/search?udm=50` is a default, so `google.co.uk` and others need adding by hand. Add the common country domains as defaults. *Effort S, risk low.*
- [ ] **A clear message for very long blocklists.** Chrome allows 1,000 regex rules per extension, and an entry needs one (two with a pass). A list past that would fail to save its rules without saying why. *Effort S, risk low.*
- [ ] **Commit the screenshot and release scripts.** The 1.1 screenshots and the zip check were made with throwaway scripts. Keeping them in the repository (no dependencies beyond a local browser) would make the next release repeatable. *Effort S, risk low.*
- [ ] **Move the background tests' fake Chrome into its own helper,** like `tests/fake-popup.js`, so new test files can reuse it. *Effort S, risk low.*

### Medium

- [ ] **More than one query part in an entry.** Chrome's rule regexes have no lookahead, so an entry can require only one `?name=value` (a known 1.1 limitation). An entry with two could become one rule per order of its parts. *Effort M, risk medium (rule counts and matching need careful tests).*
- [ ] **Weekly focus goal.** Set a goal like "5 hours this week" and see progress next to the chart. New saved data, so it needs migration and upgrade tests from 1.0.0 and 1.1.0. *Effort M, risk low.*
- [ ] **Export and import stats and settings** as a JSON file the user saves and opens themselves. Useful for moving to a new computer, and a way to keep history that 1.1 couldn't back-fill (history starts at the update, a known 1.1 limitation). Import needs strict checking of the file. *Effort M, risk medium.* Replaces "Export stats" from the v2.0 list.
- [ ] **Hint-mode reminder after an unlock.** After **Open site**, remind the user once, for example in the pass notification, to ask for a hint, not the answer, or to paste the copied prompt. *Effort S to M, risk low.* Showing it on the AI site itself would need a content script, which Focus Guard avoids for privacy.
- [ ] **Reflection after a pass ends.** When a site is blocked again because its pass ended, the block page asks "Did you understand the fix?" (yes / partly / no), saved with the unlock note. *Effort M, risk low; new saved data, so it needs migration and tests.*
- [ ] **See your unlock notes.** The last 20 unlock notes are saved but never shown. A small "Your unlocks" list in the popup or on a page of its own would make them useful for reflection. *Effort M, risk low.*
- [ ] **Better onboarding.** A short "what's new" note after an update, and a first-session walkthrough on the setup checklist. *Effort M, risk low.*
- [ ] **Rename `pass.domain` and `pass.domains`.** Since 1.1 they hold blocklist entries, which can include a path. Renaming them needs migration code for passes saved by 1.0.0 and 1.1.0. *Effort S to M, risk medium.*
- [ ] **Build the release zips in GitHub Actions** when a `v*` tag is pushed, and attach them to the release, with a check that every file the manifest and pages load is inside. *Effort M, risk low.*

### Big

- [ ] **Publish to the Chrome Web Store and Edge Add-ons.** Updates would arrive by themselves instead of by replacing a folder. The Edge drafts in `docs/store-listing.md` are a start, but the store screenshots show 1.0.0, and the `<all_urls>` permission needs a clear justification. Store updates make migrations matter even more. *Effort L, risk medium.*
- [ ] **Firefox support.** Firefox's Manifest V3 differs: background scripts instead of a service worker, different `declarativeNetRequest` limits, and no split Incognito mode, so private windows would need a different design. Firefox does have `theme_icons`, which would solve the toolbar icon. *Effort L, risk high.*
- [ ] **A toolbar icon that follows the browser theme in Chrome.** Chrome has no `theme_icons`, so 1.1 outlines the icon instead (a known 1.1 limitation). An offscreen document could watch the system theme and swap the icon, but it needs the `offscreen` permission and follows Windows, not Chrome's own theme. *Effort M, risk medium; only worth it if the outline isn't enough.*
- [ ] **Translations** with Chrome's `_locales` messages. Many strings are built in JavaScript from the constants, so they'd need message placeholders, and the docs would stay in English. *Effort L, risk medium.*
- [ ] **Split up `background.js`.** It's about 400 lines covering sessions, rules, passes, stats and the two Incognito copies. Splitting it into a few files loaded with `importScripts` would make it easier to work on. *Effort M to L, risk medium (the tests cover it well).*
- [ ] **Automated tests in a real browser.** Chrome-only behaviour (redirects, split Incognito mode, notifications) is checked by hand with `TESTING.md`. Automating it would need a browser-driving tool, which goes against the "no dependencies" rule unless it's kept to a separate, optional dev setup. *Effort L, risk low for users, but adds upkeep.*

## v2.0

- [ ] Auto-start sessions on sites like GitHub or LeetCode
- [ ] Allowlist for docs sites
