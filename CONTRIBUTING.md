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

The tests check the extension's logic, pages, styles and icons, the manifest, the docs and the website, without opening a browser. You only need [Node.js](https://nodejs.org) 22 or newer. There's nothing to install.

From the `focus-guard` folder, run:

```bash
node --test
```

Every test should show a ✔. The tests are in the `tests/` folder:

- `background.test.js` covers `src/background/background.js`: sessions, rules, passes, stats, migrations from 1.0.0, and the normal and Incognito copies working side by side
- `popup.test.js` and `blocked.test.js` run the popup and the block page against a stand-in page and `chrome` API
- `sites.test.js`, `reason.test.js`, `streaks.test.js`, `theme.test.js`, `constants.test.js` and `links.test.js` cover the files in `src/shared/` and `src/blocked/links.js`. `constants.test.js` also fails if one of the numbers from `src/shared/constants.js` is typed out anywhere else in `src/`
- `browser.test.js` covers `src/shared/browser.js` (telling Edge from Chrome, and each browser's wording and settings pages)
- `questions.test.js` covers `src/blocked/questions.js` (picking 3 + 3 random questions)
- `style.test.js` checks the extension's colours meet WCAG AA contrast in light and dark, and `icons.test.js` checks the toolbar icons stand out on light and dark toolbars
- `manifest.test.js` checks that every file the extension points to exists, and exactly which files websites can load
- `html.test.js` checks the popup and block page HTML (ARIA references, ids the scripts use)
- `docs.test.js` checks that every checklist line in `TESTING.md` is a real `- [ ] ` checkbox with a unique number
- `site.test.js` checks the website in `site/`: links and images, contrast, the theme toggle, and that the releases and privacy pages match `CHANGELOG.md` and `PRIVACY.md`

`fake-popup.js`, `png.js` and `contrast.js` are helpers the tests share, not tests themselves.

If you change one of those files, add a test for your change too.

GitHub runs these same tests on Node 22, 24 and 26 for every push and pull request to `main`. You can see the results on the repository's **Actions** tab, and on your pull request.

## Work on the website

The website in `site/` is plain HTML, CSS and a little JavaScript, with no build step. Open `site/index.html` in your browser to look at it, or serve the folder (for example `python -m http.server -d site`) to try the theme toggle and links as they work online. Netlify is linked to this repository and deploys `site/` from `main` automatically, so a merged pull request is live a minute or two later. It skips the deploy when a merge doesn't touch `site/` or `netlify.toml`.

Keep `site/` self-contained: copy any image or file it needs into `site/` itself, and never link to `../docs` or `../src`. Each version on `site/releases.html` has a download button for its own `focus-guard-<version>.zip` on GitHub. When you add a release, give the new entry the **Latest** badge and the solid button, and move the old one to an outlined button with the note about older versions. `node --test` checks this. When you change `CHANGELOG.md` or `PRIVACY.md`, update `site/releases.html` or `site/privacy.html` to match. `node --test` checks all of this.

## Change the icons or the logo

Every icon and logo is made from the master files in `docs/brand/` by `docs/brand/make-icons.py` (Python 3 with Pillow, NumPy and SciPy). Run it from the repository root after changing the master, then run `node --test`: `icons.test.js` checks the toolbar icons still stand out on light and dark toolbars.

## Test in Chrome and Edge

Some things only show up in a real browser, like redirects, notifications and settings pages. [TESTING.md](TESTING.md) has a manual checklist for every feature, plus console shortcuts for testing timers without waiting. Before opening a pull request, go through the sections your change touches.

## Make a release

1. Bump `version` in `manifest.json`.
2. In `CHANGELOG.md`, rename `[Unreleased]` to `[x.y.z] - <date>` with a one-line summary, add an empty `[Unreleased]` above it, and update the links at the bottom.
3. Add the version to `site/releases.html` with the same text, the **Latest** badge and its download button, and move the previous version to an outlined button with the note about older versions.
4. Update the README, the website and `TESTING.md` for anything new, and run through `TESTING.md` in Chrome and Edge.
5. Run `node --test`, then merge to `main` with a merge commit.
6. Build both zips from the merged commit:

   ```bash
   git -c core.autocrlf=false archive --format=zip -9 -o dist/focus-guard-x.y.z.zip HEAD manifest.json src icons
   ```

   and copy it to `dist/focus-guard.zip`, the name the website's download buttons use.
7. Tag the merge commit `vx.y.z`, push the tag, and create the GitHub release "Focus Guard x.y.z" with the CHANGELOG section as notes and both zips attached.
8. Check the live site: the releases page shows the new version, and the download links give the new zip.

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
