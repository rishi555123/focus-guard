# Contributing to Focus Guard

Thanks for wanting to help! You don't need to be an expert. Small fixes and ideas are welcome too.

## Load the extension for development

Focus Guard is plain HTML, CSS and JavaScript. There's nothing to install or build.

1. Fork this repository on GitHub, then clone your fork to your computer.
2. Open Chrome and go to `chrome://extensions`, or open Edge and go to `edge://extensions`.
3. Turn on **Developer mode** (top-right corner in Chrome, in the left-hand panel in Edge).
4. Click **Load unpacked** and select the `focus-guard` folder.
5. After you edit a file, click the reload icon on the Focus Guard card to see your changes.

To test, start a session from the popup and open a blocked site such as `chatgpt.com`. Then go through the unlock flow.

One codebase works in both browsers. Anything that differs between them, like the wording and the settings pages, lives in `src/shared/browser.js`, so check it in both if you can.

## Add a block page question

The block page shows 3 random debugging questions and 3 random problem-solving questions each time it opens. They come from `src/blocked/questions.js`. To add one, add a line to the `debugging` or `problemSolving` list:

```js
"Did you read the function's return type?",
```

Keep it short, end it with a question mark, and run `node --test` to check it.

## Change a session length, pass length or unlock limit

The session lengths, the 5-minute pass, the unlock limits (20 characters per answer, a 60-second wait) and how many days of history to keep all live in `src/shared/constants.js`. Every label and message in the extension is built from there, and `node --test` fails if one of these numbers is typed out anywhere else in `src/`.

The docs can't read that file, so they repeat the numbers. When you change one, update these too:

- `README.md`: How Focus Guard solves it, Features, How to use it
- `PRIVACY.md` and `site/privacy.html`: the pass length and the days of history, kept matching each other
- `site/index.html`: How it works
- `TESTING.md`: the steps that wait out a pass or the unlock
- `docs/store-listing.md`: the store description

Don't change the numbers in `CHANGELOG.md` or `site/releases.html` for versions already released; they describe those versions.

## Run the tests

The tests check the background logic (sessions, blocking rules, passes), the blocklist input cleaning, browser detection and the block page questions without opening a browser. You only need [Node.js](https://nodejs.org) 22 or newer. There's nothing to install.

From the `focus-guard` folder, run:

```bash
node --test
```

Every test should show a ✔. The tests are in the `tests/` folder:

- `background.test.js` covers `src/background/background.js`
- `sites.test.js` covers `src/shared/sites.js`
- `links.test.js` covers `src/blocked/links.js`
- `browser.test.js` covers `src/shared/browser.js` (telling Edge from Chrome, and each browser's wording and settings pages)
- `questions.test.js` covers `src/blocked/questions.js` (picking 3 + 3 random questions)
- `manifest.test.js` checks that every file the extension points to exists
- `html.test.js` checks the popup and block page HTML (ARIA references, ids the scripts use)
- `docs.test.js` checks that every checklist line in `TESTING.md` is a real `- [ ] ` checkbox with a unique number
- `site.test.js` checks the website in `site/`: every link and image resolves inside `site/`, nothing points outside it, and the releases and privacy pages match `CHANGELOG.md` and `PRIVACY.md`

If you change one of those files, add a test for your change too.

GitHub runs these same tests on Node 22, 24 and 26 for every push and pull request to `main`. You can see the results on the repository's **Actions** tab, and on your pull request.

## Work on the website

The website in `site/` is plain HTML, CSS and a little JavaScript, with no build step. Open `site/index.html` in your browser to look at it. To deploy it, drag the `site/` folder onto Netlify Drop, or connect the repository to Netlify, which reads `netlify.toml`.

Keep `site/` self-contained: copy any image or file it needs into `site/` itself, and never link to `../docs` or `../src`. Each version on `site/releases.html` has a download button for its own `focus-guard-<version>.zip` on GitHub. When you add a release, give the new entry the **Latest** badge and the solid button, and move the old one to an outlined button with the note about older versions. `node --test` checks this. When you change `CHANGELOG.md` or `PRIVACY.md`, update `site/releases.html` or `site/privacy.html` to match. `node --test` checks all of this.

## Test in Chrome and Edge

Some things only show up in a real browser, like redirects, notifications and settings pages. [TESTING.md](TESTING.md) has a manual checklist for every feature, plus console shortcuts for testing timers without waiting. Before opening a pull request, go through the sections your change touches.

## Report a bug

Open an issue on the repository's **Issues** tab and include:

- What you did
- What you expected to happen
- What actually happened (a screenshot helps)
- Your browser and its version (you can find it at `chrome://version` or `edge://version`)

Have an idea for a new feature? Open an issue for that too. Check [ROADMAP.md](ROADMAP.md) first to see what's already planned.

## Submit a pull request

1. Create a new branch for your change:

   ```bash
   git checkout -b fix-popup-timer
   ```

2. Make your change. Keep it small and focused on one thing.
3. Run `node --test`, then reload the extension and go through the matching sections of [TESTING.md](TESTING.md).
4. Commit and push your branch:

   ```bash
   git commit -m "Fix popup timer not updating"
   git push origin fix-popup-timer
   ```

5. Open a pull request on GitHub. Say what you changed and why. If it fixes an issue, link to that issue.

By contributing, you agree that your work will be released under the [MIT License](LICENSE).
