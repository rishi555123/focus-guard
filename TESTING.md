# Manual testing in Chrome

The automated tests (`node --test`) check the logic, but some things only show up in a real browser: redirects, notifications, settings pages and how pages look. Use this checklist before a release, or test the sections your change touches.

Tick each box as you go. If a step fails, note the section and step number in your issue or pull request.

## Before you start

1. Go to `chrome://extensions` and click the reload icon on Focus Guard.
2. On the same card, click **service worker** to open its console. The shortcuts below run there.
3. To inspect the popup, right-click it and choose **Inspect**. It stays open while DevTools is open.
4. Make sure Windows can show Chrome notifications: **Settings → System → Notifications → Google Chrome** is on, and **Do not disturb** is off.

## Console shortcuts

Run these in the service worker console. They save you from waiting for real timers.

The **Needs first** column says what has to be running before you use a command. Without it, the command does nothing: no notification appears and nothing changes.

| What | Needs first | Command |
| --- | --- | --- |
| See everything Focus Guard has saved | Nothing | `await chrome.storage.local.get(null)` |
| See the timers | Nothing | `await chrome.alarms.getAll()` |
| See the blocking rules | Nothing | `await chrome.declarativeNetRequest.getDynamicRules()` |
| Show the "1 minute left" warning in 2 seconds | **Active pass** | `chrome.alarms.create("passWarn", { when: Date.now() + 2000 })` |
| End the current pass in 2 seconds | **Active pass** | `chrome.alarms.create("passEnd", { when: Date.now() + 2000 })` |
| Finish the session in 2 seconds | **Running session** | `chrome.alarms.create("sessionEnd", { when: Date.now() + 2000 })` |
| Make the session end in 90 seconds. Prints "Start a session first" if none is running | **Running session** | `(async () => { const { session } = await chrome.storage.local.get("session"); if (!(session?.endsAt > Date.now())) return console.warn("Start a session first, then run this again."); session.endsAt = Date.now() + 90000; await chrome.storage.local.set({ session }); chrome.alarms.create("sessionEnd", { when: session.endsAt }); console.log("The session now ends in 90 seconds."); })()` |
| Pretend the session ran out while Chrome was closed (then reload the extension) | Nothing. Replaces any running session | `await chrome.storage.local.set({ session: { startedAt: Date.now() - 26 * 60000, endsAt: Date.now() - 60000, minutes: 25 } })` |
| Remove the stats | Nothing | `await chrome.storage.local.remove("stats")` |
| Bring back the Gemini reminder | Nothing | `await chrome.storage.local.remove("geminiOff")` |

An active pass also means a running session, since passes only exist during one.

## 1. Sessions

- [ ] 1.1 With no session running, the popup shows the 25, 50 and 90 minute buttons and **Start coding session**.
- [ ] 1.2 Pick 50 min, close the popup and reopen it. 50 is still selected.
- [ ] 1.3 Start a session. The popup shows a countdown, and the toolbar badge shows the minutes left.
- [ ] 1.4 Click **End session early** and confirm. The Start button comes back and the badge is empty.
- [ ] 1.5 Start a session and finish it with the console shortcut. "Sessions finished" goes up by 1, and AI sites open normally again.
- [ ] 1.6 End a session early. "Sessions finished" doesn't go up, but "focused minutes" does.

## 2. Blocking

- [ ] 2.1 During a session, `chatgpt.com` shows the block page.
- [ ] 2.2 Subdomains are blocked too: `www.perplexity.ai`.
- [ ] 2.3 `http://chatgpt.com` (not https) is blocked.
- [ ] 2.4 A few of the newer sites are blocked: `deepseek.com` (the homepage), `chat.mistral.ai`, `kimi.com`.
- [ ] 2.5 A site that isn't on the list, like `example.com`, opens normally.
- [ ] 2.6 Open `chatgpt.com` with no session running, then start a session. The tab switches to the block page.
- [ ] 2.7 With no session running, open `chatgpt.com`, then go to `example.com` in the same tab. Start a session and press Back. You land on the block page, not ChatGPT.
- [ ] 2.8 During a session, open `https://chatgpt.com/?q=a%26b`. The crossed-out address on the block page still shows `%26`.
- [ ] 2.9 With no session running, every site opens normally and the rules list from the console shortcut is empty.

## 3. Per-site passes and aliases

- [ ] 3.1 During a session, unlock `chatgpt.com`. ChatGPT opens, and the popup shows "Pass for chatgpt.com".
- [ ] 3.2 While that pass is active, `claude.ai` is still blocked.
- [ ] 3.3 While that pass is active, `www.chatgpt.com` opens.
- [ ] 3.4 Unlock `claude.ai`. Claude opens, and any ChatGPT tab switches to the block page.
- [ ] 3.5 Go to `chat.openai.com` and unlock it. You land on ChatGPT, not the block page again. The popup says "Pass for chatgpt.com".
- [ ] 3.6 Go to `kimi.moonshot.cn` and unlock it. You land on Kimi.
- [ ] 3.7 End the pass with the console shortcut. Tabs of that site switch back to the block page.
- [ ] 3.8 Keep the popup open (inspect it) and grant a pass in a tab. The pass line appears without reopening the popup.

## 4. Pass warnings and notifications

All notifications show the Focus Guard icon and the title "Focus Guard".

- [ ] 4.1 With a pass active for `claude.ai`, open `chatgpt.com`. Before you type anything, the block page shows "This will end your pass for claude.ai…".
- [ ] 4.2 Keep that page open and end the Claude pass with the console shortcut. The warning disappears on its own.
- [ ] 4.3 Unlock `claude.ai`, then unlock `chatgpt.com`. A notification says the pass moved to chatgpt.com and claude.ai is blocked again.
- [ ] 4.4 The re-blocked Claude tab shows the note "Your pass moved to chatgpt.com…".
- [ ] 4.5 After an unlock, use the "1 minute left" shortcut. A notification says "1 minute left on your [site] pass."
- [ ] 4.6 End the pass with the shortcut. A notification says the pass is over, and the site's tab shows "Your 5-minute pass for this site has ended."
- [ ] 4.7 Unlock a site, then click **End session early**. No pass notification appears, and the timers list from the console is empty.
- [ ] 4.8 Make the session end in 90 seconds with the shortcut, then unlock a site. When the session ends, no "1 minute left" or "pass over" notifications appear.
- [ ] 4.9 Unlocking the same site twice in a row doesn't show a "moved" notification.

## 5. Block page

- [ ] 5.1 The block page has its normal styling (graph paper background, highlighted "first.").
- [ ] 5.2 The checklist items cross out when ticked.
- [ ] 5.3 The unlock button stays disabled until you've typed 60 characters, and the counter counts down as you type.
- [ ] 5.4 Clicking the button starts a 60-second wait and locks the text box.
- [ ] 5.5 An ordinary block (typing a blocked site yourself) shows no note.
- [ ] 5.6 **Back to my code** after typing a blocked site: in a tab, open `example.com`, then type `chatgpt.com`. The button takes you back to `example.com`.
- [ ] 5.7 **Back to my code** after a tab was moved: open `example.com`, then `chatgpt.com` in the same tab, then start a session. The button takes you to `example.com`, not ChatGPT.
- [ ] 5.8 **Back to my code** with nothing to go back to: open `chatgpt.com` in a new tab during a session. The button closes the tab, or shows a new tab page if it's the only tab in the window.
- [ ] 5.9 Get blocked, end the session, then reload the block page. It takes you straight to the site.
- [ ] 5.10 With no session running, open `chrome-extension://<id>/src/blocked/blocked.html?u=https://example.com` (the id is on the Focus Guard card). It stays on the block page and doesn't open example.com.
- [ ] 5.11 In DevTools on the block page, the **Issues** tab shows no warnings from the page.

## 6. Stats

Note "AI visits blocked" and "passes used" in the popup before each step.

- [ ] 6.1 Visit a blocked site: "AI visits blocked" goes up by 1.
- [ ] 6.2 Reload the block page: no change.
- [ ] 6.3 Go to another page, then press Back to the block page: no change.
- [ ] 6.4 Keep a ChatGPT tab open and start a new session: no change for that tab.
- [ ] 6.5 Use a pass: "passes used" goes up by 1.
- [ ] 6.6 Reload a leftover block page after the session ends: neither number changes.
- [ ] 6.7 Remove the stats with the console shortcut, then unlock a site. The pass works, and the popup shows 1 pass used.

## 7. Site list editor

- [ ] 7.1 With no session running, expand **Blocked sites**. The list shows one domain per line.
- [ ] 7.2 Add `https://www.Example.com/page?x=1` and save. The list shows `example.com`.
- [ ] 7.3 Add `not a site` and `localhost` and save. Nothing is saved, both lines are listed in red, and your text stays in the box.
- [ ] 7.4 Add the same site twice and save. It appears once.
- [ ] 7.5 During a session, the list and **Save sites** are disabled.
- [ ] 7.6 Type in the box without saving and wait a few seconds. Your text stays.
- [ ] 7.7 Remove `pi.ai`, save, and reload the extension. `pi.ai` doesn't come back.
- [ ] 7.8 The red error text fits inside the popup without pushing anything out of place.

## 8. Welcome page and setup checklist

- [ ] 8.1 Clicking reload on the extension doesn't open the welcome page.
- [ ] 8.2 The popup's **Setup checklist** link opens the welcome page.
- [ ] 8.3 **Open Gemini settings** opens Chrome's Gemini in Chrome settings (or the main Settings page on Chrome versions without it).
- [ ] 8.4 Tick **I turned off Gemini in Chrome**. Step 1 shows **Done**. Untick it, and **Done** goes away.
- [ ] 8.5 **Open Focus Guard settings** opens Focus Guard's card on `chrome://extensions`.
- [ ] 8.6 **Send test notification** shows a Focus Guard notification, and the page says "Sent".
- [ ] 8.7 With Windows **Do not disturb** on, the test says "Sent" but no notification appears, matching the hint on the page.
- [ ] 8.8 In DevTools on the welcome page, the **Issues** tab shows no warnings from the page.

The first-install check (the welcome page opening on its own) is in section 11, because it means removing the extension.

## 9. Gemini reminder

- [ ] 9.1 With the reminder brought back (console shortcut), the popup shows "Chrome's built-in Gemini isn't blocked" below the session controls.
- [ ] 9.2 **Turn it off** opens the Gemini in Chrome settings.
- [ ] 9.3 Tick **I turned off Gemini in Chrome**. The reminder disappears.
- [ ] 9.4 With the reminder showing, the duration buttons, timer and **Start coding session** are in the same place as without it.
- [ ] 9.5 Unticking the box on the welcome page brings the popup reminder back.

## 10. Incognito

- [ ] 10.1 With **Allow in Incognito** off, the popup shows the Incognito note.
- [ ] 10.2 **Allow Focus Guard in Incognito** in the popup opens Focus Guard's card on `chrome://extensions`.
- [ ] 10.3 Turn on **Allow in Incognito**. If Chrome closes the welcome page, reopen it from the popup. Step 2 shows **Done**, and the popup note is gone.
- [ ] 10.4 During a session, `chatgpt.com` is blocked in an Incognito window.

## 11. Restarts and reloads

- [ ] 11.1 Start a session and reload the extension. The timers list still has `sessionEnd` and `tick`, and the badge still shows the minutes left.
- [ ] 11.2 Unlock a site and reload the extension straight away. The timers list has `passWarn` and `passEnd`.
- [ ] 11.3 Use the "ran out while Chrome was closed" shortcut, then reload the extension. "Sessions finished" goes up by 1, the badge is empty, and AI sites open.
- [ ] 11.4 Start a session, close Chrome completely and open it again. AI sites are still blocked, and the badge shows the minutes left.
- [ ] 11.5 After any reload, the service worker console shows no red errors starting with `Focus Guard:`.

## 12. Uninstall page and first install

Removing Focus Guard deletes its stats and settings, so do this section last.

- [ ] 12.1 Click **Remove** on Focus Guard. A tab opens on the README's **Removed Focus Guard?** section.
- [ ] 12.2 That section explains how to turn Gemini in Chrome back on.
- [ ] 12.3 Click **Load unpacked** and select the folder again. The welcome page opens on its own.
- [ ] 12.4 The default site list is back, and the stats start at 0.
