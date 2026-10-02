# Privacy policy for Focus Guard

**Effective date:** 2 October 2026

Focus Guard is a browser extension for Google Chrome and Microsoft Edge that blocks AI chat sites during coding sessions. This policy explains what it does with your information. The short version: **Focus Guard collects no data and sends nothing anywhere.** Everything it needs stays in your own browser.

## What Focus Guard collects

Nothing. Focus Guard has no servers, no accounts, no analytics, no advertising and no tracking. It never sends your information to the developer or to anyone else, and it doesn't sell or share it.

## What Focus Guard stores on your device

To work, Focus Guard saves a small amount of data with `chrome.storage.local`, the browser's built-in storage for extensions. (Chrome and Edge both use this name.) This data stays on your computer, in your browser profile:

| Data | Why |
| --- | --- |
| Your blocklist of AI sites | To know which sites to block |
| The current session's start and end time and length | To run the timer and end the session |
| The current pass: which site and when it ends | To unlock just that site for 5 minutes |
| Stats: sessions finished, focused minutes, AI visits blocked, passes used | To show your progress in the popup |
| Your last 20 unlock notes, each with the site and time | The notes you write before a pass. They're kept only on your device. |
| A few settings: your last session length, which default sites you've already been offered, and whether you've ticked the setup checklist steps | To remember your choices |

## Browsing activity

To block a site, Focus Guard compares the address of the page you're opening with your blocklist. This happens entirely inside your browser:

- Focus Guard doesn't record, store or send the pages you visit.
- It doesn't read the content of any web page. It has no content scripts.
- When it blocks a site, the blocked address appears in the block page's own address so it can send you back after a pass. That's part of your normal browser history, which you control in your browser's settings.

## Notifications

Focus Guard shows notifications about your passes, like "1 minute left on your pass". They're created on your device, contain only the site's name, and follow your Windows and browser notification settings.

## When you remove Focus Guard

Removing Focus Guard deletes everything it stored. Your browser then opens a page in this project's README on GitHub that explains how to turn Gemini in Chrome or Copilot in Edge back on. That's a normal page visit, like clicking a link. Focus Guard doesn't add anything about you to it. GitHub's own [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies to that visit.

## Your controls

- **See or change your blocklist** in the Focus Guard popup, whenever no session is running.
- **Delete everything** by removing Focus Guard at `chrome://extensions` or `edge://extensions`.
- **Turn off notifications** in Windows settings or your browser's notification settings. Focus Guard keeps working without them.

## Children

Focus Guard isn't directed at children under 13, and it collects no information from anyone.

## Changes to this policy

If Focus Guard ever changes how it handles information, this file will be updated before that version is released, with a new effective date. You can see every past version in the repository's history.

## Contact

Questions about privacy? [Open an issue](https://github.com/rishi555123/focus-guard/issues) on GitHub.

This policy is also on the Focus Guard website. The copy in this repository is the original.
