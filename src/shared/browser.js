// Which browser Focus Guard is running in, and the wording and settings pages
// that go with it. Loaded by the popup, the block page and the welcome page, and by the tests.

// Microsoft recommends User-Agent Client Hints for this, checking the brand by name
// rather than by position, with the "Edg/" token in the user agent as the legacy fallback:
// https://learn.microsoft.com/en-us/microsoft-edge/web-platform/user-agent-guidance
// Other Chromium browsers (Brave, Opera and so on) get the Chrome wording.
function detectBrowser(nav) {
  const brands = nav && nav.userAgentData && nav.userAgentData.brands;
  if (Array.isArray(brands) && brands.length) {
    return brands.some((b) => b && b.brand === "Microsoft Edge") ? "edge" : "chrome";
  }
  return /\bEdg\//.test((nav && nav.userAgent) || "") ? "edge" : "chrome";
}

const BROWSERS = {
  chrome: {
    id: "chrome",
    text: { browser: "Chrome", private: "Incognito", notifyApp: "Google Chrome" },
    extensionsPage: "chrome://extensions",
    newTab: "chrome://newtab/",
    // Chrome's built-in AI: turning it off is a recommended setup step
    assistant: {
      name: "Gemini in Chrome",
      settingsUrl: "chrome://settings/ai/gemini", // Chrome shows main Settings if this sub-page doesn't exist
      storageKey: "geminiOff",
      optional: false
    }
  },
  edge: {
    id: "edge",
    text: { browser: "Edge", private: "InPrivate", notifyApp: "Microsoft Edge" },
    extensionsPage: "edge://extensions",
    newTab: "edge://newtab/",
    // Edge's built-in AI: turning it off is an optional setup step
    assistant: {
      name: "Copilot in Edge",
      settingsUrl: "edge://settings/appearance/copilotAndSidebar", // Settings > Appearance > Copilot and sidebar
      storageKey: "copilotOff",
      optional: true
    }
  }
};

const BROWSER = BROWSERS[detectBrowser(typeof navigator === "undefined" ? undefined : navigator)];

// Show only the parts of a page meant for this browser (data-browser="chrome" or "edge",
// hidden in the HTML until now so the wrong one never flashes up), and fill in
// browser-specific words (data-text="browser", "private" or "notifyApp").
function applyBrowserText(root) {
  for (const el of root.querySelectorAll("[data-browser]")) el.hidden = el.dataset.browser !== BROWSER.id;
  for (const el of root.querySelectorAll("[data-text]")) {
    if (BROWSER.text[el.dataset.text]) el.textContent = BROWSER.text[el.dataset.text];
  }
}
