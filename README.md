# Focus Guard: Code Without the Crutch

A Chrome extension that blocks AI chat sites while you code, so you try solving the problem yourself first.

## Why I built this

Recently, whenever I sat down to solve problems on LeetCode, CodeChef, or HackerRank, my hand would automatically move toward ChatGPT or Gemini. Instead of thinking through the problem, I'd paste it in, copy the answer, and submit. That's plagiarism, and worse, I wasn't actually learning anything.

I built Focus Guard to break that habit. It doesn't ban AI completely. It just adds enough friction that I have to try solving the problem myself first. If I'm genuinely stuck after really trying, I can still get help, but only after writing down what I've attempted.

## The problem

You hit a bug. Before you've even finished reading the error, a new tab is open and you're pasting it into ChatGPT or Gemini.

It feels productive, but it skips the part where you actually learn: reading the stack trace, poking at the code, forming a guess and checking it. Do that every day and you get faster at asking, not at debugging.

## How Focus Guard solves it

Focus Guard doesn't ban AI. It adds **friction**.

While a coding session is running, AI chat sites are swapped out for a "Your brain first." page. It gives you a quick checklist of things to try. If you're still stuck, you can unlock the sites:

1. Write down what you've tried (at least 60 characters).
2. Wait 60 seconds. Use the time to try one more idea.
3. Get a 5-minute pass for that one site, and you're sent back to it. Every other AI site stays blocked.

Most of the time, writing the problem down or waiting that minute is enough to get you unstuck on your own. When it isn't, the AI is still there.

## Features

- **Timed coding sessions** of 25, 50 or 90 minutes, with a countdown in the popup and minutes left shown on the toolbar icon.
- **Blocks AI chat sites only during a session.** Outside a session, everything works normally.
- **Catches tabs that are already open.** Any AI tabs open when you start a session get redirected too.
- **Debugging checklist** on the block page: read the error, add a print, rubber-duck it, check the docs, shrink the failing code, take a walk.
- **Earned 5-minute passes** after you write a note and wait 60 seconds. A pass only unlocks the site you were stuck on.
- **Your own blocklist.** Add or remove sites from the popup. The list is locked during a session so you can't quietly remove a site to get around the block.
- **Simple stats**: sessions finished, focused minutes, AI visits blocked and passes used.

## Installation

Focus Guard isn't on the Chrome Web Store yet. You load it straight from this folder:

1. Download or clone this project to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (the switch in the top-right corner).
4. Click **Load unpacked**.
5. Select the `focus-guard` folder (the one with `manifest.json` in it).
6. Optional: click the puzzle-piece icon in the toolbar and pin Focus Guard so it's easy to reach.

To update it after you change the code, go back to `chrome://extensions` and click the reload icon on the Focus Guard card.

## How to use it

1. Click the Focus Guard icon in your toolbar.
2. Pick a session length: 25, 50 or 90 minutes.
3. Click **Start coding session**.
4. Code! If you open an AI chat site, you'll land on the "Your brain first." page instead.
5. Work through the checklist. Still stuck? Write what you've tried, wait out the 60 seconds and use your 5-minute pass.
6. When the timer runs out, the session counts as finished and sites unblock automatically. You can also click **End session early**, but then it won't count as finished.

To change which sites are blocked, open the popup when no session is running. Expand **Blocked sites**, put one domain per line and click **Save sites**. Subdomains are covered automatically.

## Blocked sites

These are blocked by default:

- `chatgpt.com`
- `chat.openai.com`
- `gemini.google.com`
- `claude.ai`
- `copilot.microsoft.com`
- `perplexity.ai`
- `chat.deepseek.com`
- `poe.com`
- `grok.com`
- `you.com`
- `phind.com`

## Privacy

Everything stays on your computer.

- Your sessions, stats, blocklist and the unlock notes you write are saved only in `chrome.storage.local` in your own browser.
- Focus Guard has no servers, no analytics and no tracking, and it never sends your data anywhere.
- It asks for access to all sites so it can spot when you open a blocked site and redirect that tab to the block page. It doesn't read or collect the content of the pages you visit.

Uninstalling the extension deletes all of its data.

## Contributing

Ideas, bug reports and pull requests are all welcome!

- **Found a bug or have an idea?** Open an issue and tell us what happened or what you'd like to see.
- **Want to add a site to the default list?** Add it to `DEFAULT_SITES` at the top of `src/background/background.js`.
- **Making a change?** Keep it small and focused. Reload the extension in `chrome://extensions` and test it by starting a session, visiting a blocked site and going through the unlock flow.

There's no build step. It's plain HTML, CSS and JavaScript, so you can start editing right away.

Here's a quick map of the files:

| File | What it does |
| --- | --- |
| `manifest.json` | Extension settings and permissions |
| `src/background/background.js` | Runs sessions, timers, blocking rules and stats |
| `src/popup/popup.html` / `popup.js` | The toolbar popup |
| `src/blocked/blocked.html` / `blocked.js` | The "Your brain first." page |
| `src/shared/style.css` | Shared graph-paper styling |
| `icons/` | Extension and toolbar icons |
| `docs/screenshots/` | Screenshots for the docs |
| `tests/` | Tests for the background logic (run with `node --test`) |
