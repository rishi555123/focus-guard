# Focus Guard: Code Without the Crutch

[![Tests](https://github.com/rishi555123/focus-guard/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/rishi555123/focus-guard/actions/workflows/test.yml)

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
- **Pass notifications** one minute before a pass ends, when it ends, and when it moves to another site.
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

When you first install it, Focus Guard opens a short setup checklist: turn off Gemini in Chrome, allow Focus Guard in Incognito, and allow Chrome notifications in Windows. You can reopen it any time from the **Setup checklist** link in the popup.

To update it after you change the code, go back to `chrome://extensions` and click the reload icon on the Focus Guard card.

## How to use it

1. Click the Focus Guard icon in your toolbar.
2. Pick a session length: 25, 50 or 90 minutes.
3. Click **Start coding session**.
4. Code! If you open an AI chat site, you'll land on the "Your brain first." page instead.
5. Work through the checklist. Still stuck? Write what you've tried, wait out the 60 seconds and use your 5-minute pass.
6. When the timer runs out, the session counts as finished and sites unblock automatically. You can also click **End session early**, but then it won't count as finished.

To change which sites are blocked, open the popup when no session is running. Expand **Blocked sites**, put one domain per line and click **Save sites**. Subdomains are covered automatically. You can paste full links too: `https://www.chatgpt.com/c/123` is saved as `chatgpt.com`. If a line isn't a valid domain, nothing is saved and the popup tells you which line to fix.

## Blocked sites

These are blocked by default, including all their subdomains:

| Service | Domains |
| --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Google Gemini and AI Studio | `gemini.google.com`, `aistudio.google.com` |
| Claude | `claude.ai` |
| Microsoft Copilot | `copilot.microsoft.com`, `copilot.cloud.microsoft` |
| Perplexity | `perplexity.ai` |
| DeepSeek | `deepseek.com` |
| Mistral Le Chat | `chat.mistral.ai` |
| Meta AI | `meta.ai` |
| Qwen | `chat.qwen.ai` |
| Kimi | `kimi.com`, `kimi.moonshot.cn` |
| Z.ai (GLM) | `chat.z.ai` |
| Grok | `grok.com` |
| Poe | `poe.com` |
| You.com | `you.com` |
| Phind | `phind.com` |
| Blackbox AI | `blackbox.ai` |
| LMArena | `lmarena.ai` |
| Duck.ai | `duck.ai` |
| Pi | `pi.ai` |
| T3 Chat | `t3.chat` |
| TypingMind | `typingmind.com` |

If you already have Focus Guard, new sites on this list are added to your blocklist when the extension updates. Any site you removed yourself stays removed.

## Known limitations

Focus Guard blocks websites by their address, so some AI tools are out of its reach:

- **AI built into the browser**, like Chrome's "Ask Gemini" button and side panel, or the Copilot sidebar in Edge. Chrome's Gemini panel is part of Chrome itself, not a tab, and Chrome deliberately keeps extensions out of it for security, so no extension can block it. You can turn it off yourself:
  1. Open Chrome's menu (the three dots, top right) and go to **Settings**.
  2. Click **AI innovations**, then **Gemini in Chrome**. On some Chrome versions this section is called **Google AI** or **AI Premium**.
  3. Turn off every switch there, including **Show Gemini at the top of the browser** and **Show Gemini in system tray and turn on keyboard shortcut**. That removes the side panel, the keyboard shortcut and the "Ask Gemini" prompts.
  4. To remove the sparkle icon from the toolbar, right-click it and choose **Unpin**.

  The setup checklist has a button that opens this settings page for you.
- **AI assistants in your code editor**, like GitHub Copilot, Cursor or other extensions in VS Code and JetBrains. Focus Guard only works inside Chrome. Most editors let you pause their AI features while you practise.
- **Google AI Overviews**, the AI summaries at the top of normal Google search results. They're part of the search page itself, so blocking them would mean blocking Google Search.
- **AI features inside normal sites**, like `github.com/copilot`, `x.com/i/grok` or Google's AI Mode. Blocking the whole site would be wrong here, so they aren't blocked yet. Blocking just those pages is planned. See [ROADMAP.md](ROADMAP.md).
- **Incognito windows**, unless you allow Focus Guard there. The popup reminds you and has a button that opens the right settings page. Turn on **Allow in Incognito** there.
- **The block page in Incognito.** Once you allow it, Focus Guard does block AI sites in Incognito windows, but you see Chrome's error page instead of the "Your brain first." page. Chrome doesn't let extensions show their own pages in Incognito tabs unless they run a separate copy of themselves there, and that would make sessions, passes and notifications unreliable. So the checklist and the unlock button aren't available in Incognito. If you're truly stuck, unlock the site from a normal window, then type the site's address again in the Incognito address bar. Clicking **Reload** on Chrome's error page doesn't work, because it reloads the blocked page's address instead of the site.
- **Desktop and phone apps**, like the ChatGPT or Claude apps. These run outside Chrome.

## Privacy

Everything stays on your computer.

- Your sessions, stats, blocklist and the unlock notes you write are saved only in `chrome.storage.local` in your own browser.
- Focus Guard has no servers, no analytics and no tracking, and it never sends your data anywhere.
- It asks for access to all sites so it can spot when you open a blocked site and redirect that tab to the block page. It doesn't read or collect the content of the pages you visit.

Uninstalling the extension deletes all of its data. Chrome then opens the [Removed Focus Guard?](#removed-focus-guard) section below. That's a normal page visit; nothing about you is sent with it.

## Removed Focus Guard?

Thanks for trying it! If you turned off Gemini in Chrome during setup, here's how to turn it back on:

1. Open Chrome's menu (the three dots, top right) and go to **Settings**.
2. Click **AI innovations**, then **Gemini in Chrome**. On some Chrome versions this section is called **Google AI** or **AI Premium**.
3. Turn the switches you want back on, like **Show Gemini at the top of the browser** and **Show Gemini in system tray and turn on keyboard shortcut**.
4. To bring back the sparkle icon, right-click the top of the browser and choose **Pin Gemini**.

Anything else you changed during setup, like allowing Focus Guard in Incognito, went away with the extension. Chrome notifications in Windows can stay on; other apps and sites use them too.

Have a minute? [Open an issue](https://github.com/rishi555123/focus-guard/issues) and tell us why you removed it.

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
| `src/blocked/links.js` | Reads the block page's address and works out where "Back to my code" goes |
| `src/shared/style.css` | Shared graph-paper styling |
| `src/shared/sites.js` | Cleans and checks what you type into the blocklist |
| `src/shared/setup.js` | Setup buttons shared by the popup and the welcome page |
| `src/welcome/welcome.html` / `welcome.js` | The setup checklist that opens on first install |
| `icons/` | Extension and toolbar icons |
| `docs/screenshots/` | Screenshots for the docs |
| `tests/` | Tests for the background logic, blocklist input, block page links and manifest paths (run with `node --test`) |
