// Light or dark theme for the popup, the setup checklist and the block page.
// Loaded in each page's <head>, after style.css and before anything draws, so a page never
// flashes the wrong theme. It sets data-theme="light" or "dark" on <html>; style.css does the rest.
//
// The choice is saved in chrome.storage.local as "theme": "light" or "dark", or nothing for
// Auto (follow the system setting). chrome.storage can't be read before the page draws, and
// extension pages can't run inline scripts, so a copy of the choice in localStorage (shared
// by every extension page) is applied first, then checked against chrome.storage.

const THEME_KEY = "theme";
const THEME_CHOICES = ["light", "dark"]; // anything else means Auto
const systemDark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
let themeChoice = null; // "light", "dark" or null for Auto
let themeChanged = false; // set once the choice changes, so the first read can't undo it

const pickedTheme = (theme) => (THEME_CHOICES.includes(theme) ? theme : null);

function applyTheme(theme) {
  themeChoice = pickedTheme(theme);
  document.documentElement.dataset.theme = themeChoice || (systemDark?.matches ? "dark" : "light");
}

// The copy in localStorage. Storage can be blocked, which only costs the head start.
function rememberTheme(theme) {
  try {
    if (pickedTheme(theme)) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch (_) {}
}

// Used by the popup's Auto / Light / Dark buttons ("auto" or anything else means Auto)
async function setTheme(theme) {
  themeChanged = true;
  applyTheme(theme);
  rememberTheme(theme);
  if (pickedTheme(theme)) await chrome.storage.local.set({ [THEME_KEY]: theme });
  else await chrome.storage.local.remove(THEME_KEY);
}

let savedCopy = null;
try { savedCopy = localStorage.getItem(THEME_KEY); } catch (_) {}
applyTheme(savedCopy);

// chrome.storage has the real choice: catch up if the copy was missing or out of date
chrome.storage.local.get(THEME_KEY).then((saved) => {
  if (themeChanged) return; // a newer choice already arrived
  applyTheme(saved[THEME_KEY]);
  rememberTheme(saved[THEME_KEY]);
});

// Follow changes made in the popup while this page is open, and the system setting in Auto
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(THEME_KEY in changes)) return;
  themeChanged = true;
  applyTheme(changes[THEME_KEY].newValue);
});
systemDark?.addEventListener("change", () => { if (!themeChoice) applyTheme(null); });
