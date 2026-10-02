# Microsoft Edge Add-ons store listing

Drafts for submitting Focus Guard through [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd). Each section matches a Partner Center page and is ready to paste. Requirements are from Microsoft's [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) (updated 2 September 2026) and [Developer policies for the Microsoft Edge Add-ons website](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) (updated 24 July 2026). Checked on 2 October 2026.

The listing deliberately doesn't mention other browsers: policy 1.1.2 says an extension "must not reference other browsers".

## Before you submit

These need a decision from you. None of them were changed here, because this task didn't touch extension code.

1. **Drop "beta" from the store build.** The manifest's `version_name` is `1.0.0-beta.1`. Microsoft's policies don't allow "non-production builds", like an extension "still in an experimental stage". For the store package, consider removing `version_name` so the listing shows plain `1.0.0`, and don't describe it as a beta.
2. **Consider removing the `tabs` permission.** Chrome's tabs documentation says host permissions already allow reading a tab's `url` and `pendingUrl`, which is all Focus Guard uses `tabs` for, and Focus Guard has `<all_urls>`. Policy 1.6 says to "only request those permissions that are necessary". Removing it needs a test run first (TESTING.md sections 2, 3 and 4). If you keep it, the justification below is accurate.
3. **Add an Edge screenshot of the setup checklist** if you want one. `docs/screenshots/welcome.png` shows the Chrome setup steps, so it isn't used for this listing.
4. **The short description comes from `manifest.json`**, and Partner Center won't let you edit it there (see below).

## Package

Upload `dist/focus-guard-1.0.0-beta.1.zip`, built with:

```bash
git -c core.autocrlf=false archive --format=zip -9 -o dist/focus-guard-<version>.zip HEAD manifest.json src icons
```

It contains `manifest.json` at the root plus `src/` and `icons/`, nothing else. If you change the manifest (items 1 and 2 above), rebuild it.

## Availability

- **Visibility:** Public
- **Markets:** All markets

## Properties

| Field | Value |
| --- | --- |
| Category | Productivity |
| Website | https://github.com/rishi555123/focus-guard |
| Support contact detail | https://github.com/rishi555123/focus-guard/issues |
| Mature content | No (leave unticked) |

## Privacy

### Single purpose description

> Focus Guard blocks AI chat websites during timed coding sessions and asks the user to try a few debugging and problem-solving questions first, so they practise solving problems themselves. A user who is still stuck can unlock one site for 5 minutes after writing what they tried and waiting 60 seconds.

### Permission justification

| Permission | Justification |
| --- | --- |
| `declarativeNetRequest` | During a coding session, Focus Guard uses redirect rules to send the user from AI chat sites on their blocklist to the extension's own block page. When the user earns a 5-minute pass, it adds a higher-priority allow rule for that one site, and removes it when the pass ends. All rules are built locally from the user's blocklist. None are downloaded. |
| `<all_urls>` (host permission) | A `declarativeNetRequest` redirect only works on sites the extension has host permission for, and users can add any website to their blocklist, so the sites aren't known in advance. The host permission also lets Focus Guard check the address of tabs that are already open, so AI tabs open when a session starts are sent to the block page too. Focus Guard has no content scripts, never reads page content, and makes no network requests. |
| `tabs` | Reads the address (`url` and `pendingUrl`) of open tabs, to find AI chat tabs that were already open or still loading when a session starts or a pass ends, and to catch navigations the redirect rules don't see, like Back and Forward. Addresses are only compared with the blocklist, never stored or sent. |
| `alarms` | Ends the coding session on time, ends 5-minute passes, shows a warning one minute before a pass ends, and updates the minutes left on the toolbar badge. Alarms keep working while the background service worker is asleep. |
| `storage` | Saves the user's blocklist, the current session and pass, simple stats, the user's last 20 unlock notes and a few settings in `chrome.storage.local` on their device. Nothing is synced or sent anywhere. |
| `notifications` | Tells the user one minute before a pass ends, when it ends, and when it moves to another site. Notifications contain only the site's name and follow the user's notification settings. |

### Are you using remote code?

**No, I am not using remote code.** Focus Guard is Manifest V3, and all of its code is in the package.

### Data usage

- **What user data do you plan to collect:** tick nothing. Focus Guard collects no user data. It checks page addresses against the blocklist locally, but never records or transmits them.
- **Certifications:** tick all three. They're true, since nothing is collected, sold, transferred or used for unrelated purposes.

### Privacy policy URL

https://github.com/rishi555123/focus-guard/blob/main/PRIVACY.md

Microsoft only requires one if the extension collects personal information, which Focus Guard doesn't. It's provided anyway, because the store shows it to users.

## Store listing (English)

### Extension name

From the manifest (read-only in Partner Center): **Focus Guard: Code Without the Crutch**

### Short description

Partner Center takes this from the manifest's `description` field and doesn't let you edit it there. "To edit the short description, you must update the description field in the manifest file … and then re-upload the package." The current value is:

> Blocks AI chat sites during coding sessions so you solve problems yourself first.

To end the short description with the icon credit too, change the manifest's `description` to this (105 characters, within the 132-character manifest limit) and rebuild the package:

> Blocks AI chat sites while you code. Security agent icon by Any Icon from Flaticon, recolored and resized

The full description below already ends with the credit, which covers Flaticon's attribution requirement on the listing page.

### Description

Required: 250 to 10,000 characters. This draft is about 2,100.

```text
Focus Guard helps you learn to code by making you try first. During a coding session, AI chat sites like ChatGPT, Gemini, Claude, Microsoft Copilot, Perplexity and DeepSeek are replaced by a "Your brain first." page.

HOW IT WORKS
- Start a 25, 50 or 90 minute coding session from the toolbar. The toolbar badge shows the minutes left.
- Open an AI chat site and you'll see 6 questions to try first: 3 debugging questions, like "What changed since it last worked?", and 3 problem-solving questions, like "What's the brute-force solution, even if it's slow?". They're picked at random from a larger pool each time.
- Still stuck? Write what you tried (at least 60 characters), wait 60 seconds, and get a 5-minute pass for that one site. Every other AI site stays blocked.
- Notifications tell you one minute before a pass ends, when it ends, and when it moves to another site.
- Outside a session, every site works normally.

FEATURES
- Blocks 25 AI chat sites and their subdomains by default.
- Edit the blocklist yourself. It's locked during a session, so you can't quietly remove a site.
- Simple stats: sessions finished, focused minutes, AI visits blocked and passes used.
- A short setup checklist on first install, including an optional step to turn off Copilot in Edge.

PRIVACY
Focus Guard collects no data and sends nothing anywhere. Your blocklist, sessions, stats and unlock notes are saved only on your device. There are no accounts, servers, ads or analytics.

LIMITATIONS
- Edge's Copilot button and sidebar are part of the browser, so Focus Guard can't block them. The setup checklist shows how to turn them off.
- In InPrivate windows, blocked sites show the browser's error page instead of Focus Guard's page, so you can't unlock them there. Allow Focus Guard in InPrivate on its extension settings page, and unlock from a normal window.
- AI features inside other sites, like coding assistants in your editor or AI answers in search results, aren't blocked.

Focus Guard is open source under the MIT license.

Security agent icon by Any Icon from Flaticon, recolored and resized
```

### Images

All in `docs/store/`, made from real screenshots of the extension:

| Field | File | Size | Microsoft's requirement |
| --- | --- | --- | --- |
| Extension logo (required) | `logo-300.png` | 300 × 300 | 1:1, recommended 300 × 300, minimum 128 × 128 |
| (fallback logo) | `logo-128.png` | 128 × 128 | The original icon, pixel for pixel |
| Screenshot 1 | `screenshot-1-questions.png` | 1280 × 800 | Up to 6, each 640 × 480 or 1280 × 800 |
| Screenshot 2 | `screenshot-2-unlock.png` | 1280 × 800 | |
| Screenshot 3 | `screenshot-3-popup.png` | 1280 × 800 | |
| Small promotional tile (optional) | Not made | | 440 × 280 |
| Large promotional tile (optional) | Not made | | 1400 × 560 |

The largest icon in the extension is 128 × 128. `logo-300.png` was rebuilt from its outline in the same navy (`#1D3B6E`) so the edges stay sharp, rather than stretching the pixels. Policy 1.1.2 says screenshots "must not be stretched or blurry", so the screenshots use the original captures at their own resolution or smaller, never enlarged.

### Search terms

Up to 7 terms, 30 characters each, 21 words in total:

1. `focus`
2. `coding`
3. `block AI sites`
4. `study timer`
5. `leetcode practice`
6. `learn to code`
7. `distraction blocker`

That's 7 terms and 14 words.

## Notes for certification

Paste into **Notes for certification** on the **Submit your extension** page:

```text
No account, login or server is needed. Everything runs locally.

HOW TO TEST
1. After installing, a "Welcome to Focus Guard" setup page opens. Its steps are optional.
2. Click the Focus Guard toolbar icon, pick 25 min and click "Start coding session". The badge shows the minutes left.
3. Open https://chatgpt.com. You're redirected to Focus Guard's "Your brain first." page with 6 questions.
4. In "Still truly stuck?", type at least 60 characters, click "Start 60-second wait" and wait 60 seconds. You're sent to chatgpt.com with a 5-minute pass. Other AI sites, like https://claude.ai, stay blocked.
5. Click "End session early" in the popup. All sites open normally again.

TESTING TIMERS WITHOUT WAITING
At edge://extensions, open Focus Guard's "service worker" console and run:
- chrome.alarms.create("passWarn", { when: Date.now() + 2000 })  -> "1 minute left" notification (needs an active pass)
- chrome.alarms.create("passEnd", { when: Date.now() + 2000 })   -> ends the pass
- chrome.alarms.create("sessionEnd", { when: Date.now() + 2000 }) -> ends the session

THINGS THAT MAY LOOK UNUSUAL
- Blocking only happens during a session. Outside one, nothing is blocked.
- In InPrivate windows, blocked sites show the browser's error page, not Focus Guard's page. Extensions can't show their own pages in InPrivate tabs without split incognito mode. This is documented in the listing.
- Edge's built-in Copilot sidebar isn't blocked. The setup page offers optional steps to turn it off.
- The code contains chrome:// addresses and Chrome wording. Focus Guard detects the browser with User-Agent Client Hints, as Microsoft recommends, and only uses edge:// addresses and Edge wording in Microsoft Edge.
- After removal, the browser opens a section of the project's README on GitHub explaining how to turn Copilot back on. No data is sent with it.
- Redirect rules are built locally from the user's blocklist. None are fetched remotely.

Source code: https://github.com/rishi555123/focus-guard
Privacy policy: https://github.com/rishi555123/focus-guard/blob/main/PRIVACY.md
```

## Sources

- [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), Microsoft Learn. Package contents, properties, the Privacy page (single purpose, permission justification, remote code, data usage, privacy policy), store listing fields and limits, image sizes, search terms and notes for certification.
- [Developer policies for the Microsoft Edge Add-ons website](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies), Microsoft Learn. 1.1.2 (accurate description, limitations, no references to other browsers, screenshots not stretched or blurry), 1.1.4 (search terms), 1.2 and 1.6 (permissions), 1.5 (personal information and privacy policy), 1.9 (notifications), 2.2 (third-party content and credit), and the rule against non-production builds.
- [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs), Chrome for Developers. Host permissions also allow reading a tab's `url` and `pendingUrl`.
