# Contributing to Focus Guard

Thanks for wanting to help! You don't need to be an expert. Small fixes and ideas are welcome too.

## Load the extension for development

Focus Guard is plain HTML, CSS and JavaScript. There's nothing to install or build.

1. Fork this repository on GitHub, then clone your fork to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the `focus-guard` folder.
5. After you edit a file, click the reload icon on the Focus Guard card to see your changes.

To test, start a session from the popup and open a blocked site such as `chatgpt.com`. Then go through the unlock flow.

## Run the tests

The tests check the background logic (sessions, blocking rules, passes) and the blocklist input cleaning without opening Chrome. You only need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

From the `focus-guard` folder, run:

```bash
node --test
```

Every test should show a ✔. The tests are in the `tests/` folder:

- `background.test.js` covers `src/background/background.js`
- `sites.test.js` covers `src/shared/sites.js`
- `links.test.js` covers `src/blocked/links.js`
- `manifest.test.js` checks that every file the extension points to exists
- `html.test.js` checks the popup and block page HTML (ARIA references, ids the scripts use)

If you change one of those files, add a test for your change too.

## Report a bug

Open an issue on the repository's **Issues** tab and include:

- What you did
- What you expected to happen
- What actually happened (a screenshot helps)
- Your Chrome version (you can find it at `chrome://version`)

Have an idea for a new feature? Open an issue for that too. Check [ROADMAP.md](ROADMAP.md) first to see what's already planned.

## Submit a pull request

1. Create a new branch for your change:

   ```bash
   git checkout -b fix-popup-timer
   ```

2. Make your change. Keep it small and focused on one thing.
3. Run `node --test`, then reload the extension and check that everything still works.
4. Commit and push your branch:

   ```bash
   git commit -m "Fix popup timer not updating"
   git push origin fix-popup-timer
   ```

5. Open a pull request on GitHub. Say what you changed and why. If it fixes an issue, link to that issue.

By contributing, you agree that your work will be released under the [MIT License](LICENSE).
