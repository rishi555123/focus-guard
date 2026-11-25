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

## v2.0

- [ ] Auto-start sessions on sites like GitHub or LeetCode
- [ ] Allowlist for docs sites
- [ ] Export stats
