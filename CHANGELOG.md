# Changelog

All notable changes to Focus Guard are listed here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version in `manifest.json` matches the newest entry here.

## [Unreleased]

## [1.1.0] - 2026-11-25

Focus Guard's own logo, dark mode, three questions before unlocking with a copy-as-prompt button, blocking AI features inside normal sites like GitHub Copilot and Google AI Mode, daily streaks and a weekly chart, and the block page in Incognito and InPrivate windows.

### Added

- Dark mode for the popup, the setup checklist and the block page, in the same colours as the website's dark theme. It follows your system setting, or pick Auto, Light or Dark at the bottom of the popup. Every Focus Guard page switches straight away, with no flash of the wrong theme when one opens. In dark mode the logo is drawn with light lines.
- After a pass is granted, the block page waits for you to open the site and offers **Copy as AI prompt**. It copies your three answers with a request for a hint or an explanation of the cause rather than the full solution.
- An optional **Also block AI app builders** choice under **Blocked sites** in the popup, for v0.app, bolt.new and lovable.dev. It's off unless you turn it on, it's locked during a session like the list, and turning it off never removes sites you added yourself.
- A daily streak and a weekly chart in the popup. A day counts toward your streak when you finish at least one session, and a streak lasts until the end of the next day. The chart shows your focused minutes for each of the last 7 days. Focus Guard keeps daily totals for the last 60 days; history starts with your first session after updating, and your existing totals are kept.
- Blocking just part of a site: an entry like `github.com/copilot` blocks that page and the pages under it, and `google.com/search?udm=50` blocks Google's AI Mode but not normal searches. New defaults cover GitHub Copilot (`github.com/copilot`), Grok on X (`x.com/i/grok`), Copilot on Bing (`bing.com/chat`), HuggingChat (`huggingface.co/chat`) and Google AI Mode (`google.com/search?udm=50`). They're added on update like other new defaults, unless your list already blocks the whole site or you deleted them.

### Changed

- A new, original Focus Guard logo replaces the Flaticon icon: a brain over an "FG" shield between code brackets, in navy and yellow. It's used for the toolbar, extension and notification icons. The 16-pixel toolbar icon shows just the FG shield, so it stays readable at that size.
- The logo now appears inside Focus Guard too: next to the name in the popup, above the welcome on the setup checklist, and small at the top of the block page.
- The website uses the new logo and favicon. In dark mode it shows a version of the logo with light lines instead of inverting the colours, so the yellow stays yellow.
- Unlocking asks three questions instead of one box: what you tried, what you expected and what happened instead, each in at least 20 characters. Answers that look like random typing, like `asdfasdf` or the same word over and over, are turned down, and Focus Guard checks again before it grants a pass.
- The toolbar icon has a thin light outline, so the navy stands out on dark browser toolbars and themes as well as light ones. The website's favicon matches.
- The blocklist keeps the path of an address you paste, so it can block part of a site. After saving, the popup says which lines it left out because another entry already blocks them, and which new entries block only part of a site.
- In Incognito and InPrivate windows, blocked sites now show Focus Guard's block page with the questions and the unlock, instead of the browser's error page, once you allow Focus Guard there. Passes, sessions and notifications work across normal and private windows. Focus Guard now runs a separate copy of itself for private windows ("split" incognito mode), and the two copies stay in step through extension storage.

### Fixed

- If a pass can't be granted after the 60-second wait, the block page now shows the error in red and lets you try again, keeping what you wrote. Before, the button stayed disabled until you reloaded the page.
- If a session can't be started, the popup now says why instead of doing nothing.
- The keyboard focus outline in the popup, setup checklist and block page is now navy instead of yellow, so you can see it against the light background.

### Removed

- The Flaticon icon credit, from the README and the website footer, now that the icon is Focus Guard's own.

## [1.0.0] - 2026-10-02

The first public release, for Google Chrome and Microsoft Edge, installed from GitHub releases with Load unpacked.

### Added

**Microsoft Edge and Chrome from one codebase**
- Focus Guard detects Edge using User-Agent Client Hints, as Microsoft recommends, and adapts its setup to each browser.
- In Edge, the setup checklist offers an optional "Turn off Copilot in Edge" step instead of the Gemini step, says InPrivate instead of Incognito, and opens `edge://` settings pages. The popup's Gemini reminder only appears in Chrome.

**Coding sessions**
- Timed coding sessions of 25, 50 or 90 minutes, started from the toolbar popup.
- A countdown in the popup and the minutes left on the toolbar badge.
- **End session early**, which doesn't count the session as finished.

**Blocking**
- Blocking of 25 AI chat sites and all their subdomains during a session: ChatGPT, Gemini and AI Studio, Claude, Microsoft Copilot, Perplexity, DeepSeek, Mistral Le Chat, Meta AI, Qwen, Kimi, Z.ai, Grok, Poe, You.com, Phind, Blackbox AI, LMArena, Duck.ai, Pi, T3 Chat and TypingMind.
- Re-blocking of AI tabs that are already open when a session starts, including tabs still loading.
- A backup that catches pages the blocking rules can't see: Back and Forward, pages Chrome loads in advance, and moving between pages inside a single-page app.
- An editable blocklist in the popup. Pasted links are cleaned down to their domain, lines that aren't domains are rejected with a message, and the list is locked during a session.
- New default sites are added to existing blocklists on update, without bringing back sites you removed.

**The block page**
- A "Your brain first." page with questions to try before asking an AI: 3 debugging and 3 problem-solving questions, picked at random from a pool of 15 each time it opens. Ticking them off never reshuffles the list. The pool is in `src/blocked/questions.js`, so adding a question is one line.
- Unlocking by writing at least 60 characters about what you tried, then waiting 60 seconds, for a 5-minute pass.
- **Back to my code**, which goes back past the blocked site, or closes the tab if there's nothing to go back to.
- A leftover block page reopens its site once the session is over.

**Passes**
- Passes cover one site at a time, so every other AI site stays blocked.
- Sites that redirect elsewhere count as the same site: `chat.openai.com` and `chatgpt.com`, `bard.google.com` and `gemini.google.com`, `kimi.moonshot.cn` and `kimi.com`.
- A warning before the wait when unlocking would end your pass for another site.
- A note on tabs that were re-blocked because the pass moved or ran out.

**Notifications**
- "1 minute left on your [site] pass."
- "Your 5-minute pass for [site] is over. It's blocked again."
- "Your pass moved to [new site], so [old site] is blocked again."
- No pass notifications when the session itself ends first.

**Stats**
- Sessions finished, focused minutes, AI visits blocked and passes used.
- Visits count only once: reloads, Back and Forward, and re-blocked tabs aren't counted again.

**Setup**
- A setup checklist that opens on first install: turn off the browser's built-in AI (Gemini in Chrome, or optionally Copilot in Edge), allow Focus Guard in Incognito or InPrivate, and allow browser notifications in Windows, with a test notification.
- Popup reminders for Gemini in Chrome and for private windows, and a **Setup checklist** link.
- A "Removed Focus Guard?" page after uninstalling, explaining how to turn Gemini in Chrome or Copilot in Edge back on.

**Reliability**
- Recovery after a browser restart or extension update: lost timers are rebuilt, and a session that ran out while Chrome was closed is finished and counted.
- Events are handled one at a time, so a session ending and a pass changing at the same moment can't clash.
- Ending a session always clears its timers first, so no pass notification can arrive afterwards.

**Privacy**
- Everything is saved only in `chrome.storage.local` on your computer. No servers, analytics or tracking.

**For contributors**
- Automated tests that run with plain Node.js (`node --test`), and run on GitHub Actions with Node 22 and 24 for every push and pull request.
- A manual checklist for Chrome and Edge in `TESTING.md`, with console shortcuts for testing timers quickly.

Known limitations, like Chrome's built-in Gemini panel, Edge's Copilot sidebar and the block page in private windows, are listed in the [README](README.md#known-limitations).

[Unreleased]: https://github.com/rishi555123/focus-guard/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/rishi555123/focus-guard/releases/tag/v1.1.0
[1.0.0]: https://github.com/rishi555123/focus-guard/releases/tag/v1.0.0
